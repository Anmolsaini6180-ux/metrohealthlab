import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import {
  createTeamMember,
  getStaffDirectory,
  getTeamMembers,
  revokeStaffMember,
  updateTeamMemberStatus,
  upsertStaffMember,
} from "@/services/adminTeamService";
import type { AdminRole, StaffDirectoryEntry } from "@/types/team";
import { assignableRoles, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/utils/roleAccess";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import TeamTree from "@/components/admin/TeamTree";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

const ALL_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

// Admin & Staff management. Everything on this screen is a thin shell
// over Cloud Function calls — upsertStaffMember / revokeStaffMember /
// getStaffDirectory — each of which re-derives the caller's own role
// from their signed ID token and enforces the hierarchy itself. What
// this page shows or hides is convenience; it is never the boundary.
export default function AdminTeamPage() {
  const { role } = useAdminRole();
  const { showToast } = useToast();
  const staff = useAsync(() => getStaffDirectory(), []);
  const [showForm, setShowForm] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<StaffDirectoryEntry | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const creatable = assignableRoles(role);

  const filtered = useMemo(() => {
    let list = staff.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) => m.email.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q)
      );
    }
    if (roleFilter) list = list.filter((m) => m.role === roleFilter);
    if (statusFilter === "pending") list = list.filter((m) => m.pending && m.status === "active");
    else if (statusFilter) list = list.filter((m) => m.status === statusFilter);
    return list;
  }, [staff.data, search, roleFilter, statusFilter]);

  async function handleRoleChange(member: StaffDirectoryEntry, nextRole: AdminRole) {
    if (nextRole === member.role) return;
    setRowBusy(member.email);
    try {
      await upsertStaffMember({ email: member.email, name: member.name, role: nextRole });
      showToast(`${member.email} is now ${ROLE_LABELS[nextRole]}.`);
      staff.retry();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    } finally {
      setRowBusy(null);
    }
  }

  async function handleReactivate(member: StaffDirectoryEntry) {
    setRowBusy(member.email);
    try {
      await upsertStaffMember({ email: member.email, name: member.name, role: member.role });
      showToast(`${member.email} reactivated.`);
      staff.retry();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    } finally {
      setRowBusy(null);
    }
  }

  async function handleConfirmRevoke() {
    if (!pendingRevoke) return;
    setConfirmBusy(true);
    try {
      await revokeStaffMember(pendingRevoke.email);
      showToast(`Admin access removed for ${pendingRevoke.email}.`);
      setPendingRevoke(null);
      staff.retry();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Admin &amp; Staff</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
            Add someone by their Google/email address and pick a role. They sign in normally and land
            straight in the admin dashboard with exactly that role's permissions.
          </p>
        </div>
        {creatable.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Add staff member"}
          </button>
        )}
      </div>

      {showForm && creatable.length > 0 && (
        <AddStaffForm
          creatableRoles={creatable}
          onDone={() => {
            setShowForm(false);
            staff.retry();
          }}
        />
      )}

      <div className="mh-filter-row">
        <input
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 180 }}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ flex: "0 1 180px" }}>
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: "0 1 180px" }}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="pending">Pending first sign-in</option>
          <option value="revoked">Access removed</option>
        </select>
      </div>

      {staff.loading && <LoadingState rows={3} />}
      {staff.error && <ErrorState message={staff.error} onRetry={staff.retry} />}
      {staff.data && filtered.length === 0 && (
        <EmptyState icon="groups" title="No staff match these filters" />
      )}

      {filtered.length > 0 && (
        <div className="mh-scroll-x">
          <table className="mh-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                // The master admin's access comes from the server's
                // MASTER_ADMIN_EMAIL setting, so there is nothing here
                // to edit — the server refuses these calls for that
                // address regardless of what the UI renders.
                const editable = !m.isMasterAdmin && assignableRoles(role).includes(m.role);
                const busy = rowBusy === m.email;
                return (
                  <tr key={m.email}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{m.name || m.email}</span>
                      {m.name && (
                        <>
                          <br />
                          <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{m.email}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <select
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => handleRoleChange(m, e.target.value as AdminRole)}
                          aria-label={`Role for ${m.email}`}
                        >
                          {assignableRoles(role).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="mh-pill">{ROLE_LABELS[m.role]}</span>
                      )}
                    </td>
                    <td>
                      {m.isMasterAdmin ? (
                        <span className="mh-pill mh-pill--info">Master admin</span>
                      ) : m.status === "revoked" ? (
                        <span className="mh-pill mh-pill--danger">Access removed</span>
                      ) : m.pending ? (
                        <span className="mh-pill mh-pill--warn">Pending first sign-in</span>
                      ) : (
                        <span className="mh-pill mh-pill--ok">Active</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {m.isMasterAdmin ? (
                        <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                          Configured server-side
                        </span>
                      ) : m.status === "revoked" ? (
                        <button className="btn btn-outline" disabled={busy || !editable} onClick={() => handleReactivate(m)}>
                          Restore access
                        </button>
                      ) : (
                        <button className="btn btn-danger" disabled={busy || !editable} onClick={() => setPendingRevoke(m)}>
                          Remove access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReportingHierarchy />

      {pendingRevoke && (
        <ConfirmDialog
          title="Remove admin access?"
          message={`${pendingRevoke.email} will lose their ${ROLE_LABELS[pendingRevoke.role]} role. Their sign-in session is ended immediately and signing in again will not restore it. You can grant access again later.`}
          confirmLabel="Remove access"
          busy={confirmBusy}
          onConfirm={handleConfirmRevoke}
          onCancel={() => setPendingRevoke(null)}
        />
      )}
    </div>
  );
}

// One form, two provisioning paths. Leaving the password field empty
// is the normal case: the person just signs in with Google and the
// role is applied on the spot. Filling it in creates a Firebase Auth
// account with that password too, for staff who don't have (or won't
// use) a Google account — the pre-existing createTeamMember flow.
function AddStaffForm({ creatableRoles, onDone }: { creatableRoles: AdminRole[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AdminRole>(creatableRoles[0]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [withPassword, setWithPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (withPassword) {
        await createTeamMember({
          name,
          email,
          phone: phone || undefined,
          role,
          temporaryPassword,
        });
      } else {
        const result = await upsertStaffMember({
          email,
          name: name || undefined,
          phone: phone || undefined,
          role,
        });
        if (result.pending) {
          setNotice(
            `${result.email} will get ${ROLE_LABELS[role]} access the first time they sign in with this email.`
          );
        }
      }
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card mh-form-grid" onSubmit={handleSubmit}>
      <label>
        Email (their Google / sign-in address)
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Full name {withPassword ? "" : "(optional)"}
        <input required={withPassword} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Phone (optional)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
          {creatableRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", gridColumn: "1 / -1" }}>
        {ROLE_DESCRIPTIONS[role]}
      </p>

      <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={withPassword}
          onChange={(e) => setWithPassword(e.target.checked)}
        />
        <span style={{ fontSize: "var(--text-sm)" }}>
          They don't use Google sign-in — create an email/password account instead
        </span>
      </label>
      {withPassword && (
        <label style={{ gridColumn: "1 / -1" }}>
          Temporary password (share it with them securely)
          <input
            type="text"
            required
            minLength={6}
            value={temporaryPassword}
            onChange={(e) => setTemporaryPassword(e.target.value)}
          />
        </label>
      )}

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", gridColumn: "1 / -1" }}>{error}</p>
      )}
      {notice && (
        <p style={{ color: "var(--color-success)", fontSize: "var(--text-sm)", gridColumn: "1 / -1" }}>{notice}</p>
      )}
      <div style={{ gridColumn: "1 / -1" }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : withPassword ? "Create account" : "Grant access"}
        </button>
      </div>
    </form>
  );
}

// The pre-existing reporting-hierarchy view, kept intact. It reads the
// users collection through getTeamMembers (hierarchy-scoped
// server-side) rather than the email-keyed directory above, because
// only accounts that actually exist have a uid to hang a tree off.
// Deactivating from here disables the Firebase Auth account itself —
// a stronger action than removing the admin role, which is why both
// controls exist.
function ReportingHierarchy() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const members = useAsync(() => (open ? getTeamMembers() : Promise.resolve([])), [open]);

  function handleToggleStatus(uid: string, current: "active" | "inactive") {
    const next = current === "active" ? "inactive" : "active";
    updateTeamMemberStatus(uid, next)
      .then(() => {
        showToast(next === "active" ? "Account reactivated." : "Account deactivated.");
        members.retry();
      })
      .catch((err) => showToast(toUserMessage(err), "error"));
  }

  return (
    <section style={{ marginTop: "var(--space-lg)" }}>
      <button className="btn btn-outline" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide reporting hierarchy" : "Show reporting hierarchy"}
      </button>
      {open && (
        <div style={{ marginTop: "var(--space-md)" }}>
          {members.loading && <LoadingState rows={2} />}
          {members.error && <ErrorState message={members.error} onRetry={members.retry} />}
          {members.data && members.data.length === 0 && (
            <EmptyState icon="account_tree" title="Nobody reports to you yet" />
          )}
          {members.data && members.data.length > 0 && (
            <TeamTree members={members.data} onToggleStatus={handleToggleStatus} />
          )}
        </div>
      )}
    </section>
  );
}

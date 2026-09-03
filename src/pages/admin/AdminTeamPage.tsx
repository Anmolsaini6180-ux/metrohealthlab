import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import {
  changeStaffRole,
  getStaffDirectory,
  getTeamMembers,
  grantStaffRoleByEmail,
  restoreStaffMember,
  revokeStaffMember,
  updateTeamMemberStatus,
} from "@/services/adminTeamService";
import type { AdminRole, StaffContext, StaffDirectoryEntry, TeamMember } from "@/types/team";
import {
  assignableRoles,
  canEditStaffMember,
  canManageStaff,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@/utils/roleAccess";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import TeamTree from "@/components/admin/TeamTree";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

const ALL_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

// Admin & Staff management. Every action on this screen is an ordinary
// Firestore write to users/{uid}, gated by firestore.rules — the rules
// re-read the caller's own record and re-derive the hierarchy for
// themselves, so what this page shows or hides is convenience only and
// never the boundary. There are no Cloud Functions involved, which is
// what makes it work on the Spark plan.
export default function AdminTeamPage() {
  const staffContext = useAdminRole();
  const { role, loading: roleLoading } = staffContext;
  const { showToast } = useToast();
  const staff = useAsync(
    () => (canManageStaff(role) ? getStaffDirectory(staffContext) : Promise.resolve([])),
    [role, staffContext.uid]
  );
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
    if (statusFilter === "active") list = list.filter((m) => m.status === "active");
    else if (statusFilter) list = list.filter((m) => m.status !== "active");
    return list;
  }, [staff.data, search, roleFilter, statusFilter]);

  async function handleRoleChange(member: StaffDirectoryEntry, nextRole: AdminRole) {
    if (nextRole === member.role) return;
    setRowBusy(member.uid);
    try {
      await changeStaffRole(staffContext, member, nextRole);
      showToast(`${member.email || member.uid} is now ${ROLE_LABELS[nextRole]}.`);
      staff.retry();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    } finally {
      setRowBusy(null);
    }
  }

  async function handleReactivate(member: StaffDirectoryEntry) {
    setRowBusy(member.uid);
    try {
      await restoreStaffMember(staffContext, member);
      showToast(`${member.email || member.uid} reactivated.`);
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
      await revokeStaffMember(staffContext, pendingRevoke);
      showToast(`Admin access removed for ${pendingRevoke.email || pendingRevoke.uid}.`);
      setPendingRevoke(null);
      staff.retry();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    } finally {
      setConfirmBusy(false);
    }
  }

  if (roleLoading) return <LoadingState label="Checking access..." />;

  // A collection agent (or an account whose role was just revoked) has
  // no business here. The rules deny the underlying reads regardless;
  // this is just a clearer message than an empty table.
  if (!canManageStaff(role)) {
    return (
      <EmptyState
        icon="lock"
        title="You don't have permission to manage staff"
        description="Only a Super Admin, Admin or Sub Admin can view and change staff access."
      />
    );
  }

  return (
    <div>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Admin &amp; Staff</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
            The person signs in once with their Google account, then you grant them a role here by
            that same email address. They land straight in the admin dashboard with exactly that
            role's permissions.
          </p>
        </div>
        {creatable.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Add staff member"}
          </button>
        )}
      </div>

      {!staffContext.masterUid && (
        <p
          className="card"
          style={{ fontSize: "var(--text-sm)", color: "var(--color-danger)", marginBottom: "var(--space-md)" }}
        >
          This project has no master admin configured yet. Create the <code>system/config</code>{" "}
          document with a <code>masterAdminUid</code> field in the Firebase Console — see
          DEPLOYMENT.md.
        </p>
      )}

      {showForm && creatable.length > 0 && (
        <AddStaffForm
          caller={staffContext}
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
                // The master admin's authority comes from the
                // system/config document, which no client can write —
                // there is nothing here to edit, and the rules refuse
                // any write to that account regardless of what the UI
                // renders. The same is true of your own row.
                const editable = canEditStaffMember(staffContext, m);
                const busy = rowBusy === m.uid;
                return (
                  <tr key={m.uid}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{m.name || m.email || m.uid}</span>
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
                          aria-label={`Role for ${m.email || m.uid}`}
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
                      ) : m.status !== "active" ? (
                        <span className="mh-pill mh-pill--danger">Access removed</span>
                      ) : (
                        <span className="mh-pill mh-pill--ok">Active</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {m.isMasterAdmin ? (
                        <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                          Configured in system/config
                        </span>
                      ) : m.uid === staffContext.uid ? (
                        <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                          This is you
                        </span>
                      ) : m.status !== "active" ? (
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

      <ReportingHierarchy caller={staffContext} />

      {pendingRevoke && (
        <ConfirmDialog
          title="Remove admin access?"
          message={`${pendingRevoke.email || pendingRevoke.uid} will lose their ${ROLE_LABELS[pendingRevoke.role]} role. It stops applying on their very next request — they do not have to be signed out first. You can restore access again later.`}
          confirmLabel="Remove access"
          busy={confirmBusy}
          onConfirm={handleConfirmRevoke}
          onCancel={() => setPendingRevoke(null)}
        />
      )}
    </div>
  );
}

// Granting a role needs an account that already exists: profiles.email
// is only populated once someone has actually signed in once (Google
// or email/password), so the flow is "they sign in first, you grant
// second". The lookup goes through the grant_staff_role_by_email RPC,
// which reads profiles.email server-side and raises a clear error if
// no matching account has ever signed in yet.
function AddStaffForm({
  caller,
  creatableRoles,
  onDone,
}: {
  caller: StaffContext;
  creatableRoles: AdminRole[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>(creatableRoles[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await grantStaffRoleByEmail(caller, email, role);
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
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", gridColumn: "1 / -1" }}>
        They must have signed in to this site at least once with that address before you can grant
        them a role.
      </p>

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", gridColumn: "1 / -1" }}>{error}</p>
      )}
      <div style={{ gridColumn: "1 / -1" }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Grant access"}
        </button>
      </div>
    </form>
  );
}

// The reporting-hierarchy view, kept intact. It reads the same
// hierarchy-scoped users query as the directory above and renders it
// as a tree using the denormalized ownership chain.
function ReportingHierarchy({ caller }: { caller: StaffContext }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const members = useAsync(() => (open ? getTeamMembers(caller) : Promise.resolve([])), [open, caller.uid]);

  function handleToggleStatus(member: TeamMember) {
    const next = member.status === "active" ? "revoked" : "active";
    updateTeamMemberStatus(caller, member, next)
      .then(() => {
        showToast(next === "active" ? "Access restored." : "Access removed.");
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

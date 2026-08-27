import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { createTeamMember, getTeamMembers, updateTeamMemberStatus } from "@/services/adminTeamService";
import { CREATABLE_ROLES, type AdminRole, type TeamMember } from "@/types/team";
import TeamTree from "@/components/admin/TeamTree";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import StatusBadge from "@/components/admin/StatusBadge";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

const ROLES: AdminRole[] = ["ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

export default function AdminTeamPage() {
  const { role } = useAdminRole();
  const { showToast } = useToast();
  const members = useAsync(() => getTeamMembers(), []);
  const [showForm, setShowForm] = useState(false);
  const [pendingDeactivation, setPendingDeactivation] = useState<TeamMember | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const creatable = role ? CREATABLE_ROLES[role] : [];

  const filtered = useMemo(() => {
    let list = members.data ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    if (roleFilter) list = list.filter((m) => m.role === roleFilter);
    if (statusFilter) list = list.filter((m) => m.status === statusFilter);
    return list;
  }, [members.data, search, roleFilter, statusFilter]);

  function handleToggleStatus(uid: string, current: "active" | "inactive") {
    if (current === "active") {
      // Deactivating is the destructive direction — confirm first.
      const member = (members.data ?? []).find((m) => m.uid === uid);
      if (member) setPendingDeactivation(member);
      return;
    }
    // Reactivating isn't destructive — no confirmation needed.
    updateTeamMemberStatus(uid, "active")
      .then(() => {
        showToast(`${(members.data ?? []).find((m) => m.uid === uid)?.name ?? "Team member"} reactivated.`);
        members.retry();
      })
      .catch((err) => showToast(toUserMessage(err), "error"));
  }

  async function handleConfirmDeactivate() {
    if (!pendingDeactivation) return;
    setConfirmBusy(true);
    try {
      await updateTeamMemberStatus(pendingDeactivation.uid, "inactive");
      showToast(`${pendingDeactivation.name} deactivated.`);
      setPendingDeactivation(null);
      members.retry();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Team</h1>
        {creatable.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Add team member"}
          </button>
        )}
      </div>

      {showForm && creatable.length > 0 && (
        <CreateTeamMemberForm
          creatableRoles={creatable}
          onCreated={() => {
            setShowForm(false);
            members.retry();
          }}
        />
      )}

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-md)" }}>
        <input
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">Active & inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {members.loading && <LoadingState rows={3} />}
      {members.error && <ErrorState message={members.error} onRetry={members.retry} />}
      {members.data && filtered.length === 0 && <EmptyState icon="groups" title="No team members match" />}
      {filtered.length > 0 && (search || roleFilter || statusFilter) && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {filtered.map((m) => (
            <div key={m.uid} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{m.name} <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>({m.role})</span></p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{m.email}{m.phone ? ` • ${m.phone}` : ""}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge status={m.status} />
                <button className="btn btn-outline" onClick={() => handleToggleStatus(m.uid, m.status)}>
                  {m.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length > 0 && !(search || roleFilter || statusFilter) && (
        <TeamTree members={filtered} onToggleStatus={handleToggleStatus} />
      )}
      {pendingDeactivation && (
        <ConfirmDialog
          title="Deactivate team member?"
          message={`${pendingDeactivation.name} will no longer be able to sign in. You can reactivate them anytime.`}
          confirmLabel="Deactivate"
          busy={confirmBusy}
          onConfirm={handleConfirmDeactivate}
          onCancel={() => setPendingDeactivation(null)}
        />
      )}
    </div>
  );
}

function CreateTeamMemberForm({ creatableRoles, onCreated }: { creatableRoles: AdminRole[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AdminRole>(creatableRoles[0]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTeamMember({ name, email, phone: phone || undefined, role, temporaryPassword });
      onCreated();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
      <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
        {creatableRoles.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Temporary password (share with them securely)"
        required
        minLength={6}
        value={temporaryPassword}
        onChange={(e) => setTemporaryPassword(e.target.value)}
      />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Creating..." : "Create account"}
      </button>
    </form>
  );
}

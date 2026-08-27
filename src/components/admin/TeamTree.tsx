import type { TeamMember } from "@/types/team";

interface TeamNode extends TeamMember {
  children: TeamNode[];
}

// Builds a tree from the flat list getTeamMembers returns. Every level
// carries its full ancestor chain (superAdminId/adminId/subAdminId),
// so parenting is just "whichever of my chain fields points at
// another member in this same list, one level up" — no extra fetch
// needed.
function buildTree(members: TeamMember[]): TeamNode[] {
  const byUid = new Map<string, TeamNode>(members.map((m) => [m.uid, { ...m, children: [] }]));
  const roots: TeamNode[] = [];

  for (const node of byUid.values()) {
    const parentUid =
      node.role === "ADMIN"
        ? undefined // ADMIN's parent is the SUPER_ADMIN, who isn't in a SUPER_ADMIN's own team list (they're the viewer)
        : node.role === "SUB_ADMIN"
          ? node.adminId
          : node.role === "COLLECTION_AGENT"
            ? node.subAdminId
            : undefined;

    const parent = parentUid ? byUid.get(parentUid) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface TeamTreeProps {
  members: TeamMember[];
  onToggleStatus: (member: TeamMember) => void;
}

export default function TeamTree({ members, onToggleStatus }: TeamTreeProps) {
  const tree = buildTree(members);
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {tree.map((node) => (
        <TeamNodeRow key={node.uid} node={node} depth={0} onToggleStatus={onToggleStatus} />
      ))}
    </div>
  );
}

function TeamNodeRow({ node, depth, onToggleStatus }: { node: TeamNode; depth: number; onToggleStatus: TeamTreeProps["onToggleStatus"] }) {
  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ fontWeight: 600 }}>
            {depth > 0 && "└ "}
            {node.name} <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>({node.role})</span>
          </p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{node.email}{node.phone ? ` • ${node.phone}` : ""}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "var(--text-xs)", color: node.status === "active" ? "var(--color-success)" : "var(--color-danger)" }}>
            {node.status}
          </span>
          <button className="btn btn-outline" onClick={() => onToggleStatus(node)}>
            {node.status === "active" ? "Remove access" : "Restore access"}
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
          {node.children.map((child) => (
            <TeamNodeRow key={child.uid} node={child} depth={depth + 1} onToggleStatus={onToggleStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

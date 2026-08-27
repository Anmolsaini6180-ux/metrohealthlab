const STATUS_COLORS: Record<string, string> = {
  // booking/general
  active: "var(--color-success)",
  completed: "var(--color-success)",
  confirmed: "var(--color-success)",
  success: "var(--color-success)",
  ready: "var(--color-success)",
  inactive: "var(--color-danger)",
  cancelled: "var(--color-danger)",
  failed: "var(--color-danger)",
  refunded: "var(--color-danger)",
  payment_pending: "var(--color-amber)",
  pending: "var(--color-amber)",
  processing: "var(--color-amber)",
  assigned: "var(--color-primary)",
  on_the_way: "var(--color-primary)",
  arrived: "var(--color-primary)",
  sample_collected: "var(--color-primary)",
  testing: "var(--color-primary)",
};

// Consistent colored status pill — established here and used on the
// highest-traffic admin list views (Bookings, Team); same shape is
// trivially reusable on remaining list pages (Leads, Campaigns, etc.)
// as a follow-up polish pass without touching any business logic.
export default function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "var(--color-ink-soft)";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        color: "#fff",
        background: color,
        padding: "2px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

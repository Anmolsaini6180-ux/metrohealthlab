interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

// Simple, reusable confirmation modal for destructive admin actions
// (deactivate a team member, cancel a booking) — no new dependency,
// just a fixed-position overlay.
export default function ConfirmDialog({ title, message, confirmLabel = "Confirm", onConfirm, onCancel, busy }: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "var(--space-md)",
      }}
      onClick={onCancel}
    >
      <div className="card" style={{ maxWidth: 360, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>{title}</p>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-md)" }}>{message}</p>
        <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "Please wait..." : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

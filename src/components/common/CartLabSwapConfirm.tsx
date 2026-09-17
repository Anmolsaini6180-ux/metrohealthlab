interface Props {
  currentLabName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// A booking is fulfilled by one lab visit, so useCart().addItem refuses
// to mix labs in one cart — this is what asks the customer to confirm
// swapping instead of the item silently failing to add. Same fixed-
// overlay/.card visual language as PhoneNumberModal.
export default function CartLabSwapConfirm({ currentLabName, onConfirm, onCancel }: Props) {
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
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-floating)",
          padding: "var(--space-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontWeight: 800, marginBottom: 6, fontSize: "var(--text-lg)", fontFamily: "var(--font-display)", color: "var(--color-primary-deep)" }}>
          Start a new cart?
        </p>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-md)" }}>
          Your cart has items from {currentLabName ?? "another lab"}. One booking is collected in a
          single visit, so adding this item will clear your current cart and start a new one.
        </p>
        <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
          <button className="mh2-btn mh2-btn--outline" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="mh2-btn mh2-btn--primary" type="button" onClick={onConfirm}>
            Replace Cart
          </button>
        </div>
      </div>
    </div>
  );
}

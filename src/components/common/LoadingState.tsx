interface LoadingStateProps {
  label?: string;
  rows?: number;
}

// Simple skeleton block used while any Firestore fetch is in flight.
// Never replaced with mock/sample data — just a loading placeholder.
export default function LoadingState({ label = "Loading...", rows = 3 }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" style={{ display: "grid", gap: "var(--space-sm)" }}>
      <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
        {label}
      </span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 72, width: "100%" }} />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

// Per the "no mock fallback" rule: whenever a Firestore/Functions call
// fails, pages render this instead of silently showing fake data.
export default function ErrorState({
  message = "Unable to load data. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="state-block" role="alert">
      <span className="mi" style={{ fontSize: 32, color: "var(--color-danger)" }}>
        error_outline
      </span>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

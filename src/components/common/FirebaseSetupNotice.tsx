// Shown across the app instead of every page silently failing when
// Firebase env vars haven't been provided yet — makes the missing
// configuration obvious rather than pretending the app is connected.
export default function FirebaseSetupNotice() {
  return (
    <div className="state-block" style={{ maxWidth: 480, margin: "0 auto" }}>
      <span className="mi" style={{ fontSize: 32, color: "var(--color-accent)" }}>
        settings
      </span>
      <p style={{ fontWeight: 600, color: "var(--color-ink)" }}>Firebase isn't configured yet</p>
      <p style={{ fontSize: "var(--text-sm)" }}>
        Copy <code>.env.example</code> to <code>.env</code> and fill in your Firebase project's
        SDK config (Project settings → General → Your apps) to connect this app to real data.
      </p>
    </div>
  );
}

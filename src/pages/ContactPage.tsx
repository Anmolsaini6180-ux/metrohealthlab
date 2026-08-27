export default function ContactPage() {
  return (
    <article style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Contact us</h1>
      <p className="text-soft">
        For booking help, use the in-app Support page once signed in — it creates a tracked
        ticket. For anything else, reach us at the details below.
      </p>
      <dl style={{ marginTop: "var(--space-md)", display: "grid", gap: "var(--space-sm)" }}>
        <div>
          <dt style={{ fontWeight: 600 }}>Support email</dt>
          <dd className="text-soft">support@example.com</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600 }}>Phone</dt>
          <dd className="text-soft">Add your support number here</dd>
        </div>
      </dl>
    </article>
  );
}

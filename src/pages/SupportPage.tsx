import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createSupportTicket, getUserTickets } from "@/services/supportService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function SupportPage() {
  const { user } = useAuth();
  const tickets = useAsync(() => (user ? getUserTickets(user.uid) : Promise.resolve([])), [user?.uid]);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await createSupportTicket(user.uid, { subject, message });
      setSubject("");
      setMessage("");
      tickets.retry();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Support</h1>
        <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <input placeholder="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea placeholder="How can we help?" required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send message"}
          </button>
        </form>
      </div>

      <div>
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Your tickets</h2>
        {tickets.loading && <LoadingState rows={2} />}
        {tickets.error && <ErrorState message={tickets.error} onRetry={tickets.retry} />}
        {tickets.data && tickets.data.length === 0 && <EmptyState icon="support_agent" title="No support tickets yet" />}
        {tickets.data && tickets.data.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {tickets.data.map((t) => (
              <div key={t.id} className="card">
                <p style={{ fontWeight: 600 }}>{t.subject}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{t.status}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

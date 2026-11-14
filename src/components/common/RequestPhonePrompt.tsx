import { useState } from "react";
import { updateUserProfile } from "@/services/userService";
import { toUserMessage } from "@/utils/errors";
import type { UserProfile } from "@/types/user";

const DISMISSED_KEY_PREFIX = "mh-phone-prompt-dismissed:";

/**
 * A phone-OTP customer's number lives in Firebase Auth itself, but an
 * email/Google account never has one recorded anywhere in Postgres
 * unless they typed it at signup — SignupPage's own phone field is
 * optional, and Google sign-in never asks at all. That gap is why a
 * staff-recorded WhatsApp booking has nothing to match against for a
 * customer who signed up this way (see create_staff_booking's own
 * phone-match comment). This closes it at the source: a small,
 * dismissible nudge, never a blocking modal, shown only to a real
 * Supabase-authenticated account with no phone on file yet.
 */
export default function RequestPhonePrompt({ supabaseUserId, profile }: { supabaseUserId: string | null; profile: UserProfile | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!supabaseUserId || !profile || profile.phone || dismissed || saved) return null;
  if (typeof window !== "undefined" && sessionStorage.getItem(DISMISSED_KEY_PREFIX + supabaseUserId)) return null;

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY_PREFIX + supabaseUserId!, "1");
    setDismissed(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateUserProfile(supabaseUserId!, { phone: digits.slice(-10) });
      setSaved(true);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mh-phone-prompt">
      <form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>Add your phone number</p>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            So we can reach you about a booking and send you real-time updates.
          </p>
        </div>
        <input
          type="tel"
          placeholder="10-digit phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: 160 }}
          disabled={busy}
        />
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: "8px 14px" }}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={handleDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <span className="mi" style={{ fontSize: 20, color: "var(--color-ink-soft)" }}>close</span>
        </button>
      </form>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)", width: "100%" }}>{error}</p>}
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { createCallbackLead } from "@/services/publicLeadService";
import { toUserMessage } from "@/utils/errors";

const DISMISSED_KEY = "mh_help_bar_dismissed";

// Floating "need help" card — a real Call Now action for someone who
// wants to talk right away, plus a "Request a callback" option for
// someone who can't take a call now but will leave their number. Both
// live in the same card rather than as two separate floating elements
// on the same page (the design brief's own "no excessive floating
// elements" rule), and this is the ONE place that need is served on
// this page — see MainLayout.tsx, nothing else fills this role.
//
// HOME ONLY. This is a full-width fixed card, so on any page with its
// own primary action near the bottom (the Log in button, the booking
// flow's Continue) it would sit directly on top of that control — the
// old compact pill was right-aligned and small enough not to. The
// reference design places this on the landing page for the same
// reason, so it is scoped here rather than layered over every route.
export default function CallToBookButton() {
  const { settings } = useBrandingSettings();
  const { pathname } = useLocation();
  const phone = settings?.phone?.trim();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [showCallbackForm, setShowCallbackForm] = useState(false);
  const [callbackPhone, setCallbackPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (pathname !== "/") return null;
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // A lost dismissal preference for the rest of this tab session is
      // not worth surfacing an error over.
    }
  }

  async function handleCallbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createCallbackLead("", callbackPhone);
      setSent(true);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Strip formatting for the tel: target while keeping the admin's own
  // formatting for anything shown on screen. A missing phone number
  // still allows the callback-request half of the card to work — that
  // one only ever needs the VISITOR's number, never the business's.
  const dial = phone ? phone.replace(/[^\d+]/g, "") : "";

  if (showCallbackForm) {
    return (
      <div className="mh-call-card mh-call-card--form" role="dialog" aria-label="Request a callback">
        <button type="button" className="mh-call-card__close" aria-label="Close" onClick={dismiss}>
          <span className="mi" aria-hidden="true">close</span>
        </button>
        {sent ? (
          <p className="mh-call-card__sent">
            <span className="mi" aria-hidden="true" style={{ color: "var(--color-success)" }}>check_circle</span>
            Thanks — our team will call you back shortly.
          </p>
        ) : (
          <form onSubmit={handleCallbackSubmit} className="mh-call-card__form">
            <p className="mh-call-card__lead">Need help? Leave your number and we'll call you back.</p>
            <div className="mh-call-card__form-row">
              <input
                type="tel"
                required
                placeholder="Your 10-digit mobile number"
                value={callbackPhone}
                onChange={(e) => setCallbackPhone(e.target.value)}
                className="mh-call-card__input"
              />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Sending…" : "Request Callback"}
              </button>
            </div>
            {error && <p className="mh-call-card__error">{error}</p>}
          </form>
        )}
      </div>
    );
  }

  if (!phone || !dial) {
    // No business phone configured — the "Call Now" half has nothing
    // to dial, but the callback-request half still works.
    return (
      <div className="mh-call-card">
        <span className="mh-call-card__copy">
          <span className="mh-call-card__lead">Need help booking a test?</span>
          <span className="mh-call-card__main">Request a callback</span>
        </span>
        <button type="button" className="mh-call-card__cta" onClick={() => setShowCallbackForm(true)}>
          Request Callback
        </button>
        <button type="button" className="mh-call-card__close" aria-label="Close" onClick={dismiss}>
          <span className="mi" aria-hidden="true">close</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mh-call-card">
      <a className="mh-call-card__tap-area" href={`tel:${dial}`} aria-label={`Call ${phone} to book`}>
        <span className="mh-call-card__icon" aria-hidden="true">
          <span className="mi">call</span>
        </span>
        <span className="mh-call-card__copy">
          <span className="mh-call-card__lead">Need help booking a test?</span>
          <span className="mh-call-card__main">Call our health experts</span>
        </span>
      </a>
      <button type="button" className="mh-call-card__cta mh-call-card__cta--secondary" onClick={() => setShowCallbackForm(true)}>
        Request Callback
      </button>
      <a className="mh-call-card__cta" href={`tel:${dial}`}>
        <span className="mi" aria-hidden="true">call</span>
        Call Now
      </a>
      <button type="button" className="mh-call-card__close" aria-label="Close" onClick={dismiss}>
        <span className="mi" aria-hidden="true">close</span>
      </button>
    </div>
  );
}

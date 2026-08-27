import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "mh-install-dismissed";

// Chrome fires `beforeinstallprompt` when the app meets the PWA
// installability bar (manifest + service worker + https). Capturing it
// lets us show our own branded prompt instead of relying on the user
// finding "Install app" buried in the browser's ⋮ menu.
//
// iOS/Safari never fires this event — installing there is always the
// manual Share → "Add to Home Screen" flow, so this button simply
// won't appear on iOS rather than showing something that can't work.
export default function InstallAppPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // sessionStorage (not localStorage) so dismissing hides it for this
    // visit without permanently opting the user out.
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault(); // stop Chrome's own mini-infobar; we show ours
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Once installed, never show the prompt again this session.
    function onInstalled() {
      setVisible(false);
      sessionStorage.setItem(DISMISSED_KEY, "1");
    }
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setVisible(false);
    setPromptEvent(null);
  }

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mh-install-prompt">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>Install Metro Health Lab</p>
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          Add to your home screen for quick access.
        </p>
      </div>
      <button className="btn btn-primary" style={{ padding: "8px 14px" }} onClick={handleInstall}>
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
      >
        <span className="mi" style={{ fontSize: 20, color: "var(--color-ink-soft)" }}>close</span>
      </button>
    </div>
  );
}

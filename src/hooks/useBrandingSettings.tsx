import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { subscribeToBrandingSettings } from "@/services/settingsService";
import type { BrandingSettings } from "@/types/settings";

interface BrandingContextValue {
  settings: BrandingSettings | null;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({ settings: null, loading: true });

// Subscribed exactly once at the app root (see main.tsx) rather than
// once per component that needs branding (Header, Footer, Logo,
// AdminLayout, login/signup pages all need it) — avoids opening
// several redundant onSnapshot listeners against the same document.
export function BrandingSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToBrandingSettings(
      (next) => {
        setSettings(next);
        setLoading(false);

        // Favicon updates are technically straightforward client-side —
        // just repoint the existing <link rel="icon"> (or create one if
        // the static index.html didn't ship with one).
        if (next?.faviconUrl) {
          let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = next.faviconUrl;
        }
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  return <BrandingContext.Provider value={{ settings, loading }}>{children}</BrandingContext.Provider>;
}

export function useBrandingSettings(): BrandingContextValue {
  return useContext(BrandingContext);
}

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

// Mirrors src/firebase/config.ts's shape deliberately: same
// "configured" flag, same lazy singleton, same NotConfiguredError
// pattern, so the rest of the app can reason about either backend the
// same way while both exist side by side.
//
// SECURITY BOUNDARY: only ever read the anon/publishable key here.
// Vite inlines every `VITE_*` variable into the browser bundle, so
// anything read via `import.meta.env` in this file is public by
// construction. The service-role key (used by scripts/migration/*,
// which run in Node, never in the browser) must never be read through
// `import.meta.env` or referenced from anything under src/ — that is
// the one rule this file exists to make impossible to get wrong by
// accident: there is no code path here that could reach a
// SUPABASE_SERVICE_ROLE_KEY even if one were mistakenly prefixed with
// VITE_.
const fromEnv = import.meta.env;

export const supabaseConfig = {
  url: fromEnv.VITE_SUPABASE_URL ?? "",
  // The modern sb_publishable_... key is preferred; the legacy anon JWT
  // is accepted too, since some deployments may still have only that.
  // Both are safe in the browser by design — the boundary is RLS, not
  // secrecy of this value.
  publishableKey: fromEnv.VITE_SUPABASE_PUBLISHABLE_KEY || fromEnv.VITE_SUPABASE_ANON_KEY || "",
};

export const supabaseConfigured = !!supabaseConfig.url && !!supabaseConfig.publishableKey;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY " +
        "(or VITE_SUPABASE_ANON_KEY) in .env — see .env.example."
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        // Session restoration across reloads/tabs — the browser-side
        // equivalent of Firebase's own IndexedDB persistence.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Every `subscribeTo*` function in the app builds its Realtime channel
 * synchronously, inline, in the body of a `useEffect` — including one
 * (BrandingSettingsProvider) mounted unconditionally at the app root.
 * getSupabaseClient() THROWS when Supabase isn't configured, and a
 * throw from inside a useEffect callback is uncaught: React unmounts
 * the whole tree, producing a completely blank page with no error UI
 * at all. This was a real production incident (metrohealthlab.in white
 * screen, VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY missing from
 * the Vercel environment) — the fix is BOTH setting those variables in
 * Vercel AND making the client-side code below never able to crash the
 * app again regardless of configuration state.
 *
 * Wrap every channel-setup call site in this: on any synchronous
 * failure (not configured, or anything else), it reports through
 * onError exactly like an async fetch failure already does, and hands
 * back a harmless no-op unsubscribe instead of propagating the throw.
 * The public site must render — and its non-realtime data must still
 * load once configured — independent of Realtime ever connecting.
 */
export function safeSubscribe(setup: () => () => void, onError?: (error: Error) => void): () => void {
  try {
    return setup();
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

interface SharedChannelEntry {
  channel: RealtimeChannel;
  // Keyed by the caller's onChange callback so add/remove of a pair is
  // always one Map operation, never two Sets that could drift apart.
  listeners: Map<(payload: unknown) => void, ((error: Error) => void) | undefined>;
}

const sharedChannels = new Map<string, SharedChannelEntry>();

/**
 * THE production incident this fixes: "cannot add `postgres_changes`
 * callbacks for realtime:notifications-<uid> after `subscribe()`."
 *
 * Every `subscribeTo*` function used to call
 * `getSupabaseClient().channel(name).on(...).subscribe()` directly.
 * Supabase's client keys channels by name and, when a caller asks for a
 * name that already has a live channel, SILENTLY RETURNS THAT SAME
 * CHANNEL OBJECT instead of creating a second one (see
 * RealtimeClient.channel() in @supabase/realtime-js — it does
 * `this.getChannels().find(c => c.topic === realtimeTopic)` before ever
 * constructing a new one). Two components that legitimately want the
 * same live data — e.g. the header's NotificationBell, rendered once
 * for the desktop nav and once for the mobile nav in the very same
 * render — each independently called `.channel('notifications-<uid>')
 * .on(...).subscribe()`. The second call's `.on()` landed on a channel
 * the first call had already subscribed, and realtime-js refuses that
 * with exactly the error above (RealtimeChannel.ts's `_on()` guard:
 * `cannot add \`${type}\` callbacks for ${topic} after \`subscribe()\`.`).
 * The same shape was possible on every other shared/per-entity channel
 * name in the app, not just notifications — a customer opening the
 * live tracker for a booking that's also listed on their bookings page,
 * for instance.
 *
 * This is the fix: exactly one real channel per topic name, its
 * `.on()` listener registered and `.subscribe()` called exactly once,
 * ref-counted so any number of callers can independently subscribe to
 * and unsubscribe from the same topic in any order. The channel is
 * only removed once the LAST caller has unsubscribed; every change
 * event is fanned out to every current caller's own onChange.
 *
 * On CHANNEL_ERROR/TIMED_OUT the shared channel is deliberately left in
 * place rather than torn down and recreated here: realtime-js's own
 * Phoenix-channel layer keeps its bindings and retries the join
 * internally (this is standard behaviour for the protocol, not
 * something this app implements), so the exact same `.on()`
 * registration above starts delivering events again the moment it
 * rejoins, with nothing further to do. Every current caller's onError
 * is still notified so its own fallback (a friendly message, a stale-
 * but-still-rendered value, a retry affordance) can show in the
 * meantime instead of the page hanging silently — never an uncaught
 * exception, never a white screen.
 */
export function subscribeToTableChanges<T = unknown>(
  topic: string,
  config: { event: "*" | "INSERT" | "UPDATE" | "DELETE"; schema: string; table: string; filter?: string },
  onChange: (payload: T) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const listener = onChange as (payload: unknown) => void;
    let entry = sharedChannels.get(topic);
    if (!entry) {
      const listeners: SharedChannelEntry["listeners"] = new Map();
      const channel = getSupabaseClient()
        .channel(topic)
        .on("postgres_changes", config, (payload) => {
          listeners.forEach((_onError, onChangeListener) => onChangeListener(payload));
        })
        .subscribe((status, err) => {
          if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
          const error = err instanceof Error ? err : new Error(`Realtime ${status.toLowerCase().replace("_", " ")} on ${topic}`);
          listeners.forEach((onErrorListener) => onErrorListener?.(error));
        });
      entry = { channel, listeners };
      sharedChannels.set(topic, entry);
    }
    entry.listeners.set(listener, onError);

    return () => {
      const current = sharedChannels.get(topic);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        sharedChannels.delete(topic);
        getSupabaseClient().removeChannel(current.channel);
      }
    };
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

import { useEffect, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";
import { toUserMessage } from "@/utils/errors";

interface RealtimeState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Matches the guard useAsync already applies to one-time fetches. An
// onSnapshot listener that never delivers a first snapshot — a stalled
// transport, a device that dropped off the network mid-subscribe —
// otherwise leaves the page on its skeleton forever, which is what the
// home page did on a real handset ("Loading categories..." that never
// resolved). An infinite loading state is never an acceptable end
// state; surfacing the failure with a retry is.
const FIRST_SNAPSHOT_TIMEOUT_MS = 20_000;

// Same {data, loading, error, retry} shape as useAsync, so pages don't
// need any JSX changes to switch from a one-time fetch to a live
// onSnapshot subscription — just swap which hook populates it. Always
// unsubscribes on dependency change/unmount.
export function useRealtimeQuery<T>(
  subscribeFactory: (onData: (data: T) => void, onError: (error: Error) => void) => Unsubscribe,
  deps: unknown[]
): RealtimeState<T> & { retry: () => void } {
  const [state, setState] = useState<RealtimeState<T>>({ data: null, loading: true, error: null });
  // Bumped by retry() so the effect genuinely tears the listener down
  // and resubscribes. Clearing the error alone left the Retry button
  // looking functional while doing nothing.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let settled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setState({
        data: null,
        loading: false,
        error: "This is taking longer than expected. Check your connection and retry.",
      });
    }, FIRST_SNAPSHOT_TIMEOUT_MS);

    const unsubscribe = subscribeFactory(
      (data) => {
        settled = true;
        clearTimeout(timer);
        setState({ data, loading: false, error: null });
      },
      (err) => {
        settled = true;
        clearTimeout(timer);
        setState({ data: null, loading: false, error: toUserMessage(err) });
      }
    );

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { toUserMessage } from "@/utils/errors";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("This is taking longer than expected. Check your connection and retry.")), TIMEOUT_MS)
    ),
  ]);
}

// Generic "fetch on mount, expose retry" hook used by every list/detail
// page. Deliberately has no mock-data fallback: on failure it just
// surfaces the error message so the page can render an ErrorState with
// a Retry button, per the "no silent fake data" rule. Also guards
// against a request that never settles at all (a stuck network
// transport, a Firestore project that isn't fully provisioned yet) by
// racing it against a timeout — an infinite loading skeleton is never
// an acceptable end state.
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    withTimeout(fetcherRef.current())
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: toUserMessage(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  return { ...state, retry: run };
}

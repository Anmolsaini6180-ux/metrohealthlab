import { useEffect, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";
import { toUserMessage } from "@/utils/errors";

interface RealtimeState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Same {data, loading, error, retry} shape as useAsync, so pages don't
// need any JSX changes to switch from a one-time fetch to a live
// onSnapshot subscription — just swap which hook populates it. Always
// unsubscribes on dependency change/unmount.
export function useRealtimeQuery<T>(
  subscribeFactory: (onData: (data: T) => void, onError: (error: Error) => void) => Unsubscribe,
  deps: unknown[]
): RealtimeState<T> & { retry: () => void } {
  const [state, setState] = useState<RealtimeState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const unsubscribe = subscribeFactory(
      (data) => setState({ data, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: toUserMessage(err) })
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, retry: () => setState((s) => ({ ...s, error: null })) };
}

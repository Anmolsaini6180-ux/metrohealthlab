import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ToastMessage {
  id: string;
  text: string;
  variant: "success" | "error";
}

interface ToastContextValue {
  showToast: (text: string, variant?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

// One shared toast stack at the app root — pages call showToast() for
// lightweight "Saved"/"Error" feedback instead of each rolling its own
// inline "Saved." paragraph.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, variant: "success" | "error" = "success") => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, text, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 100, display: "grid", gap: 8 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card"
            style={{
              background: t.variant === "success" ? "var(--color-success)" : "var(--color-danger)",
              color: "#fff",
              padding: "10px 16px",
              fontSize: "var(--text-sm)",
              minWidth: 200,
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

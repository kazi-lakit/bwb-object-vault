import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastTone = "error" | "info" | "success";
type ToastEntry = { id: string; message: string; tone: ToastTone };

const TONE_ICONS: Record<ToastTone, typeof CheckCircle2> = { error: XCircle, info: Info, success: CheckCircle2 };
const DISMISS_AFTER_MS = 5000;

const ToastContext = createContext<((tone: ToastTone, message: string) => void) | undefined>(undefined);

// A single always-mounted tray shared by the whole app, rather than each
// feature rolling its own -- so a background action (delete, a failed
// download) gets the same non-blocking confirmation/error surface a modal
// dialog's own inline state can't provide for actions with no dialog at all.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
      );
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-tray" role="status" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone];
          return (
            <div key={toast.id} className={`toast toast-${toast.tone}`}>
              <Icon size={17} />
              <span>{toast.message}</span>
              <button className="toast-dismiss" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used within a ToastProvider");
  return {
    error: (message: string) => push("error", message),
    info: (message: string) => push("info", message),
    success: (message: string) => push("success", message)
  };
}

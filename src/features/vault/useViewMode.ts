import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

const STORAGE_KEY = "blocks-app:vault-view-mode";

// Shared across My Drive, Shared, and System Files -- a per-viewer display
// preference, not app data, so localStorage is the right (and only) place
// for it; falls back to "list" if storage is unavailable (private window,
// blocked site data) rather than throwing.
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Per-viewer convenience only -- fine to lose across sessions.
    }
  }, [mode]);

  return [mode, setMode];
}

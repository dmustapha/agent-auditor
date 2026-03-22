"use client";

import { useEffect } from "react";

interface KeyboardShortcutHandlers {
  onFocusSearch?: () => void;
  onClear?: () => void;
}

export function useKeyboardShortcuts({ onFocusSearch, onClear }: KeyboardShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onFocusSearch?.();
      }
      if (e.key === "Escape") {
        onClear?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onFocusSearch, onClear]);
}

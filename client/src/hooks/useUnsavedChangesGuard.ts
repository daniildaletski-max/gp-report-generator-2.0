import { useEffect } from "react";

/**
 * Block window unload (refresh, tab close, browser back) when there are
 * unsaved changes on the page.
 *
 * Modern browsers ignore the message argument and show their own native
 * "Leave site?" dialog — we just need to call `preventDefault()` and set
 * `returnValue` to opt in.
 *
 * Usage:
 *   useUnsavedChangesGuard(rows.some(r => r.isDirty));
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by Chrome to actually trigger the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}

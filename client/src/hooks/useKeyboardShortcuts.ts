import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

/**
 * useKeyboardShortcuts — global keyboard navigation layer.
 *
 * Shortcuts:
 *   G then D → Dashboard
 *   G then U → Upload
 *   G then E → Evaluations
 *   G then R → Reports
 *   G then A → Admin
 *   G then W → Workspace
 *   G then T → Attendance
 *   /         → Focus search (opens command palette)
 *   ?         → Show shortcuts help
 *   Escape    → Close modals / clear focus
 *
 * The "G then X" pattern uses a 800ms timeout window.
 * Shortcuts are disabled when focus is inside an input/textarea/contenteditable.
 */
export function useKeyboardShortcuts({
  onOpenSearch,
  onShowHelp,
}: {
  onOpenSearch?: () => void;
  onShowHelp?: () => void;
}) {
  const [, navigate] = useLocation();
  const gPending = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if ((el as HTMLElement).isContentEditable) return true;
    // Also check if inside a dialog/modal
    if (el.closest("[role='dialog']")) return true;
    return false;
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if inside input elements
      if (isInputFocused()) return;

      const key = e.key.toLowerCase();

      // Handle "G then X" navigation
      if (gPending.current) {
        gPending.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);

        const routes: Record<string, string> = {
          d: "/dashboard",
          u: "/upload",
          e: "/evaluations",
          r: "/reports",
          a: "/admin",
          w: "/workspace",
          t: "/attendance",
        };

        if (routes[key]) {
          e.preventDefault();
          navigate(routes[key]);
          return;
        }
      }

      // "G" starts the navigation sequence
      if (key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        gPending.current = true;
        gTimer.current = setTimeout(() => {
          gPending.current = false;
        }, 800);
        return;
      }

      // "/" opens search
      if (key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenSearch?.();
        return;
      }

      // "?" shows help
      if (key === "?" || (e.shiftKey && key === "/")) {
        e.preventDefault();
        onShowHelp?.();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onOpenSearch, onShowHelp, isInputFocused]);
}

/**
 * Keyboard shortcuts data for the help dialog
 */
export const SHORTCUTS = [
  { keys: ["G", "D"], description: "Go to Dashboard" },
  { keys: ["G", "U"], description: "Go to Upload" },
  { keys: ["G", "E"], description: "Go to Evaluations" },
  { keys: ["G", "R"], description: "Go to Reports" },
  { keys: ["G", "A"], description: "Go to Admin" },
  { keys: ["G", "W"], description: "Go to Workspace" },
  { keys: ["G", "T"], description: "Go to Attendance" },
  { keys: ["/"], description: "Open search" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Close dialog / clear focus" },
] as const;

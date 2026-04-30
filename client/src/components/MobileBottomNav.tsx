import { useLocation } from "wouter";
import { motion } from "framer-motion";
import type { ComponentType } from "react";

interface BottomNavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * Mobile-only bottom navigation bar — the "phone-app feel" the user has
 * been asking for. Sits fixed at the bottom of the viewport, slides out
 * of the way naturally above the iOS home indicator via `safe-area-inset`.
 *
 * The active item gets a soft pill backdrop animated with framer-motion's
 * `layoutId` so the highlight slides between items rather than popping —
 * a small detail that sells the "real native nav bar" feel.
 *
 * Hidden on `md` and up; the desktop sidebar already covers that case.
 */
export function MobileBottomNav({ items }: { items: BottomNavItem[] }) {
  const [location, setLocation] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-border bg-background/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary navigation"
    >
      <ul className="grid grid-cols-5 max-w-md mx-auto px-1 py-1.5">
        {items.slice(0, 5).map(item => {
          const isActive = location === item.href;
          return (
            <li key={item.href} className="relative">
              <button
                onClick={() => setLocation(item.href)}
                className="relative w-full flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-colors"
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/15"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">
                  <item.icon
                    className={`h-5 w-5 transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </span>
                <span
                  className={`relative z-10 text-[10px] font-medium tracking-tight transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

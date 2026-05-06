import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 mt-2">
          {SHORTCUTS.map((shortcut, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm text-muted-foreground">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
                    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium bg-muted border border-border rounded-md shadow-sm">
                      {key}
                    </kbd>
                    {j < shortcut.keys.length - 1 && (
                      <span className="text-xs text-muted-foreground mx-0.5">then</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Press <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium bg-muted border border-border rounded">?</kbd> anywhere to show this dialog
        </p>
      </DialogContent>
    </Dialog>
  );
}

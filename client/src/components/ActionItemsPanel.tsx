import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus, Sparkles, CheckCircle2, Clock, AlertCircle, Trash2, Calendar, Flame,
  Loader2, Brain, ChevronRight, Target,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Item = inferRouterOutputs<AppRouter>["actionItems"]["list"][number];
type Suggestion = inferRouterOutputs<AppRouter>["actionItems"]["generateSuggestions"]["suggestions"][number];

interface ActionItemsPanelProps {
  /** Single GP scope. Required since the panel only makes sense per-GP. */
  gpId: number;
  gpName: string;
}

const CATEGORY_TONE: Record<string, string> = {
  appearance: "border-emerald-200 bg-emerald-50/50 text-emerald-700",
  performance: "border-primary/20 bg-primary/5 text-primary",
  attitude: "border-pink-200 bg-pink-50/50 text-pink-700",
  attendance: "border-blue-200 bg-blue-50/50 text-blue-700",
  errors: "border-rose-200 bg-rose-50/50 text-rose-700",
  general: "border-border bg-muted/30 text-muted-foreground",
};

const PRIORITY_TONE: Record<string, string> = {
  high: "border-rose-300 bg-rose-100 text-rose-700",
  medium: "border-amber-300 bg-amber-100 text-amber-700",
  low: "border-slate-300 bg-slate-100 text-slate-700",
};

export function ActionItemsPanel({ gpId, gpName }: ActionItemsPanelProps) {
  const utils = trpc.useUtils();
  const [showAll, setShowAll] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [insightsResult, setInsightsResult] = useState<
    inferRouterOutputs<AppRouter>["actionItems"]["generateSuggestions"] | null
  >(null);

  const { data: items, isLoading } = trpc.actionItems.list.useQuery({
    gpId,
    includeAllStatuses: showAll,
  });

  const completeMutation = trpc.actionItems.complete.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
      toast.success("Marked as done");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.actionItems.update.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.actionItems.delete.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
      toast.success("Action item removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = trpc.actionItems.generateSuggestions.useMutation({
    onSuccess: (result) => {
      setInsightsResult(result);
    },
    onError: (e) => toast.error(`AI suggestions failed: ${e.message}`),
  });

  const stats = items
    ? {
        total: items.length,
        open: items.filter(i => i.status === "open").length,
        inProgress: items.filter(i => i.status === "in_progress").length,
        done: items.filter(i => i.status === "done").length,
        overdue: items.filter(i =>
          i.dueDate && (i.status === "open" || i.status === "in_progress") && isPast(new Date(i.dueDate))
        ).length,
      }
    : null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New item
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateMutation.mutate({ gpId })}
            disabled={generateMutation.isPending}
            className="gap-1.5"
          >
            {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI suggest
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <span className="text-xs text-muted-foreground">
              {stats.open} open · {stats.inProgress} in progress
              {stats.overdue > 0 && <span className="text-rose-600"> · {stats.overdue} overdue</span>}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Hide closed" : "Show all"}
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-border rounded-lg">
          <Target className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No action items yet</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Create one manually or let AI suggest based on recent performance
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onComplete={(note) => completeMutation.mutate({ id: item.id, note })}
              onCycleStatus={() => {
                const next: Item["status"] = item.status === "open" ? "in_progress" : item.status === "in_progress" ? "done" : "open";
                if (next === "done") {
                  completeMutation.mutate({ id: item.id });
                } else {
                  updateMutation.mutate({ id: item.id, status: next });
                }
              }}
              onDelete={() => deleteMutation.mutate({ id: item.id })}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <CreateItemDialog
        gpId={gpId}
        gpName={gpName}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {/* AI insights dialog */}
      <InsightsDialog
        result={insightsResult}
        gpId={gpId}
        gpName={gpName}
        onClose={() => setInsightsResult(null)}
      />
    </div>
  );
}

function ItemCard({
  item,
  onCycleStatus,
  onComplete,
  onDelete,
}: {
  item: Item;
  onCycleStatus: () => void;
  onComplete: (note?: string) => void;
  onDelete: () => void;
}) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isDone = item.status === "done" || item.status === "cancelled";
  const isOverdue = item.dueDate && !isDone && isPast(new Date(item.dueDate));

  return (
    <div className={`border rounded-lg p-3 transition-all ${isDone ? "opacity-60 bg-muted/30 border-border" : isOverdue ? "border-rose-300 bg-rose-50/50" : "border-border bg-card hover:border-primary/30"}`}>
      <div className="flex items-start gap-3">
        {/* Status toggle */}
        <button
          type="button"
          onClick={onCycleStatus}
          className="mt-0.5 shrink-0"
          title={`Status: ${item.status} (click to advance)`}
        >
          {item.status === "done" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : item.status === "in_progress" ? (
            <Clock className="h-5 w-5 text-amber-500" />
          ) : item.status === "cancelled" ? (
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-border hover:border-primary transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {item.title}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {item.source === "ai_insight" && (
                <Badge variant="outline" className="text-[10px] gap-0.5 border-violet-300 bg-violet-50 text-violet-700">
                  <Brain className="h-2.5 w-2.5" /> AI
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] ${CATEGORY_TONE[item.category]}`}>{item.category}</Badge>
              <Badge variant="outline" className={`text-[10px] ${PRIORITY_TONE[item.priority]}`}>{item.priority}</Badge>
            </div>
          </div>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
            {item.dueDate && (
              <span className={`inline-flex items-center gap-1 ${isOverdue ? "text-rose-600 font-semibold" : ""}`}>
                <Calendar className="h-3 w-3" />
                {isOverdue ? `Overdue · ` : "Due "}{formatDistanceToNow(new Date(item.dueDate), { addSuffix: true })}
              </span>
            )}
            <span>Created {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
            {item.completedAt && (
              <span className="text-emerald-600">Done {format(new Date(item.completedAt), "MMM d")}</span>
            )}
          </div>
          {item.completionNote && (
            <p className="text-xs text-emerald-700 italic mt-1.5 pl-2 border-l-2 border-emerald-300">
              {item.completionNote}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          {!isDone && (
            <button
              type="button"
              onClick={() => setCompleteOpen(true)}
              className="text-[10px] text-muted-foreground hover:text-emerald-600 transition-colors"
              title="Mark done with note"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="text-[10px] text-muted-foreground hover:text-rose-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Complete-with-note dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark "{item.title}" as done</DialogTitle>
            <DialogDescription>Optional note about what was actually done — useful for the next month's review.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            placeholder="e.g. trained on grooming, +1 score on next eval"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                onComplete(completionNote || undefined);
                setCompleteOpen(false);
                setCompletionNote("");
              }}
            >
              Mark done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>"{item.title}" will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateItemDialog({
  gpId, gpName, open, onClose,
}: { gpId: number; gpName: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Item["category"]>("general");
  const [priority, setPriority] = useState<Item["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");

  const createMutation = trpc.actionItems.create.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
      toast.success("Action item created");
      setTitle(""); setDescription(""); setCategory("general"); setPriority("medium"); setDueDate("");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New action item for {gpName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Title — e.g. Schedule grooming review"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional) — what specifically and why"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as Item["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="appearance">Appearance</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="attitude">Attitude</SelectItem>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="errors">Errors</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Item["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate({
              gpId,
              title: title.trim(),
              description: description.trim() || undefined,
              category,
              priority,
              dueDate: dueDate ? new Date(dueDate) : undefined,
            })}
            disabled={createMutation.isPending || !title.trim()}
          >
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InsightsDialog({
  result, gpId, gpName, onClose,
}: {
  result: inferRouterOutputs<AppRouter>["actionItems"]["generateSuggestions"] | null;
  gpId: number;
  gpName: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.actionItems.create.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
      toast.success("Saved as action item");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={result !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            AI coaching suggestions for {gpName}
          </DialogTitle>
          <DialogDescription>
            Generated from the last 3 months of evaluations, errors, attitude and attendance.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-violet-200 bg-violet-50/50 text-sm text-slate-700 leading-relaxed">
              {result.summary}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suggestions</p>
              {result.suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No suggestions returned.</p>
              ) : (
                result.suggestions.map((s, i) => (
                  <SuggestionCard
                    key={i}
                    suggestion={s}
                    onSave={() => createMutation.mutate({
                      gpId,
                      title: s.title,
                      description: s.description,
                      category: s.category,
                      priority: s.priority,
                      source: "ai_insight",
                    })}
                  />
                ))
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionCard({ suggestion: s, onSave }: { suggestion: Suggestion; onSave: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="border border-border rounded-lg p-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-foreground">{s.title}</p>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${CATEGORY_TONE[s.category]}`}>{s.category}</Badge>
          <Badge variant="outline" className={`text-[10px] ${PRIORITY_TONE[s.priority]}`}>
            {s.priority === "high" && <Flame className="h-2.5 w-2.5 mr-0.5" />}
            {s.priority}
          </Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{s.description}</p>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={saved}
        onClick={() => { onSave(); setSaved(true); }}
      >
        {saved ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Saved</> : <><Plus className="h-3 w-3 mr-1" /> Save as action item</>}
      </Button>
    </div>
  );
}

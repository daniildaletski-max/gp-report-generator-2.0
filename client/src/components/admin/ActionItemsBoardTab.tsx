import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Target, Search, Brain, AlertCircle, CheckCircle2, Clock,
  Calendar, Flame, Filter,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";

type Item = inferRouterOutputs<AppRouter>["actionItems"]["list"][number];

const CATEGORY_TONE: Record<string, string> = {
  appearance: "bg-emerald-50 text-emerald-700 border-emerald-200",
  performance: "bg-primary/5 text-primary border-primary/20",
  attitude: "bg-pink-50 text-pink-700 border-pink-200",
  attendance: "bg-blue-50 text-blue-700 border-blue-200",
  errors: "bg-rose-50 text-rose-700 border-rose-200",
  general: "bg-muted/40 text-muted-foreground border-border",
};

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-rose-100 text-rose-700 border-rose-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  low: "bg-slate-100 text-slate-700 border-slate-300",
};

export function ActionItemsBoardTab() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [drawerGpId, setDrawerGpId] = useState<number | null>(null);

  // One shared database — every action item across all GPs.
  const { data: items, isLoading } = trpc.actionItems.list.useQuery({
    includeAllStatuses: true,
  });

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(it => {
      if (filterCategory !== "all" && it.category !== filterCategory) return false;
      if (filterPriority !== "all" && it.priority !== filterPriority) return false;
      if (search) {
        const q = search.toLowerCase();
        const inTitle = it.title.toLowerCase().includes(q);
        const inDescr = (it.description || "").toLowerCase().includes(q);
        const inGp = it.gamePresenter.name.toLowerCase().includes(q);
        if (!inTitle && !inDescr && !inGp) return false;
      }
      return true;
    });
  }, [items, filterCategory, filterPriority, search]);

  const grouped = useMemo(() => {
    const open = filtered.filter(i => i.status === "open");
    const inProgress = filtered.filter(i => i.status === "in_progress");
    const done = filtered.filter(i => i.status === "done");
    return { open, inProgress, done };
  }, [filtered]);

  return (
    <TabsContent value="action-items" className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title, description, or GP name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="min-w-[140px]">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="appearance">Appearance</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="attitude">Attitude</SelectItem>
                <SelectItem value="attendance">Attendance</SelectItem>
                <SelectItem value="errors">Errors</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[120px]">
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Three columns */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No action items {search || filterCategory !== "all" || filterPriority !== "all" ? "match the filters" : "yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Open a GP from the Leaderboard or Dashboard and create plans for them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Column
            title="Open"
            count={grouped.open.length}
            icon={<AlertCircle className="h-4 w-4 text-violet-600" />}
            items={grouped.open}
            onOpenGp={setDrawerGpId}
          />
          <Column
            title="In progress"
            count={grouped.inProgress.length}
            icon={<Clock className="h-4 w-4 text-amber-600" />}
            items={grouped.inProgress}
            onOpenGp={setDrawerGpId}
          />
          <Column
            title="Done"
            count={grouped.done.length}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            items={grouped.done}
            onOpenGp={setDrawerGpId}
          />
        </div>
      )}

      <GPDetailDrawer
        gpId={drawerGpId}
        open={drawerGpId !== null}
        onOpenChange={(open) => { if (!open) setDrawerGpId(null); }}
      />
    </TabsContent>
  );
}

function Column({
  title, count, icon, items, onOpenGp,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  items: Item[];
  onOpenGp: (gpId: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          <Badge variant="outline" className="text-[10px]">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nothing here</p>
        ) : (
          items.map(item => <BoardCard key={item.id} item={item} onOpenGp={onOpenGp} />)
        )}
      </CardContent>
    </Card>
  );
}

function BoardCard({ item, onOpenGp }: { item: Item; onOpenGp: (gpId: number) => void }) {
  const isOverdue = item.dueDate
    && (item.status === "open" || item.status === "in_progress")
    && isPast(new Date(item.dueDate));

  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer hover:border-primary/40 hover:bg-muted/40 transition-all ${isOverdue ? "border-rose-300 bg-rose-50/50" : "border-border bg-card"}`}
      onClick={() => onOpenGp(item.gamePresenter.id)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
        {item.source === "ai_insight" && (
          <Badge variant="outline" className="text-[9px] gap-0.5 border-violet-300 bg-violet-50 text-violet-700 shrink-0">
            <Brain className="h-2 w-2" /> AI
          </Badge>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenGp(item.gamePresenter.id); }}
        className="text-xs text-muted-foreground hover:text-primary hover:underline"
      >
        {item.gamePresenter.name}
      </button>
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        <Badge variant="outline" className={`text-[9px] ${CATEGORY_TONE[item.category]}`}>{item.category}</Badge>
        <Badge variant="outline" className={`text-[9px] ${PRIORITY_TONE[item.priority]}`}>
          {item.priority === "high" && <Flame className="h-2 w-2 mr-0.5" />}
          {item.priority}
        </Badge>
      </div>
      {item.dueDate && (
        <p className={`text-[10px] mt-1.5 inline-flex items-center gap-1 ${isOverdue ? "text-rose-600 font-semibold" : "text-muted-foreground"}`}>
          <Calendar className="h-2.5 w-2.5" />
          {isOverdue ? "Overdue · " : "Due "}{formatDistanceToNow(new Date(item.dueDate), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}

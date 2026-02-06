import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import EvaluationDetailView from "@/components/EvaluationDetailView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Pencil, Trash2, Image, Trash, Search, Filter, X, Download, CheckSquare, Square, FileSpreadsheet, Calendar, User, TrendingUp, ArrowUpDown, ChevronDown, MoreHorizontal, Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EvaluationsPage() {
  const utils = trpc.useUtils();
  const { data: evaluations, isLoading } = trpc.evaluation.list.useQuery();
  
  // Attitude entries query
  const { data: attitudeEntries, isLoading: isLoadingAttitude } = trpc.attitudeScreenshot.listAll.useQuery({});
  
  // Delete attitude mutation
  const deleteAttitudeMutation = trpc.attitudeScreenshot.delete.useMutation({
    onSuccess: () => {
      utils.attitudeScreenshot.listAll.invalidate();
      toast.success('Attitude entry deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });
  
  // Active tab state
  const [activeTab, setActiveTab] = useState<"evaluations" | "attitude">("evaluations");
  
  const [editingEval, setEditingEval] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clearMonth, setClearMonth] = useState(new Date().getMonth() + 1);
  const [clearYear, setClearYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [viewingEval, setViewingEval] = useState<{ evaluation: any; gamePresenter: any } | null>(null);
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterGP, setFilterGP] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "score" | "name">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Attitude filter state
  const [attitudeFilterGP, setAttitudeFilterGP] = useState<string>("all");
  const [attitudeFilterMonth, setAttitudeFilterMonth] = useState<number | null>(null);
  const [attitudeFilterYear, setAttitudeFilterYear] = useState<number | null>(null);
  const [attitudeFilterType, setAttitudeFilterType] = useState<string>("all");
  const [attitudeSearchQuery, setAttitudeSearchQuery] = useState("");

  // Get unique GPs for filter
  const uniqueGPs = useMemo(() => {
    if (!evaluations) return [];
    const gps = new Map<number, string>();
    evaluations.forEach(({ gamePresenter }) => {
      if (gamePresenter?.id && gamePresenter?.name) {
        gps.set(gamePresenter.id, gamePresenter.name);
      }
    });
    return Array.from(gps.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [evaluations]);

  // Attitude statistics
  const attitudeStats = useMemo(() => {
    if (!attitudeEntries) return { total: 0, positive: 0, negative: 0, thisMonth: 0 };
    const now = new Date();
    const thisMonthEntries = attitudeEntries.filter(e => 
      e.month === now.getMonth() + 1 && e.year === now.getFullYear()
    );
    return {
      total: attitudeEntries.length,
      positive: attitudeEntries.filter(e => e.attitudeType === 'positive' || (e.attitudeScore && e.attitudeScore > 0)).length,
      negative: attitudeEntries.filter(e => e.attitudeType === 'negative' || (e.attitudeScore && e.attitudeScore < 0)).length,
      thisMonth: thisMonthEntries.length,
    };
  }, [attitudeEntries]);

  // Unique GPs for attitude filter
  const attitudeUniqueGPs = useMemo(() => {
    if (!attitudeEntries) return [];
    const gps = new Map<string, string>();
    attitudeEntries.forEach((entry) => {
      const name = entry.gamePresenter?.name || entry.gpName || 'Unknown';
      gps.set(name, name);
    });
    return Array.from(gps.values()).sort();
  }, [attitudeEntries]);

  // Filtered attitude entries
  const filteredAttitudeEntries = useMemo(() => {
    if (!attitudeEntries) return [];
    return attitudeEntries.filter(entry => {
      // GP filter
      if (attitudeFilterGP !== 'all') {
        const gpName = entry.gamePresenter?.name || entry.gpName || 'Unknown';
        if (gpName !== attitudeFilterGP) return false;
      }
      // Month filter
      if (attitudeFilterMonth !== null && entry.month !== attitudeFilterMonth) return false;
      // Year filter
      if (attitudeFilterYear !== null && entry.year !== attitudeFilterYear) return false;
      // Type filter
      if (attitudeFilterType !== 'all') {
        const isPositive = entry.attitudeType === 'positive' || (entry.attitudeScore && entry.attitudeScore > 0);
        if (attitudeFilterType === 'positive' && !isPositive) return false;
        if (attitudeFilterType === 'negative' && isPositive) return false;
      }
      // Search filter
      if (attitudeSearchQuery) {
        const searchLower = attitudeSearchQuery.toLowerCase();
        const gpName = (entry.gamePresenter?.name || entry.gpName || '').toLowerCase();
        const comment = (entry.comment || entry.description || '').toLowerCase();
        if (!gpName.includes(searchLower) && !comment.includes(searchLower)) return false;
      }
      return true;
    });
  }, [attitudeEntries, attitudeFilterGP, attitudeFilterMonth, attitudeFilterYear, attitudeFilterType, attitudeSearchQuery]);

  // Statistics
  const stats = useMemo(() => {
    if (!evaluations) return { total: 0, thisMonth: 0, avgScore: 0, topScore: 0 };
    const now = new Date();
    const thisMonthEvals = evaluations.filter(({ evaluation }) => {
      const date = evaluation.evaluationDate ? new Date(evaluation.evaluationDate) : null;
      return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    const scores = evaluations.map(({ evaluation }) => evaluation.totalScore || 0).filter(s => s > 0);
    return {
      total: evaluations.length,
      thisMonth: thisMonthEvals.length,
      avgScore: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
      topScore: scores.length ? Math.max(...scores) : 0,
    };
  }, [evaluations]);

  // Filter and sort evaluations
  const filteredEvaluations = useMemo(() => {
    if (!evaluations) return [];
    
    let filtered = evaluations.filter(({ evaluation, gamePresenter }) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const gpName = gamePresenter?.name?.toLowerCase() || "";
        const evaluator = evaluation.evaluatorName?.toLowerCase() || "";
        const game = evaluation.game?.toLowerCase() || "";
        if (!gpName.includes(query) && !evaluator.includes(query) && !game.includes(query)) {
          return false;
        }
      }
      
      // GP filter
      if (filterGP && filterGP !== "all" && gamePresenter?.id !== Number(filterGP)) {
        return false;
      }
      
      // Month/Year filter
      if (filterMonth !== null || filterYear !== null) {
        const evalDate = evaluation.evaluationDate ? new Date(evaluation.evaluationDate) : null;
        if (evalDate) {
          if (filterMonth !== null && evalDate.getMonth() + 1 !== filterMonth) return false;
          if (filterYear !== null && evalDate.getFullYear() !== filterYear) return false;
        } else {
          return false;
        }
      }
      
      return true;
    });
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date":
          const dateA = a.evaluation.evaluationDate ? new Date(a.evaluation.evaluationDate).getTime() : 0;
          const dateB = b.evaluation.evaluationDate ? new Date(b.evaluation.evaluationDate).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case "score":
          comparison = (a.evaluation.totalScore || 0) - (b.evaluation.totalScore || 0);
          break;
        case "name":
          comparison = (a.gamePresenter?.name || "").localeCompare(b.gamePresenter?.name || "");
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });
    
    return filtered;
  }, [evaluations, searchQuery, filterMonth, filterYear, filterGP, sortBy, sortOrder]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterMonth(null);
    setFilterYear(null);
    setFilterGP("all");
  };

  const hasActiveFilters = searchQuery || filterMonth !== null || filterYear !== null || (filterGP && filterGP !== "all");
  
  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEvaluations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEvaluations.map(e => e.evaluation.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  
  const deleteMutation = trpc.evaluation.delete.useMutation({
    onSuccess: () => {
      toast.success("Evaluation deleted");
      utils.evaluation.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const updateMutation = trpc.evaluation.update.useMutation({
    onSuccess: () => {
      toast.success("Evaluation updated");
      setEditDialogOpen(false);
      setEditingEval(null);
      utils.evaluation.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const deleteByMonthMutation = trpc.evaluation.deleteByMonth.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deletedCount} evaluations`);
      utils.evaluation.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to clear: " + error.message);
    },
  });

  const handleEdit = (evaluation: any) => {
    setEditingEval({
      id: evaluation.id,
      evaluatorName: evaluation.evaluatorName || "",
      game: evaluation.game || "",
      hairScore: evaluation.hairScore || 0,
      makeupScore: evaluation.makeupScore || 0,
      outfitScore: evaluation.outfitScore || 0,
      postureScore: evaluation.postureScore || 0,
      dealingStyleScore: evaluation.dealingStyleScore || 0,
      gamePerformanceScore: evaluation.gamePerformanceScore || 0,
      hairComment: evaluation.hairComment || "",
      makeupComment: evaluation.makeupComment || "",
      outfitComment: evaluation.outfitComment || "",
      postureComment: evaluation.postureComment || "",
      dealingStyleComment: evaluation.dealingStyleComment || "",
      gamePerformanceComment: evaluation.gamePerformanceComment || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingEval) return;
    updateMutation.mutate(editingEval);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const id of ids) {
      try {
        await deleteMutation.mutateAsync({ id });
        deleted++;
      } catch (e) {
        // Continue with others
      }
    }
    setSelectedIds(new Set());
    toast.success(`Deleted ${deleted} evaluations`);
  };

  const handleClearMonth = () => {
    deleteByMonthMutation.mutate({ year: clearYear, month: clearMonth });
  };

  const getScoreBadge = (score: number, max: number = 24) => {
    const pct = score / max;
    if (pct >= 0.85) return "bg-green-500/20 text-green-400 border border-green-500/30";
    if (pct >= 0.7) return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
    if (score > 0) return "bg-red-500/20 text-red-400 border border-red-500/30";
    return "bg-gray-500/20 text-gray-400";
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
        {/* Page Header Skeleton */}
        <div className="page-header">
          <div className="skeleton-enhanced h-8 w-48 rounded-lg" />
          <div className="skeleton-enhanced h-4 w-64 rounded mt-2" />
        </div>
        
        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card-enhanced stat-card-violet p-5">
              <div className="flex items-center gap-3">
                <div className="skeleton-enhanced h-10 w-10 rounded-xl" />
                <div className="flex-1">
                  <div className="skeleton-enhanced h-3 w-20 rounded mb-2" />
                  <div className="skeleton-enhanced h-6 w-16 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Table Skeleton */}
        <div className="unified-card">
          <div className="unified-card-header">
            <div className="skeleton-enhanced h-5 w-32 rounded" />
          </div>
          <div className="unified-card-body">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton-enhanced h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h1 className="page-title">Evaluations</h1>
          <p className="page-subtitle">
            View and manage evaluation data
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Selected Evaluations</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {selectedIds.size} evaluations? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          {/* Clear by Month */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash className="h-4 w-4 mr-2" />
                Clear Month
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Evaluations by Month</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all evaluations for the selected month. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div>
                  <Label>Month</Label>
                  <Select value={String(clearMonth)} onValueChange={(v) => setClearMonth(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year</Label>
                  <Select value={String(clearYear)} onValueChange={(v) => setClearYear(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map((year) => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearMonth} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-stagger">
        <div className="stat-card-enhanced stat-card-violet">
          <div className="icon-box">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Evaluations</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-indigo">
          <div className="icon-box">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold">{stats.thisMonth}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-violet">
          <div className="icon-box">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Average Score</p>
            <p className="text-2xl font-bold">{stats.avgScore}<span className="text-lg text-muted-foreground">/24</span></p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-green">
          <div className="icon-box">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Top Score</p>
            <p className="text-2xl font-bold text-green-400">{stats.topScore}</p>
          </div>
        </div>
      </div>

      {/* Tabs for Evaluations and Attitude */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "evaluations" | "attitude")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-white/5 border border-white/10 rounded-xl p-1">
          <TabsTrigger value="evaluations" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-indigo-500/20 data-[state=active]:border-violet-500/30 rounded-lg transition-all">
            <FileSpreadsheet className="h-4 w-4" />
            Evaluations ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="attitude" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500/20 data-[state=active]:to-rose-500/20 data-[state=active]:border-pink-500/30 rounded-lg transition-all">
            <Heart className="h-4 w-4" />
            Attitude ({attitudeStats.total})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="evaluations" className="mt-4">
          <div className="unified-card">
            <div className="unified-card-header">
              <div className="flex items-center justify-between">
                <div className="section-header" style={{ paddingLeft: 0 }}>
                  <h3 className="section-title">All Evaluations</h3>
                  <p className="section-subtitle">
                    {filteredEvaluations.length} of {evaluations?.length || 0} evaluations
                    {hasActiveFilters && " (filtered)"}
                  </p>
                </div>
              </div>
            </div>
        <div className="unified-card-body space-y-4">
          {/* Search and Filter Bar */}
          <div className="filter-bar">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by GP name, evaluator, or game..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterGP} onValueChange={setFilterGP}>
              <SelectTrigger className="w-[180px]">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All GPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All GPs</SelectItem>
                {uniqueGPs.map((gp) => (
                  <SelectItem key={gp.id} value={String(gp.id)}>{gp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterMonth !== null ? String(filterMonth) : "all"} onValueChange={(v) => setFilterMonth(v === "all" ? null : Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTHS.map((month, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterYear !== null ? String(filterYear) : "all"} onValueChange={(v) => setFilterYear(v === "all" ? null : Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {[2024, 2025, 2026].map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => { setSortBy("date"); setSortOrder("desc"); }}>
                  Date (Newest)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy("date"); setSortOrder("asc"); }}>
                  Date (Oldest)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setSortBy("score"); setSortOrder("desc"); }}>
                  Score (Highest)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy("score"); setSortOrder("asc"); }}>
                  Score (Lowest)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setSortBy("name"); setSortOrder("asc"); }}>
                  Name (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy("name"); setSortOrder("desc"); }}>
                  Name (Z-A)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Evaluations Table */}
          {filteredEvaluations.length > 0 ? (
            <div className="table-enhanced">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.size === filteredEvaluations.length && filteredEvaluations.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Game Presenter</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Evaluator</TableHead>
                    <TableHead className="text-center">Appearance</TableHead>
                    <TableHead className="text-center">Performance</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvaluations.map(({ evaluation, gamePresenter }) => {
                    const appearanceScore = (evaluation.hairScore || 0) + (evaluation.makeupScore || 0) + 
                                           (evaluation.outfitScore || 0) + (evaluation.postureScore || 0);
                    const performanceScore = (evaluation.dealingStyleScore || 0) + (evaluation.gamePerformanceScore || 0);
                    
                    return (
                      <TableRow key={evaluation.id} className="table-row-enhanced">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(evaluation.id)}
                            onCheckedChange={() => toggleSelect(evaluation.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {gamePresenter?.name || "Unknown GP"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {evaluation.evaluationDate 
                            ? format(new Date(evaluation.evaluationDate), "dd MMM yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{evaluation.game || "-"}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {evaluation.evaluatorName || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`score-pill-${appearanceScore >= 10 ? 'excellent' : appearanceScore >= 8 ? 'good' : 'poor'}`}>
                            {appearanceScore}/12
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`score-pill-${performanceScore >= 10 ? 'excellent' : performanceScore >= 8 ? 'good' : 'poor'}`}>
                            {performanceScore}/12
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`score-pill-${(evaluation.totalScore || 0) >= 20 ? 'excellent' : (evaluation.totalScore || 0) >= 16 ? 'good' : 'poor'} text-base font-bold`}>
                            {evaluation.totalScore || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View Details */}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => setViewingEval({ evaluation, gamePresenter })}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            
                            {/* Edit */}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(evaluation)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            
                            {/* Delete */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Evaluation</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this evaluation for {gamePresenter?.name}? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(evaluation.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Image className="h-8 w-8" />
              </div>
              <h3 className="empty-state-title">
                {hasActiveFilters ? "No matching evaluations" : "No evaluations yet"}
              </h3>
              <p className="empty-state-description">
                {hasActiveFilters 
                  ? "Try adjusting your filters or search query"
                  : "Upload evaluation screenshots to get started"}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
        </TabsContent>

        {/* Attitude Tab */}
        <TabsContent value="attitude" className="mt-4">
          <div className="unified-card">
            <div className="unified-card-header">
              <div className="flex items-center justify-between">
                <div className="section-header" style={{ paddingLeft: 0 }}>
                  <h3 className="section-title">Attitude Entries</h3>
                  <p className="section-subtitle">
                    {filteredAttitudeEntries.length} of {attitudeEntries?.length || 0} entries
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600">{attitudeStats.positive} Positive</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-600">{attitudeStats.negative} Negative</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="unified-card-body">
              {/* Filters */}
              <div className="filter-bar mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by GP or comment..."
                    value={attitudeSearchQuery}
                    onChange={(e) => setAttitudeSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={attitudeFilterGP} onValueChange={setAttitudeFilterGP}>
                  <SelectTrigger className="w-[160px] h-9">
                    <User className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All GPs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All GPs</SelectItem>
                    {attitudeUniqueGPs.map((gp) => (
                      <SelectItem key={gp} value={gp}>{gp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={attitudeFilterMonth?.toString() || 'all'} onValueChange={(v) => setAttitudeFilterMonth(v === 'all' ? null : parseInt(v))}>
                  <SelectTrigger className="w-[140px] h-9">
                    <Calendar className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {MONTHS.map((month, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={attitudeFilterType} onValueChange={setAttitudeFilterType}>
                  <SelectTrigger className="w-[130px] h-9">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                  </SelectContent>
                </Select>
                {(attitudeFilterGP !== 'all' || attitudeFilterMonth !== null || attitudeFilterType !== 'all' || attitudeSearchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAttitudeFilterGP('all');
                      setAttitudeFilterMonth(null);
                      setAttitudeFilterYear(null);
                      setAttitudeFilterType('all');
                      setAttitudeSearchQuery('');
                    }}
                    className="h-9"
                  >
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>
              {isLoadingAttitude ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredAttitudeEntries.length > 0 ? (
                <div className="table-enhanced">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Game Presenter</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Comment</TableHead>
                        <TableHead className="text-center">Score</TableHead>
                        <TableHead className="text-center w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAttitudeEntries.map((entry) => (
                        <TableRow key={entry.id} className="table-row-enhanced">
                          <TableCell className="font-medium">
                            {entry.gamePresenter?.name || entry.gpName || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.evaluationDate 
                              ? format(new Date(entry.evaluationDate), "dd MMM yyyy, HH:mm")
                              : entry.createdAt
                              ? format(new Date(entry.createdAt), "dd MMM yyyy, HH:mm")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const isPositive = entry.attitudeType === 'positive' || (entry.attitudeScore && entry.attitudeScore > 0);
                              return (
                                <Badge 
                                  variant="outline" 
                                  className={isPositive 
                                    ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                                  }
                                >
                                  {isPositive ? (
                                    <><ThumbsUp className="h-3 w-3 mr-1" /> POSITIVE</>
                                  ) : (
                                    <><ThumbsDown className="h-3 w-3 mr-1" /> NEGATIVE</>
                                  )}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate" title={entry.comment || entry.description || ''}>
                              {entry.comment || entry.description || '-'}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              (entry.attitudeScore || 0) > 0 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {(entry.attitudeScore || 0) > 0 ? '+' : ''}{entry.attitudeScore || 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Attitude Entry</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this attitude entry? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteAttitudeMutation.mutate({ id: entry.id })}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Heart className="h-8 w-8" />
                  </div>
                  <h3 className="empty-state-title">No attitude entries yet</h3>
                  <p className="empty-state-description">
                    Upload attitude screenshots in the Upload section to track GP behavior
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Evaluation</DialogTitle>
            <DialogDescription>
              Modify the evaluation scores and comments. Changes will be saved immediately.
            </DialogDescription>
          </DialogHeader>
          {editingEval && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Evaluator Name</Label>
                  <Input
                    value={editingEval.evaluatorName}
                    onChange={(e) => setEditingEval({ ...editingEval, evaluatorName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Game</Label>
                  <Input
                    value={editingEval.game}
                    onChange={(e) => setEditingEval({ ...editingEval, game: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Appearance Scores</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Hair (0-3)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="3"
                      value={editingEval.hairScore}
                      onChange={(e) => setEditingEval({ ...editingEval, hairScore: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Makeup (0-3)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="3"
                      value={editingEval.makeupScore}
                      onChange={(e) => setEditingEval({ ...editingEval, makeupScore: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Outfit (0-3)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="3"
                      value={editingEval.outfitScore}
                      onChange={(e) => setEditingEval({ ...editingEval, outfitScore: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Posture (0-3)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="3"
                      value={editingEval.postureScore}
                      onChange={(e) => setEditingEval({ ...editingEval, postureScore: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Performance Scores</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dealing Style (0-6)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="6"
                      value={editingEval.dealingStyleScore}
                      onChange={(e) => setEditingEval({ ...editingEval, dealingStyleScore: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Game Performance (0-6)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="6"
                      value={editingEval.gamePerformanceScore}
                      onChange={(e) => setEditingEval({ ...editingEval, gamePerformanceScore: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Comments</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Hair Comment</Label>
                    <Input
                      value={editingEval.hairComment}
                      onChange={(e) => setEditingEval({ ...editingEval, hairComment: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Makeup Comment</Label>
                    <Input
                      value={editingEval.makeupComment}
                      onChange={(e) => setEditingEval({ ...editingEval, makeupComment: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Outfit Comment</Label>
                    <Input
                      value={editingEval.outfitComment}
                      onChange={(e) => setEditingEval({ ...editingEval, outfitComment: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Posture Comment</Label>
                    <Input
                      value={editingEval.postureComment}
                      onChange={(e) => setEditingEval({ ...editingEval, postureComment: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Dealing Style Comment</Label>
                    <Input
                      value={editingEval.dealingStyleComment}
                      onChange={(e) => setEditingEval({ ...editingEval, dealingStyleComment: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Game Performance Comment</Label>
                    <Input
                      value={editingEval.gamePerformanceComment}
                      onChange={(e) => setEditingEval({ ...editingEval, gamePerformanceComment: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evaluation Detail View */}
      {viewingEval && (
        <EvaluationDetailView
          evaluation={viewingEval.evaluation}
          gamePresenter={viewingEval.gamePresenter}
          open={!!viewingEval}
          onOpenChange={(open) => !open && setViewingEval(null)}
        />
      )}
    </div>
  );
}

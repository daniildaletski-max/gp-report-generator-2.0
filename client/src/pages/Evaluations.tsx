import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
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
import { Eye, Pencil, Trash2, Image, Trash, Search, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EvaluationsPage() {
  const utils = trpc.useUtils();
  const { data: evaluations, isLoading } = trpc.evaluation.list.useQuery();
  
  const [editingEval, setEditingEval] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clearMonth, setClearMonth] = useState(new Date().getMonth() + 1);
  const [clearYear, setClearYear] = useState(new Date().getFullYear());
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "score" | "name">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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
  }, [evaluations, searchQuery, filterMonth, filterYear, sortBy, sortOrder]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterMonth(null);
    setFilterYear(null);
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

  const handleClearMonth = () => {
    deleteByMonthMutation.mutate({ year: clearYear, month: clearMonth });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evaluations</h1>
          <p className="text-muted-foreground">View all uploaded evaluation data</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evaluations</h1>
          <p className="text-muted-foreground">
            View and manage evaluation data ({evaluations?.length || 0} total)
          </p>
        </div>
        
        {/* Clear by Month */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
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

      <Card>
        <CardHeader>
          <CardTitle>All Evaluations</CardTitle>
          <CardDescription>
            Extracted data from uploaded evaluation screenshots. Click Edit to modify or Delete to remove.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by GP name, evaluator, or game..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={filterMonth !== null ? String(filterMonth) : "all"}
                onValueChange={(v) => setFilterMonth(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((month, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterYear !== null ? String(filterYear) : "all"}
                onValueChange={(v) => setFilterYear(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={`${sortBy}-${sortOrder}`}
                onValueChange={(v) => {
                  const [by, order] = v.split("-") as ["date" | "score" | "name", "asc" | "desc"];
                  setSortBy(by);
                  setSortOrder(order);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest First</SelectItem>
                  <SelectItem value="date-asc">Oldest First</SelectItem>
                  <SelectItem value="score-desc">Highest Score</SelectItem>
                  <SelectItem value="score-asc">Lowest Score</SelectItem>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="name-desc">Name Z-A</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery || filterMonth !== null || filterYear !== null) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          
          {/* Results count */}
          <div className="text-sm text-muted-foreground">
            Showing {filteredEvaluations.length} of {evaluations?.length || 0} evaluations
          </div>

          {filteredEvaluations.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game Presenter</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Evaluator</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Hair</TableHead>
                    <TableHead className="text-center">Makeup</TableHead>
                    <TableHead className="text-center">Outfit</TableHead>
                    <TableHead className="text-center">Posture</TableHead>
                    <TableHead className="text-center">Dealing</TableHead>
                    <TableHead className="text-center">Game Perf</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvaluations.map(({ evaluation, gamePresenter }) => (
                    <TableRow key={evaluation.id}>
                      <TableCell className="font-medium">
                        {gamePresenter?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {evaluation.evaluationDate
                          ? format(new Date(evaluation.evaluationDate), "dd MMM yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {evaluation.game && (
                          <Badge variant="secondary">{evaluation.game}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {evaluation.evaluatorName || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default" className="font-bold">
                          {evaluation.totalScore || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {evaluation.hairScore !== null
                          ? `${evaluation.hairScore}/${evaluation.hairMaxScore}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {evaluation.makeupScore !== null
                          ? `${evaluation.makeupScore}/${evaluation.makeupMaxScore}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {evaluation.outfitScore !== null
                          ? `${evaluation.outfitScore}/${evaluation.outfitMaxScore}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {evaluation.postureScore !== null
                          ? `${evaluation.postureScore}/${evaluation.postureMaxScore}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {evaluation.dealingStyleScore !== null
                          ? `${evaluation.dealingStyleScore}/${evaluation.dealingStyleMaxScore}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {evaluation.gamePerformanceScore !== null
                          ? `${evaluation.gamePerformanceScore}/${evaluation.gamePerformanceMaxScore}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Dialog */}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>
                                  Evaluation Details - {gamePresenter?.name}
                                </DialogTitle>
                                <DialogDescription>
                                  {evaluation.evaluationDate
                                    ? format(new Date(evaluation.evaluationDate), "dd MMMM yyyy")
                                    : "No date"}{" "}
                                  | {evaluation.game || "No game"}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="font-semibold mb-2">Scores</h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span>Hair:</span>
                                        <span>{evaluation.hairScore}/{evaluation.hairMaxScore}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Makeup:</span>
                                        <span>{evaluation.makeupScore}/{evaluation.makeupMaxScore}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Outfit:</span>
                                        <span>{evaluation.outfitScore}/{evaluation.outfitMaxScore}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Posture:</span>
                                        <span>{evaluation.postureScore}/{evaluation.postureMaxScore}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Dealing Style:</span>
                                        <span>{evaluation.dealingStyleScore}/{evaluation.dealingStyleMaxScore}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Game Performance:</span>
                                        <span>{evaluation.gamePerformanceScore}/{evaluation.gamePerformanceMaxScore}</span>
                                      </div>
                                      <div className="flex justify-between font-bold pt-2 border-t">
                                        <span>Total:</span>
                                        <span>{evaluation.totalScore}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className="font-semibold mb-2">Comments</h4>
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                      {evaluation.hairComment && <p><span className="font-medium">Hair:</span> {evaluation.hairComment}</p>}
                                      {evaluation.makeupComment && <p><span className="font-medium">Makeup:</span> {evaluation.makeupComment}</p>}
                                      {evaluation.outfitComment && <p><span className="font-medium">Outfit:</span> {evaluation.outfitComment}</p>}
                                      {evaluation.postureComment && <p><span className="font-medium">Posture:</span> {evaluation.postureComment}</p>}
                                      {evaluation.dealingStyleComment && <p><span className="font-medium">Dealing:</span> {evaluation.dealingStyleComment}</p>}
                                      {evaluation.gamePerformanceComment && <p><span className="font-medium">Game Perf:</span> {evaluation.gamePerformanceComment}</p>}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  {evaluation.screenshotUrl ? (
                                    <img src={evaluation.screenshotUrl} alt="Evaluation screenshot" className="w-full rounded-lg border" />
                                  ) : (
                                    <div className="w-full aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
                                      <Image className="h-12 w-12 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {/* Edit Button */}
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(evaluation)}>
                            <Pencil className="h-4 w-4" />
                          </Button>

                          {/* Delete Button */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
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
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No evaluations yet</h3>
              <p className="text-muted-foreground">Upload evaluation screenshots to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
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
              
              <div className="grid grid-cols-3 gap-4">
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
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                <div>
                  <Label>Dealing Style (0-5)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    value={editingEval.dealingStyleScore}
                    onChange={(e) => setEditingEval({ ...editingEval, dealingStyleScore: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Game Perf (0-5)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    value={editingEval.gamePerformanceScore}
                    onChange={(e) => setEditingEval({ ...editingEval, gamePerformanceScore: Number(e.target.value) })}
                  />
                </div>
              </div>

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
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

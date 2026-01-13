import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Image } from "lucide-react";
import { format } from "date-fns";

export default function EvaluationsPage() {
  const { data: evaluations, isLoading } = trpc.evaluation.list.useQuery();

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Evaluations</h1>
        <p className="text-muted-foreground">
          View all uploaded evaluation data ({evaluations?.length || 0} total)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Evaluations</CardTitle>
          <CardDescription>
            Extracted data from uploaded evaluation screenshots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evaluations && evaluations.length > 0 ? (
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
                  {evaluations.map(({ evaluation, gamePresenter }) => (
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
                                      <span>
                                        {evaluation.hairScore}/{evaluation.hairMaxScore}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Makeup:</span>
                                      <span>
                                        {evaluation.makeupScore}/{evaluation.makeupMaxScore}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Outfit:</span>
                                      <span>
                                        {evaluation.outfitScore}/{evaluation.outfitMaxScore}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Posture:</span>
                                      <span>
                                        {evaluation.postureScore}/{evaluation.postureMaxScore}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Dealing Style:</span>
                                      <span>
                                        {evaluation.dealingStyleScore}/{evaluation.dealingStyleMaxScore}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Game Performance:</span>
                                      <span>
                                        {evaluation.gamePerformanceScore}/{evaluation.gamePerformanceMaxScore}
                                      </span>
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
                                    {evaluation.hairComment && (
                                      <p>
                                        <span className="font-medium">Hair:</span>{" "}
                                        {evaluation.hairComment}
                                      </p>
                                    )}
                                    {evaluation.makeupComment && (
                                      <p>
                                        <span className="font-medium">Makeup:</span>{" "}
                                        {evaluation.makeupComment}
                                      </p>
                                    )}
                                    {evaluation.outfitComment && (
                                      <p>
                                        <span className="font-medium">Outfit:</span>{" "}
                                        {evaluation.outfitComment}
                                      </p>
                                    )}
                                    {evaluation.postureComment && (
                                      <p>
                                        <span className="font-medium">Posture:</span>{" "}
                                        {evaluation.postureComment}
                                      </p>
                                    )}
                                    {evaluation.dealingStyleComment && (
                                      <p>
                                        <span className="font-medium">Dealing:</span>{" "}
                                        {evaluation.dealingStyleComment}
                                      </p>
                                    )}
                                    {evaluation.gamePerformanceComment && (
                                      <p>
                                        <span className="font-medium">Game Perf:</span>{" "}
                                        {evaluation.gamePerformanceComment}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div>
                                {evaluation.screenshotUrl ? (
                                  <img
                                    src={evaluation.screenshotUrl}
                                    alt="Evaluation screenshot"
                                    className="w-full rounded-lg border"
                                  />
                                ) : (
                                  <div className="w-full aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
                                    <Image className="h-12 w-12 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
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
              <p className="text-muted-foreground">
                Upload evaluation screenshots to get started
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, 
  Calendar, 
  Gamepad2, 
  Star, 
  Eye, 
  FileText, 
  BarChart3, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Scissors,
  Palette,
  Shirt,
  PersonStanding,
  Dices,
  Trophy,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import { format } from "date-fns";

interface EvaluationData {
  id: number;
  gamePresenterId: number;
  evaluationDate: string | null;
  evaluatorName: string | null;
  game: string | null;
  totalScore: number | null;
  hairScore: number | null;
  hairComment: string | null;
  makeupScore: number | null;
  makeupComment: string | null;
  outfitScore: number | null;
  outfitComment: string | null;
  postureScore: number | null;
  postureComment: string | null;
  dealingStyleScore: number | null;
  dealingStyleComment: string | null;
  gamePerformanceScore: number | null;
  gamePerformanceComment: string | null;
  appearanceScore: number | null;
  gamePerformanceTotalScore: number | null;
  screenshotUrl: string | null;
}

interface GamePresenter {
  id: number;
  name: string;
}

interface EvaluationDetailViewProps {
  evaluation: EvaluationData;
  gamePresenter: GamePresenter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  averageScores?: {
    hair: number;
    makeup: number;
    outfit: number;
    posture: number;
    dealingStyle: number;
    gamePerformance: number;
    total: number;
  };
}

const ScoreCategory = ({ 
  icon: Icon, 
  label, 
  score, 
  maxScore, 
  comment,
  averageScore,
  color = "blue"
}: { 
  icon: React.ElementType;
  label: string; 
  score: number | null; 
  maxScore: number;
  comment: string | null;
  averageScore?: number;
  color?: string;
}) => {
  const percentage = score !== null ? (score / maxScore) * 100 : 0;
  const isAboveAverage = averageScore !== undefined && score !== null && score > averageScore;
  const isBelowAverage = averageScore !== undefined && score !== null && score < averageScore;
  
  const getScoreColor = () => {
    if (score === null) return "text-muted-foreground";
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = () => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md bg-${color}-100 dark:bg-${color}-900/30`}>
            <Icon className={`h-4 w-4 text-${color}-600 dark:text-${color}-400`} />
          </div>
          <span className="font-medium text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${getScoreColor()}`}>
            {score !== null ? score : "-"}/{maxScore}
          </span>
          {averageScore !== undefined && score !== null && (
            <div className="flex items-center">
              {isAboveAverage && <TrendingUp className="h-4 w-4 text-green-500" />}
              {isBelowAverage && <TrendingDown className="h-4 w-4 text-red-500" />}
              {!isAboveAverage && !isBelowAverage && <Minus className="h-4 w-4 text-muted-foreground" />}
            </div>
          )}
        </div>
      </div>
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${getProgressColor()}`}
          style={{ width: `${percentage}%` }}
        />
        {averageScore !== undefined && (
          <div 
            className="absolute top-0 h-full w-0.5 bg-blue-600"
            style={{ left: `${(averageScore / maxScore) * 100}%` }}
            title={`Team average: ${averageScore.toFixed(1)}`}
          />
        )}
      </div>
      {comment && (
        <div className="flex items-start gap-2 mt-2 p-2 bg-background rounded border">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">{comment}</p>
        </div>
      )}
    </div>
  );
};

const TotalScoreBadge = ({ score, maxScore = 22 }: { score: number | null; maxScore?: number }) => {
  if (score === null) return null;
  
  const percentage = (score / maxScore) * 100;
  let bgColor = "bg-red-500";
  let label = "Needs Improvement";
  
  if (percentage >= 90) {
    bgColor = "bg-green-500";
    label = "Excellent";
  } else if (percentage >= 75) {
    bgColor = "bg-emerald-500";
    label = "Good";
  } else if (percentage >= 60) {
    bgColor = "bg-yellow-500";
    label = "Average";
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${bgColor} text-white rounded-full w-20 h-20 flex items-center justify-center shadow-lg`}>
        <span className="text-2xl font-bold">{score}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">of {maxScore}</span>
      <Badge variant="outline" className="text-xs">{label}</Badge>
    </div>
  );
};

export default function EvaluationDetailView({ 
  evaluation, 
  gamePresenter, 
  open, 
  onOpenChange,
  averageScores 
}: EvaluationDetailViewProps) {
  const [imageZoom, setImageZoom] = useState(1);
  const [activeTab, setActiveTab] = useState("comparison");

  const appearanceScore = (evaluation.hairScore || 0) + (evaluation.makeupScore || 0) + 
                          (evaluation.outfitScore || 0) + (evaluation.postureScore || 0);
  const performanceScore = (evaluation.dealingStyleScore || 0) + (evaluation.gamePerformanceScore || 0);

  const handleZoomIn = () => setImageZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setImageZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setImageZoom(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">{gamePresenter?.name || "Unknown GP"}</DialogTitle>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  {evaluation.evaluationDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(evaluation.evaluationDate), "dd MMM yyyy")}
                    </span>
                  )}
                  {evaluation.game && (
                    <span className="flex items-center gap-1">
                      <Gamepad2 className="h-3.5 w-3.5" />
                      {evaluation.game}
                    </span>
                  )}
                  {evaluation.evaluatorName && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      by {evaluation.evaluatorName}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <TotalScoreBadge score={evaluation.totalScore} />
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="px-6 py-2 border-b bg-background">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="comparison" className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                Compare
              </TabsTrigger>
              <TabsTrigger value="details" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="screenshot" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Screenshot
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="comparison" className="flex-1 m-0 p-0 data-[state=inactive]:hidden">
            <div className="grid grid-cols-2 h-full divide-x">
              {/* Left: Screenshot */}
              <div className="flex flex-col h-full">
                <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Original Screenshot
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(imageZoom * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleResetZoom}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 flex items-start justify-center min-h-full">
                    {evaluation.screenshotUrl ? (
                      <img 
                        src={evaluation.screenshotUrl} 
                        alt="Evaluation screenshot"
                        className="rounded-lg border shadow-sm transition-transform duration-200"
                        style={{ transform: `scale(${imageZoom})`, transformOrigin: 'top center' }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <Eye className="h-12 w-12 mb-2 opacity-30" />
                        <p>No screenshot available</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Extracted Data */}
              <div className="flex flex-col h-full">
                <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Extracted Data
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                    Verified
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Appearance</span>
                            <Sparkles className="h-4 w-4 text-blue-500" />
                          </div>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{appearanceScore}/12</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-[#d4af37]/10 to-[#d4af37]/5 border-[#d4af37]/20">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Performance</span>
                            <Trophy className="h-4 w-4 text-[#d4af37]" />
                          </div>
                          <p className="text-2xl font-bold text-[#d4af37]">{performanceScore}/10</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Appearance Section */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                        <Sparkles className="h-4 w-4" />
                        Appearance Scores
                      </h4>
                      <div className="space-y-2">
                        <ScoreCategory 
                          icon={Scissors} 
                          label="Hair" 
                          score={evaluation.hairScore} 
                          maxScore={3}
                          comment={evaluation.hairComment}
                          averageScore={averageScores?.hair}
                          color="pink"
                        />
                        <ScoreCategory 
                          icon={Palette} 
                          label="Makeup" 
                          score={evaluation.makeupScore} 
                          maxScore={3}
                          comment={evaluation.makeupComment}
                          averageScore={averageScores?.makeup}
                          color="rose"
                        />
                        <ScoreCategory 
                          icon={Shirt} 
                          label="Outfit" 
                          score={evaluation.outfitScore} 
                          maxScore={3}
                          comment={evaluation.outfitComment}
                          averageScore={averageScores?.outfit}
                          color="sky"
                        />
                        <ScoreCategory 
                          icon={PersonStanding} 
                          label="Posture" 
                          score={evaluation.postureScore} 
                          maxScore={3}
                          comment={evaluation.postureComment}
                          averageScore={averageScores?.posture}
                          color="indigo"
                        />
                      </div>
                    </div>

                    {/* Performance Section */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                        <Trophy className="h-4 w-4" />
                        Performance Scores
                      </h4>
                      <div className="space-y-2">
                        <ScoreCategory 
                          icon={Dices} 
                          label="Dealing Style" 
                          score={evaluation.dealingStyleScore} 
                          maxScore={5}
                          comment={evaluation.dealingStyleComment}
                          averageScore={averageScores?.dealingStyle}
                          color="violet"
                        />
                        <ScoreCategory 
                          icon={Star} 
                          label="Game Performance" 
                          score={evaluation.gamePerformanceScore} 
                          maxScore={5}
                          comment={evaluation.gamePerformanceComment}
                          averageScore={averageScores?.gamePerformance}
                          color="indigo"
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details" className="flex-1 m-0 p-6 data-[state=inactive]:hidden overflow-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Score Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Score Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20">
                      <p className="text-4xl font-bold text-green-600">{evaluation.totalScore || 0}</p>
                      <p className="text-sm text-muted-foreground mt-1">Total Score</p>
                      <p className="text-xs text-muted-foreground">out of 22</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20">
                      <p className="text-4xl font-bold text-blue-600">{appearanceScore}</p>
                      <p className="text-sm text-muted-foreground mt-1">Appearance</p>
                      <p className="text-xs text-muted-foreground">out of 12</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-gradient-to-br from-[#d4af37]/10 to-[#d4af37]/5">
                      <p className="text-4xl font-bold text-[#d4af37]">{performanceScore}</p>
                      <p className="text-sm text-muted-foreground mt-1">Performance</p>
                      <p className="text-xs text-muted-foreground">out of 10</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* All Scores */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Appearance Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ScoreCategory icon={Scissors} label="Hair" score={evaluation.hairScore} maxScore={3} comment={evaluation.hairComment} color="pink" />
                    <ScoreCategory icon={Palette} label="Makeup" score={evaluation.makeupScore} maxScore={3} comment={evaluation.makeupComment} color="rose" />
                    <ScoreCategory icon={Shirt} label="Outfit" score={evaluation.outfitScore} maxScore={3} comment={evaluation.outfitComment} color="sky" />
                    <ScoreCategory icon={PersonStanding} label="Posture" score={evaluation.postureScore} maxScore={3} comment={evaluation.postureComment} color="indigo" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Performance Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ScoreCategory icon={Dices} label="Dealing Style" score={evaluation.dealingStyleScore} maxScore={5} comment={evaluation.dealingStyleComment} color="violet" />
                    <ScoreCategory icon={Star} label="Game Performance" score={evaluation.gamePerformanceScore} maxScore={5} comment={evaluation.gamePerformanceComment} color="indigo" />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="screenshot" className="flex-1 m-0 data-[state=inactive]:hidden">
            <div className="h-full flex flex-col">
              <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                <h3 className="font-semibold text-sm">Full Screenshot View</h3>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(imageZoom * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleResetZoom}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6 flex items-center justify-center min-h-full">
                  {evaluation.screenshotUrl ? (
                    <img 
                      src={evaluation.screenshotUrl} 
                      alt="Evaluation screenshot"
                      className="rounded-lg border shadow-lg transition-transform duration-200"
                      style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center center' }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <Eye className="h-16 w-16 mb-4 opacity-30" />
                      <p className="text-lg">No screenshot available</p>
                      <p className="text-sm">This evaluation was created without a screenshot</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

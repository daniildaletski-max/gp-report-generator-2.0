import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Star, Calendar, User, Gamepad2, Eye, Sparkles, Scissors, Palette, Shirt, PersonStanding, Loader2, AlertCircle, TrendingUp, AlertTriangle, Trophy, Target, Gift, ThumbsUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function GPPortal() {
  const { token } = useParams<{ token: string }>();
  
  const { data, isLoading, error } = trpc.gpAccess.getEvaluationsByToken.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your evaluations...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-700">Access Denied</CardTitle>
            <CardDescription>
              This link is invalid or has expired. Please contact your Floor Manager for a new access link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <Star className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Evaluations</h1>
                <p className="text-sm text-gray-500">Game Presenter Portal</p>
              </div>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {data.gpName}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Eye className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{data.evaluations.length}</p>
                  <p className="text-sm text-gray-500">Total Evaluations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <Sparkles className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {data.evaluations.length > 0 
                      ? (data.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / data.evaluations.length).toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-sm text-gray-500">Avg Appearance</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="bg-purple-100 p-3 rounded-full">
                  <Gamepad2 className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {data.evaluations.length > 0 
                      ? (data.evaluations.reduce((sum, e) => sum + (e.gamePerformanceTotalScore || 0), 0) / data.evaluations.length).toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-sm text-gray-500">Avg Game Perf.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Stats & Bonus Section */}
        {data.monthlyStats && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Monthly Performance & Bonus Status
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Current Month Stats */}
              {data.monthlyStats.current && (
                <Card className="border-2 border-blue-200">
                  <CardHeader className="bg-blue-50">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-blue-600" />
                      Current Month
                    </CardTitle>
                    <CardDescription>
                      {new Date(data.monthlyStats.current.year, data.monthlyStats.current.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Attitude */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ThumbsUp className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Attitude Score</span>
                      </div>
                      <Badge variant={data.monthlyStats.current.attitude && data.monthlyStats.current.attitude >= 4 ? "default" : data.monthlyStats.current.attitude && data.monthlyStats.current.attitude >= 3 ? "secondary" : "destructive"}
                             className={data.monthlyStats.current.attitude && data.monthlyStats.current.attitude >= 4 ? "bg-green-600" : ""}>
                        {data.monthlyStats.current.attitude ?? "Not set"}/5
                      </Badge>
                    </div>
                    
                    {/* Mistakes */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Mistakes</span>
                      </div>
                      <Badge variant={data.monthlyStats.current.mistakes === 0 ? "default" : data.monthlyStats.current.mistakes === 1 ? "secondary" : "destructive"}
                             className={data.monthlyStats.current.mistakes === 0 ? "bg-green-600" : data.monthlyStats.current.mistakes === 1 ? "bg-yellow-500" : ""}>
                        {data.monthlyStats.current.mistakes ?? 0}
                        {data.monthlyStats.current.mistakes === 1 && " (free)"}
                      </Badge>
                    </div>
                    
                    {/* Total Games */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium">Total Games</span>
                      </div>
                      <span className="font-bold">{data.monthlyStats.current.totalGames?.toLocaleString() ?? 0}</span>
                    </div>
                    
                    {/* Bonus Status */}
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Gift className="h-5 w-5 text-yellow-500" />
                        <span className="font-semibold">Bonus Status</span>
                      </div>
                      
                      <div className={`p-3 rounded-lg ${data.monthlyStats.current.bonus.eligible ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm">
                            {data.monthlyStats.current.bonus.eligible ? (
                              <span className="text-green-700 font-semibold">
                                ✓ Eligible - Level {data.monthlyStats.current.bonus.level}
                              </span>
                            ) : (
                              <span className="text-gray-600">
                                Not yet eligible
                              </span>
                            )}
                          </span>
                          {data.monthlyStats.current.bonus.eligible && (
                            <Badge className="bg-yellow-500">
                              €{data.monthlyStats.current.bonus.rate}/hour
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-600 mb-2">
                          Good Games (GGs): <strong>{data.monthlyStats.current.bonus.ggs?.toLocaleString() ?? 0}</strong>
                        </div>
                        
                        {/* Progress to next level */}
                        {!data.monthlyStats.current.bonus.eligible && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>Progress to Level 1</span>
                              <span>{Math.min(100, Math.round((data.monthlyStats.current.bonus.ggs / 2500) * 100))}%</span>
                            </div>
                            <Progress value={Math.min(100, (data.monthlyStats.current.bonus.ggs / 2500) * 100)} className="h-2" />
                          </div>
                        )}
                        {data.monthlyStats.current.bonus.eligible && data.monthlyStats.current.bonus.level === 1 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>Progress to Level 2</span>
                              <span>{Math.min(100, Math.round((data.monthlyStats.current.bonus.ggs / 5000) * 100))}%</span>
                            </div>
                            <Progress value={Math.min(100, (data.monthlyStats.current.bonus.ggs / 5000) * 100)} className="h-2" />
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-500 mt-2">
                          {data.monthlyStats.current.bonus.reason}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Previous Month Stats */}
              {data.monthlyStats.previous && (
                <Card>
                  <CardHeader className="bg-gray-50">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-gray-600" />
                      Previous Month
                    </CardTitle>
                    <CardDescription>
                      {new Date(data.monthlyStats.previous.year, data.monthlyStats.previous.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Attitude</span>
                      <Badge variant="secondary">{data.monthlyStats.previous.attitude ?? "—"}/5</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Mistakes</span>
                      <Badge variant="secondary">{data.monthlyStats.previous.mistakes ?? 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Games</span>
                      <span className="font-medium">{data.monthlyStats.previous.totalGames?.toLocaleString() ?? 0}</span>
                    </div>
                    <Separator />
                    <div className={`p-2 rounded text-center text-sm ${data.monthlyStats.previous.bonus.eligible ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {data.monthlyStats.previous.bonus.eligible 
                        ? `✓ Level ${data.monthlyStats.previous.bonus.level} Bonus (€${data.monthlyStats.previous.bonus.rate}/hr)`
                        : 'No bonus earned'}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* No stats available message */}
              {!data.monthlyStats.current && !data.monthlyStats.previous && (
                <Card className="col-span-2">
                  <CardContent className="py-8 text-center">
                    <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No monthly stats available yet. Your FM will update your performance data.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Evaluations List */}
        <h2 className="text-xl font-semibold mb-4">Evaluation History</h2>
        
        {data.evaluations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No evaluations yet. Check back after your next evaluation!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.evaluations.map((evaluation) => (
              <Card key={evaluation.id} className="overflow-hidden">
                <CardHeader className="bg-gray-50 border-b">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span className="font-medium">
                          {evaluation.evaluationDate 
                            ? format(new Date(evaluation.evaluationDate), "MMM d, yyyy")
                            : "Date unknown"}
                        </span>
                      </div>
                      {/* Evaluator name hidden for privacy */}
                      {evaluation.game && (
                        <Badge variant="outline">{evaluation.game}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Total Score:</span>
                      <Badge className="text-lg px-3 py-1 bg-blue-600">
                        {evaluation.totalScore ?? "—"}/22
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Appearance Section */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-pink-500" />
                        Appearance ({evaluation.appearanceScore ?? 0}/12)
                      </h4>
                      <div className="space-y-3">
                        <ScoreRow 
                          icon={<Scissors className="h-4 w-4" />}
                          label="Hair"
                          score={evaluation.hairScore}
                          maxScore={evaluation.hairMaxScore || 3}
                          comment={evaluation.hairComment}
                        />
                        <ScoreRow 
                          icon={<Palette className="h-4 w-4" />}
                          label="Makeup"
                          score={evaluation.makeupScore}
                          maxScore={evaluation.makeupMaxScore || 3}
                          comment={evaluation.makeupComment}
                        />
                        <ScoreRow 
                          icon={<Shirt className="h-4 w-4" />}
                          label="Outfit"
                          score={evaluation.outfitScore}
                          maxScore={evaluation.outfitMaxScore || 3}
                          comment={evaluation.outfitComment}
                        />
                        <ScoreRow 
                          icon={<PersonStanding className="h-4 w-4" />}
                          label="Posture"
                          score={evaluation.postureScore}
                          maxScore={evaluation.postureMaxScore || 3}
                          comment={evaluation.postureComment}
                        />
                      </div>
                    </div>

                    {/* Game Performance Section */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4 text-blue-500" />
                        Game Performance ({evaluation.gamePerformanceTotalScore ?? 0}/10)
                      </h4>
                      <div className="space-y-3">
                        <ScoreRow 
                          icon={<Star className="h-4 w-4" />}
                          label="Dealing Style"
                          score={evaluation.dealingStyleScore}
                          maxScore={evaluation.dealingStyleMaxScore || 5}
                          comment={evaluation.dealingStyleComment}
                        />
                        <ScoreRow 
                          icon={<Gamepad2 className="h-4 w-4" />}
                          label="Game Performance"
                          score={evaluation.gamePerformanceScore}
                          maxScore={evaluation.gamePerformanceMaxScore || 5}
                          comment={evaluation.gamePerformanceComment}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-6 mt-8">
        <div className="container text-center text-sm text-gray-500">
          <p>This is a read-only view of your evaluations.</p>
          <p>For questions, please contact your Floor Manager.</p>
        </div>
      </footer>
    </div>
  );
}

function ScoreRow({ 
  icon, 
  label, 
  score, 
  maxScore, 
  comment 
}: { 
  icon: React.ReactNode; 
  label: string; 
  score: number | null; 
  maxScore: number; 
  comment: string | null;
}) {
  const percentage = score !== null ? (score / maxScore) * 100 : 0;
  const getColor = () => {
    if (score === null) return "bg-gray-200";
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-gray-700">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <Badge variant="outline" className={score !== null && percentage >= 80 ? "border-green-500 text-green-700" : ""}>
          {score ?? "—"}/{maxScore}
        </Badge>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full transition-all ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {comment && (
        <p className="text-sm text-gray-600 italic">"{comment}"</p>
      )}
    </div>
  );
}

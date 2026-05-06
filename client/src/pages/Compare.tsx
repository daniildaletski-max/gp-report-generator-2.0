import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, GitCompareArrows, TrendingUp, TrendingDown, Minus, AlertTriangle, Award, X } from "lucide-react";
import { useState, useMemo } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const GP_COLORS = [
  "oklch(0.70 0.15 85)",   // gold
  "oklch(0.60 0.15 250)",  // blue
  "oklch(0.65 0.15 150)",  // green
  "oklch(0.60 0.15 320)",  // purple
];

const GP_COLOR_NAMES = ["gold", "blue", "green", "purple"];

export default function Compare() {
  const { user } = useAuth();
  const [selectedGpIds, setSelectedGpIds] = useState<number[]>([]);
  const [addingGp, setAddingGp] = useState(false);

  const { data: gps } = trpc.gamePresenter.list.useQuery();
  const { data: teams } = trpc.fmTeam.list.useQuery();

  // Fetch profiles for selected GPs
  const profileQueries = selectedGpIds.map(gpId =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    trpc.gamePresenter.profile.useQuery({ gpId, monthsBack: 6 }, { enabled: !!gpId })
  );

  const profiles = profileQueries.map(q => q.data).filter(Boolean);
  const isLoading = profileQueries.some(q => q.isLoading);

  const availableGps = useMemo(() => {
    if (!gps) return [];
    return gps.filter(gp => !selectedGpIds.includes(gp.id));
  }, [gps, selectedGpIds]);

  const addGp = (gpId: number) => {
    if (selectedGpIds.length < 4 && !selectedGpIds.includes(gpId)) {
      setSelectedGpIds([...selectedGpIds, gpId]);
    }
    setAddingGp(false);
  };

  const removeGp = (gpId: number) => {
    setSelectedGpIds(selectedGpIds.filter(id => id !== gpId));
  };

  // Build radar chart data from latest month evaluations
  const radarData = useMemo(() => {
    if (profiles.length === 0) return [];
    const categories = [
      { key: "hair", label: "Hair" },
      { key: "makeup", label: "Makeup" },
      { key: "outfit", label: "Outfit" },
      { key: "posture", label: "Posture" },
      { key: "dealing", label: "Dealing" },
      { key: "gamePerf", label: "Game Perf" },
    ];

    return categories.map(cat => {
      const point: Record<string, unknown> = { category: cat.label };
      profiles.forEach((profile, idx) => {
        if (!profile) return;
        // Get latest evaluation scores
        const latestEval = profile.recentEvaluations[0];
        if (latestEval) {
          const scoreMap: Record<string, number> = {
            hair: Number((latestEval as any).hairScore) || 0,
            makeup: Number((latestEval as any).makeupScore) || 0,
            outfit: Number((latestEval as any).outfitScore) || 0,
            posture: Number((latestEval as any).postureScore) || 0,
            dealing: Number((latestEval as any).dealingStyleScore) || 0,
            gamePerf: Number((latestEval as any).gamePerformanceScore) || 0,
          };
          point[profile.gp.name] = scoreMap[cat.key] || 0;
        } else {
          point[profile.gp.name] = 0;
        }
      });
      return point;
    });
  }, [profiles]);

  // Build trend line data
  const trendData = useMemo(() => {
    if (profiles.length === 0) return [];
    // Use the first profile's trend as the month labels
    const firstProfile = profiles[0];
    if (!firstProfile?.trend) return [];

    return firstProfile.trend.map((month: any, idx: number) => {
      const point: Record<string, unknown> = {
        month: month.label || `M${idx + 1}`,
      };
      profiles.forEach((profile) => {
        if (!profile?.trend?.[idx]) return;
        point[profile.gp.name] = Number(profile.trend[idx].avgTotalScore) || 0;
      });
      return point;
    });
  }, [profiles]);

  // Build comparison table data
  const comparisonStats = useMemo(() => {
    return profiles.map((profile) => {
      if (!profile) return null;
      const trendScores = (profile.trend || [])
        .map((m: any) => Number(m.avgTotalScore) || 0)
        .filter((s: number) => s > 0);
      const avg = trendScores.length > 0
        ? trendScores.reduce((a: number, b: number) => a + b, 0) / trendScores.length
        : 0;
      const latest = trendScores[trendScores.length - 1] || 0;
      const previous = trendScores[trendScores.length - 2] || 0;
      const delta = previous > 0 ? latest - previous : 0;

      return {
        name: profile.gp.name,
        team: profile.gp.teamName || "Unassigned",
        latestScore: latest,
        avgScore: avg,
        delta,
        evalCount: profile.recentEvaluations.length,
        mistakes: profile.currentMonth.mistakes,
        attitude: profile.currentMonth.attitude,
        attendance: profile.currentMonth.attendance,
      };
    }).filter(Boolean);
  }, [profiles]);

  const getTeamName = (teamId: number | null) => {
    if (!teamId || !teams) return "Unassigned";
    return teams.find(t => t.id === teamId)?.teamName || "Unassigned";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Compare GPs"
        subtitle="Side-by-side performance analysis"
        icon={GitCompareArrows}
      />

      {/* GP Selection */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Select GPs to compare (up to 4)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {selectedGpIds.map((gpId, idx) => {
              const gp = gps?.find(g => g.id === gpId);
              return (
                <Badge
                  key={gpId}
                  variant="outline"
                  className="pl-3 pr-1.5 py-1.5 text-sm gap-2 border-2"
                  style={{ borderColor: GP_COLORS[idx] }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: GP_COLORS[idx] }}
                  />
                  {gp?.name || `GP #${gpId}`}
                  <button
                    onClick={() => removeGp(gpId)}
                    className="ml-1 p-0.5 rounded-full hover:bg-muted transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}

            {selectedGpIds.length < 4 && (
              addingGp ? (
                <Select onValueChange={(val) => addGp(Number(val))}>
                  <SelectTrigger className="w-48 h-8 text-sm">
                    <SelectValue placeholder="Choose a GP..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGps.map(gp => (
                      <SelectItem key={gp.id} value={String(gp.id)}>
                        {gp.name} · {getTeamName(gp.teamId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingGp(true)}
                  className="h-8 text-xs"
                >
                  + Add GP
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {selectedGpIds.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <GitCompareArrows className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-lg font-semibold">Compare GP Performance</h3>
              <p className="text-sm text-muted-foreground">
                Select 2 or more Game Presenters above to see their scores, trends, and metrics side by side.
                Great for identifying coaching opportunities and celebrating top performers.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison content */}
      {selectedGpIds.length >= 2 && (
        <div className="space-y-5 stagger-children">
          {/* Radar Chart */}
          {radarData.length > 0 && (
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Score Breakdown (Latest Evaluation)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="oklch(0.80 0.02 85 / 0.4)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: "oklch(0.45 0.02 85)" }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 5]}
                      tick={{ fontSize: 9 }}
                    />
                    {profiles.map((profile, idx) => (
                      <Radar
                        key={profile!.gp.id}
                        name={profile!.gp.name}
                        dataKey={profile!.gp.name}
                        stroke={GP_COLORS[idx]}
                        fill={GP_COLORS[idx]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Trend Lines */}
          {trendData.length > 0 && (
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Score Trend (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 85)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "oklch(0.45 0.02 85)" }}
                    />
                    <YAxis
                      domain={[0, 22]}
                      tick={{ fontSize: 10, fill: "oklch(0.55 0.02 85)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid oklch(0.90 0.02 85)",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    {profiles.map((profile, idx) => (
                      <Line
                        key={profile!.gp.id}
                        type="monotone"
                        dataKey={profile!.gp.name}
                        stroke={GP_COLORS[idx]}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: GP_COLORS[idx] }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Stats Comparison Table */}
          {comparisonStats.length > 0 && (
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Performance Summary</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Metric</th>
                      {comparisonStats.map((stat, idx) => (
                        <th key={idx} className="text-center py-2.5 px-3 font-medium" style={{ color: GP_COLORS[idx] }}>
                          {stat!.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Latest Score</td>
                      {comparisonStats.map((stat, idx) => {
                        const best = Math.max(...comparisonStats.map(s => s!.latestScore));
                        return (
                          <td key={idx} className="text-center py-2.5 px-3 font-semibold tabular-nums">
                            <span className={stat!.latestScore === best && best > 0 ? "text-emerald-600" : ""}>
                              {stat!.latestScore > 0 ? stat!.latestScore.toFixed(1) : "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">6-Month Avg</td>
                      {comparisonStats.map((stat, idx) => {
                        const best = Math.max(...comparisonStats.map(s => s!.avgScore));
                        return (
                          <td key={idx} className="text-center py-2.5 px-3 font-semibold tabular-nums">
                            <span className={stat!.avgScore === best && best > 0 ? "text-emerald-600" : ""}>
                              {stat!.avgScore > 0 ? stat!.avgScore.toFixed(1) : "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Monthly Trend</td>
                      {comparisonStats.map((stat, idx) => (
                        <td key={idx} className="text-center py-2.5 px-3">
                          {stat!.delta > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <TrendingUp className="h-3.5 w-3.5" />+{stat!.delta.toFixed(1)}
                            </span>
                          ) : stat!.delta < 0 ? (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                              <TrendingDown className="h-3.5 w-3.5" />{stat!.delta.toFixed(1)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Minus className="h-3.5 w-3.5" />0
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Evaluations</td>
                      {comparisonStats.map((stat, idx) => (
                        <td key={idx} className="text-center py-2.5 px-3 tabular-nums">{stat!.evalCount}</td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Mistakes (this month)</td>
                      {comparisonStats.map((stat, idx) => {
                        const worst = Math.max(...comparisonStats.map(s => s!.mistakes));
                        return (
                          <td key={idx} className="text-center py-2.5 px-3 tabular-nums">
                            <span className={stat!.mistakes === worst && worst > 0 ? "text-rose-600 font-medium" : ""}>
                              {stat!.mistakes}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Sick Leaves</td>
                      {comparisonStats.map((stat, idx) => (
                        <td key={idx} className="text-center py-2.5 px-3 tabular-nums">
                          {stat!.attendance.sickLeaves}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Late to Work</td>
                      {comparisonStats.map((stat, idx) => (
                        <td key={idx} className="text-center py-2.5 px-3 tabular-nums">
                          {stat!.attendance.lateToWork}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">Missed Days</td>
                      {comparisonStats.map((stat, idx) => (
                        <td key={idx} className="text-center py-2.5 px-3 tabular-nums">
                          {stat!.attendance.missedDays}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Winner highlight */}
          {comparisonStats.length >= 2 && comparisonStats.some(s => s!.latestScore > 0) && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Top performer:{" "}
                    {comparisonStats.reduce((best, curr) =>
                      (curr!.latestScore > best!.latestScore) ? curr : best
                    )!.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Based on latest evaluation score ({comparisonStats.reduce((best, curr) =>
                      (curr!.latestScore > best!.latestScore) ? curr : best
                    )!.latestScore.toFixed(1)}/22)
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Single GP selected — prompt for more */}
      {selectedGpIds.length === 1 && (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              Select at least one more GP to start comparing performance side by side.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

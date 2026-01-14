import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Users, AlertTriangle, Trash2, Link, Copy, Check, RefreshCw, ExternalLink, Star, AlertCircle, UserCog, Download } from "lucide-react";
import { format } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function AdminPage() {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [errorType, setErrorType] = useState<"playgon" | "mg">("playgon");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatingForGp, setGeneratingForGp] = useState<number | null>(null);

  
  const { data: teams, isLoading: teamsLoading } = trpc.fmTeam.list.useQuery();
  const { data: errorFiles, isLoading: filesLoading, refetch: refetchFiles } = trpc.errorFile.list.useQuery();
  const { data: gamePresenters, isLoading: gpsLoading, refetch: refetchGPs } = trpc.gamePresenter.list.useQuery();
  const { data: accessTokens, isLoading: tokensLoading, refetch: refetchTokens } = trpc.gpAccess.list.useQuery();
  const [deletingGpId, setDeletingGpId] = useState<number | null>(null);
  
  const uploadErrorsMutation = trpc.errorFile.upload.useMutation();
  const deleteErrorsMutation = trpc.errorFile.delete.useMutation();
  const generateTokenMutation = trpc.gpAccess.generateToken.useMutation();
  const deactivateTokenMutation = trpc.gpAccess.deactivate.useMutation();
  const deleteGpMutation = trpc.gamePresenter.delete.useMutation();


  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        
        await uploadErrorsMutation.mutateAsync({
          fileBase64: base64,
          filename: file.name,
          month: selectedMonth,
          year: selectedYear,
          errorType: errorType,
        });
        
        toast.success(`${errorType === 'playgon' ? 'Playgon' : 'MG'} errors file uploaded successfully`);
        refetchFiles();
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.message || "Failed to upload errors file");
    } finally {
      setIsUploading(false);
    }
  }, [selectedMonth, selectedYear, errorType, uploadErrorsMutation, refetchFiles]);

  const handleDeleteFile = useCallback(async (id: number) => {
    setDeletingId(id);
    try {
      await deleteErrorsMutation.mutateAsync({ id });
      toast.success("File deleted successfully");
      refetchFiles();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }, [deleteErrorsMutation, refetchFiles]);

  const handleGenerateToken = useCallback(async (gpId: number) => {
    setGeneratingForGp(gpId);
    try {
      const result = await generateTokenMutation.mutateAsync({ gpId });
      toast.success(`Access link generated for ${result.gpName}`);
      refetchTokens();
    } catch (error: any) {
      toast.error(error.message || "Failed to generate access link");
    } finally {
      setGeneratingForGp(null);
    }
  }, [generateTokenMutation, refetchTokens]);

  const handleDeactivateToken = useCallback(async (id: number) => {
    try {
      await deactivateTokenMutation.mutateAsync({ id });
      toast.success("Access link deactivated");
      refetchTokens();
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate link");
    }
  }, [deactivateTokenMutation, refetchTokens]);

  const copyToClipboard = useCallback((token: string) => {
    const url = `${window.location.origin}/gp/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopiedToken(null), 2000);
  }, []);

  const getTokenForGp = (gpId: number) => {
    return accessTokens?.find(t => t.token.gamePresenterId === gpId && t.token.isActive === 1);
  };

  const handleDeleteGp = useCallback(async (gpId: number, gpName: string) => {
    setDeletingGpId(gpId);
    try {
      await deleteGpMutation.mutateAsync({ gpId });
      toast.success(`${gpName} has been removed`);
      refetchGPs();
      refetchTokens();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete Game Presenter");
    } finally {
      setDeletingGpId(null);
    }
  }, [deleteGpMutation, refetchGPs, refetchTokens]);

  if (teamsLoading || filesLoading || gpsLoading || tokensLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground">Manage teams, error files, and GP access</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground">Manage teams, error files, and GP access</p>
      </div>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1">
          <TabsTrigger value="stats" className="flex items-center justify-center gap-2 py-2">
            <Star className="h-4 w-4 shrink-0" />
            <span>GP Stats</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center justify-center gap-2 py-2">
            <Link className="h-4 w-4 shrink-0" />
            <span>GP Access Links</span>
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center justify-center gap-2 py-2">
            <Users className="h-4 w-4 shrink-0" />
            <span>Teams</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center justify-center gap-2 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Error Files</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center justify-center gap-2 py-2">
            <UserCog className="h-4 w-4 shrink-0" />
            <span>User Management</span>
          </TabsTrigger>
        </TabsList>

        {/* GP Stats Tab */}
        <GPStatsTab 
          teams={teams || []} 
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
        />

        {/* GP Access Links Tab */}
        <TabsContent value="access" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                GP Access Links
              </CardTitle>
              <CardDescription>
                Generate unique links for Game Presenters to view their evaluations. Each GP can only see their own data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {gamePresenters && gamePresenters.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game Presenter</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Access Link Status</TableHead>
                      <TableHead>Last Accessed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gamePresenters.map((gp) => {
                      const tokenData = getTokenForGp(gp.id);
                      const hasActiveLink = !!tokenData;
                      
                      return (
                        <TableRow key={gp.id}>
                          <TableCell className="font-medium">{gp.name}</TableCell>
                          <TableCell>
                            {teams?.find(t => t.id === gp.teamId)?.teamName || 
                              <span className="text-muted-foreground">Unassigned</span>
                            }
                          </TableCell>
                          <TableCell>
                            {hasActiveLink ? (
                              <Badge variant="default" className="bg-green-600">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                No Link
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {tokenData?.token.lastAccessedAt ? (
                              format(new Date(tokenData.token.lastAccessedAt), "dd MMM yyyy HH:mm")
                            ) : (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {hasActiveLink && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyToClipboard(tokenData.token.token)}
                                    className="flex items-center gap-1"
                                  >
                                    {copiedToken === tokenData.token.token ? (
                                      <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <Copy className="h-4 w-4" />
                                    )}
                                    Copy
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`/gp/${tokenData.token.token}`, '_blank')}
                                    className="flex items-center gap-1"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Deactivate Access Link</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will deactivate the access link for {gp.name}. They will no longer be able to view their evaluations until you generate a new link.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeactivateToken(tokenData.token.id)}
                                          className="bg-destructive text-destructive-foreground"
                                        >
                                          Deactivate
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                              <Button
                                variant={hasActiveLink ? "ghost" : "default"}
                                size="sm"
                                onClick={() => handleGenerateToken(gp.id)}
                                disabled={generatingForGp === gp.id}
                                className="flex items-center gap-1"
                              >
                                {generatingForGp === gp.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : hasActiveLink ? (
                                  <RefreshCw className="h-4 w-4" />
                                ) : (
                                  <Link className="h-4 w-4" />
                                )}
                                {hasActiveLink ? "Regenerate" : "Generate Link"}
                              </Button>
                              
                              {/* Delete GP Button */}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={deletingGpId === gp.id}
                                  >
                                    {deletingGpId === gp.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Game Presenter</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete <strong>{gp.name}</strong>? This will also delete all their evaluations and access links. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteGp(gp.id, gp.name)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
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
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No Game Presenters found. Upload evaluations to create GP profiles.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teams Tab */}
        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Floor Manager Teams
              </CardTitle>
              <CardDescription>
                Pre-configured teams with their Floor Managers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Floor Manager</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams?.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell className="font-medium">{team.teamName}</TableCell>
                      <TableCell>{team.floorManagerName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Error Files Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Upload Error Files
              </CardTitle>
              <CardDescription>
                Upload Playgon or MG error files for GP mistake tracking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={String(selectedMonth)}
                    onValueChange={(v) => setSelectedMonth(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, idx) => (
                        <SelectItem key={month} value={String(idx + 1)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={String(selectedYear)}
                    onValueChange={(v) => setSelectedYear(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Error Type</Label>
                  <Select
                    value={errorType}
                    onValueChange={(v) => setErrorType(v as "playgon" | "mg")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="playgon">Playgon Errors</SelectItem>
                      <SelectItem value="mg">MG Errors</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Upload File</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="flex-1"
                  />
                  {isUploading && <Loader2 className="h-6 w-6 animate-spin" />}
                </div>
              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Uploaded Error Files
              </CardTitle>
              <CardDescription>
                History of uploaded error files
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errorFiles && errorFiles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errorFiles.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium">{file.fileName}</TableCell>
                        <TableCell>
                          <Badge variant={file.fileType === 'playgon' ? 'default' : 'secondary'}>
                            {file.fileType === 'playgon' ? 'Playgon' : 'MG'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {MONTHS[file.month - 1]} {file.year}
                        </TableCell>
                        <TableCell>
                          {format(new Date(file.createdAt), "dd MMM yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deletingId === file.id}
                              >
                                {deletingId === file.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Error File</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{file.fileName}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteFile(file.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No error files uploaded yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Management Tab */}
        <UserManagementTab teams={teams || []} />
      </Tabs>
    </div>
  );
}

// User Management Tab Component
function UserManagementTab({ teams }: { teams: any[] }) {
  const { data: users, isLoading, refetch } = trpc.user.list.useQuery();
  const assignToTeam = trpc.user.assignToTeam.useMutation({
    onSuccess: () => {
      toast.success("Team assignment updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update team");
    },
  });

  const handleTeamChange = (userId: number, teamId: string) => {
    assignToTeam.mutate({
      userId,
      teamId: teamId === "none" ? null : Number(teamId),
    });
  };

  return (
    <TabsContent value="users" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>
            Assign Floor Managers to their teams. Each FM will only see Game Presenters from their assigned team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned Team</TableHead>
                  <TableHead>Last Sign In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((item: any) => (
                  <TableRow key={item.user.id}>
                    <TableCell className="font-medium">{item.user.name || "Unknown"}</TableCell>
                    <TableCell>{item.user.email || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.user.role === "admin" ? "default" : "secondary"}>
                        {item.user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.user.teamId ? String(item.user.teamId) : "none"}
                        onValueChange={(v) => handleTeamChange(item.user.id, v)}
                        disabled={assignToTeam.isPending}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Team (All Access)</SelectItem>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={String(team.id)}>
                              {team.teamName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.user.lastSignedIn ? format(new Date(item.user.lastSignedIn), "MMM d, yyyy HH:mm") : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No users found
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// GP Stats Tab Component
function GPStatsTab({ 
  teams, 
  selectedMonth, 
  selectedYear, 
  setSelectedMonth, 
  setSelectedYear 
}: { 
  teams: { id: number; teamName: string; floorManagerName: string }[];
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [editingGpId, setEditingGpId] = useState<number | null>(null);
  const [editAttitude, setEditAttitude] = useState<number | null>(null);
  const [editMistakes, setEditMistakes] = useState<number>(0);
  const [editTotalGames, setEditTotalGames] = useState<number>(0);

  const { data: gpsWithStats, isLoading, refetch } = trpc.gamePresenter.listWithStats.useQuery({
    teamId: selectedTeamId || undefined,
    month: selectedMonth,
    year: selectedYear,
  });

  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation();

  const handleSaveStats = useCallback(async (gpId: number) => {
    try {
      await updateStatsMutation.mutateAsync({
        gpId,
        month: selectedMonth,
        year: selectedYear,
        attitude: editAttitude,
        mistakes: editMistakes,
        totalGames: editTotalGames,
      });
      toast.success("Stats updated successfully");
      setEditingGpId(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to update stats");
    }
  }, [updateStatsMutation, selectedMonth, selectedYear, editAttitude, editMistakes, refetch]);

  const startEditing = (gp: any) => {
    setEditingGpId(gp.id);
    setEditAttitude(gp.stats?.attitude ?? null);
    setEditMistakes(gp.stats?.mistakes ?? 0);
    setEditTotalGames(gp.stats?.totalGames ?? 0);
  };

  return (
    <TabsContent value="stats" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            GP Monthly Stats
          </CardTitle>
          <CardDescription>
            Set attitude scores and mistake counts for each Game Presenter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Team</Label>
              <Select
                value={selectedTeamId ? String(selectedTeamId) : "all"}
                onValueChange={(v) => setSelectedTeamId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={String(team.id)}>
                      {team.teamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Month</Label>
              <Select
                value={String(selectedMonth)}
                onValueChange={(v) => setSelectedMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={month} value={String(idx + 1)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Export Button */}
          {gpsWithStats && gpsWithStats.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Create CSV content
                  const headers = ['GP Name', 'Team', 'Attitude', 'Mistakes', 'Total Games', 'GGs', 'Bonus Level'];
                  const rows = gpsWithStats.map((gp: any) => {
                    const team = teams.find(t => t.id === gp.teamId);
                    const totalGames = gp.stats?.totalGames ?? 0;
                    const mistakes = gp.stats?.mistakes ?? 0;
                    const effectiveMistakes = mistakes <= 1 ? 1 : mistakes;
                    const ggs = totalGames > 0 ? Math.floor(totalGames / effectiveMistakes) : 0;
                    const bonusLevel = ggs >= 5000 ? 'Level 2' : ggs >= 2500 ? 'Level 1' : 'None';
                    return [
                      gp.name,
                      team?.teamName || 'Unassigned',
                      gp.stats?.attitude ?? '',
                      gp.stats?.mistakes ?? 0,
                      totalGames,
                      ggs,
                      bonusLevel
                    ].join(',');
                  });
                  const csv = [headers.join(','), ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `GP_Stats_${MONTHS[selectedMonth - 1]}_${selectedYear}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success('GP Stats exported to CSV');
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Export to CSV
              </Button>
            </div>
          )}

          {/* GP Stats Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : gpsWithStats && gpsWithStats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game Presenter</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center">Attitude (1-5)</TableHead>
                  <TableHead className="text-center">Mistakes</TableHead>
                  <TableHead className="text-center">Total Games</TableHead>
                  <TableHead className="text-center">GGs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gpsWithStats.map((gp: any) => {
                  const isEditing = editingGpId === gp.id;
                  const team = teams.find(t => t.id === gp.teamId);
                  
                  return (
                    <TableRow key={gp.id}>
                      <TableCell className="font-medium">{gp.name}</TableCell>
                      <TableCell>
                        {team?.teamName || <span className="text-muted-foreground">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Button
                                key={n}
                                size="sm"
                                variant={editAttitude === n ? "default" : "outline"}
                                className={`w-8 h-8 p-0 ${editAttitude === n ? '' : n <= 2 ? 'hover:bg-red-100 hover:text-red-700' : n === 3 ? 'hover:bg-yellow-100 hover:text-yellow-700' : 'hover:bg-green-100 hover:text-green-700'}`}
                                onClick={() => setEditAttitude(editAttitude === n ? null : n)}
                              >
                                {n}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <QuickAttitudeButtons 
                            gpId={gp.id} 
                            currentAttitude={gp.stats?.attitude}
                            currentMistakes={gp.stats?.mistakes ?? 0}
                            selectedMonth={selectedMonth}
                            selectedYear={selectedYear}
                            onUpdate={refetch}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            value={editMistakes}
                            onChange={(e) => setEditMistakes(Number(e.target.value) || 0)}
                            className="w-20 mx-auto text-center"
                          />
                        ) : (
                          <span className={gp.stats?.mistakes ? "text-destructive font-medium" : "text-muted-foreground"}>
                            {gp.stats?.mistakes ?? 0}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            value={editTotalGames}
                            onChange={(e) => setEditTotalGames(Number(e.target.value) || 0)}
                            className="w-24 mx-auto text-center"
                            placeholder="0"
                          />
                        ) : (
                          <span className="font-medium">
                            {(gp.stats?.totalGames ?? 0).toLocaleString()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const totalGames = gp.stats?.totalGames ?? 0;
                          const mistakes = gp.stats?.mistakes ?? 0;
                          const effectiveMistakes = mistakes <= 1 ? 1 : mistakes;
                          const ggs = totalGames > 0 ? Math.floor(totalGames / effectiveMistakes) : 0;
                          const isLevel2 = ggs >= 5000;
                          const isLevel1 = ggs >= 2500;
                          return (
                            <Badge 
                              variant={isLevel2 ? "default" : isLevel1 ? "secondary" : "outline"}
                              className={isLevel2 ? "bg-green-600" : isLevel1 ? "bg-yellow-500 text-black" : ""}
                            >
                              {ggs.toLocaleString()}
                              {isLevel2 && " L2"}
                              {isLevel1 && !isLevel2 && " L1"}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveStats(gp.id)}
                              disabled={updateStatsMutation.isPending}
                            >
                              {updateStatsMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingGpId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditing(gp)}
                          >
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {selectedTeamId ? "No Game Presenters in this team" : "No Game Presenters found"}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// Attitude Badge Component with color coding
function AttitudeBadge({ attitude }: { attitude: number | null | undefined }) {
  if (!attitude) {
    return <span className="text-muted-foreground">-</span>;
  }

  const getColor = (score: number) => {
    if (score <= 2) return "bg-red-100 text-red-700 border-red-200";
    if (score === 3) return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-green-100 text-green-700 border-green-200";
  };

  const getStars = (score: number) => {
    return "★".repeat(score) + "☆".repeat(5 - score);
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <Badge variant="outline" className={`${getColor(attitude)} font-medium`}>
        {attitude}
      </Badge>
      <span className="text-xs text-muted-foreground">{getStars(attitude)}</span>
    </div>
  );
}

// Quick Attitude Buttons Component for one-click attitude setting
function QuickAttitudeButtons({ 
  gpId, 
  currentAttitude, 
  currentMistakes,
  selectedMonth, 
  selectedYear, 
  onUpdate 
}: { 
  gpId: number; 
  currentAttitude: number | null | undefined;
  currentMistakes: number;
  selectedMonth: number; 
  selectedYear: number; 
  onUpdate: () => void;
}) {
  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation();
  const [isUpdating, setIsUpdating] = useState<number | null>(null);

  const handleQuickSet = async (attitude: number) => {
    setIsUpdating(attitude);
    try {
      await updateStatsMutation.mutateAsync({
        gpId,
        month: selectedMonth,
        year: selectedYear,
        attitude,
        mistakes: currentMistakes,
      });
      toast.success(`Attitude set to ${attitude}`);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    } finally {
      setIsUpdating(null);
    }
  };

  const getButtonStyle = (n: number) => {
    const isSelected = currentAttitude === n;
    if (isSelected) {
      if (n <= 2) return "bg-red-500 text-white hover:bg-red-600";
      if (n === 3) return "bg-yellow-500 text-white hover:bg-yellow-600";
      return "bg-green-500 text-white hover:bg-green-600";
    }
    return "bg-muted/50 hover:bg-muted";
  };

  return (
    <div className="flex items-center justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          key={n}
          size="sm"
          variant="ghost"
          className={`w-7 h-7 p-0 text-xs font-medium ${getButtonStyle(n)}`}
          onClick={() => handleQuickSet(n)}
          disabled={isUpdating !== null}
        >
          {isUpdating === n ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            n
          )}
        </Button>
      ))}
    </div>
  );
}

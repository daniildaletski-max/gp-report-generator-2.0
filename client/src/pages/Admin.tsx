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
import { FileSpreadsheet, Loader2, Users, AlertTriangle, Trash2, Link, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
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
  const { data: gamePresenters, isLoading: gpsLoading } = trpc.gamePresenter.list.useQuery();
  const { data: accessTokens, isLoading: tokensLoading, refetch: refetchTokens } = trpc.gpAccess.list.useQuery();
  
  const uploadErrorsMutation = trpc.errorFile.upload.useMutation();
  const deleteErrorsMutation = trpc.errorFile.delete.useMutation();
  const generateTokenMutation = trpc.gpAccess.generateToken.useMutation();
  const deactivateTokenMutation = trpc.gpAccess.deactivate.useMutation();

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

      <Tabs defaultValue="access" className="space-y-4">
        <TabsList>
          <TabsTrigger value="access" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            GP Access Links
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Teams
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Error Files
          </TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  );
}

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  FileSpreadsheet, Loader2, Users, AlertTriangle, Trash2, Link, Copy, Check, 
  RefreshCw, ExternalLink, Star, AlertCircle, UserCog, Download, Shield, 
  Building2, Plus, Edit, BarChart3, Activity 
} from "lucide-react";
import { format } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // If not admin, show restricted view
  if (!isAdmin) {
    return <FMRestrictedView />;
  }

  return <FullAdminPanel />;
}

// Restricted view for Floor Managers
function FMRestrictedView() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: teams } = trpc.fmTeam.list.useQuery();
  const { data: gamePresenters, isLoading: gpsLoading, refetch: refetchGPs } = trpc.gamePresenter.list.useQuery();
  const { data: accessTokens, isLoading: tokensLoading, refetch: refetchTokens } = trpc.gpAccess.list.useQuery();

  const team = teams?.[0]; // FM only sees their team

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
        <p className="text-muted-foreground">
          Manage your team: {team?.teamName || "Loading..."}
        </p>
      </div>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 h-auto p-1">
          <TabsTrigger value="stats" className="flex items-center justify-center gap-2 py-2">
            <Star className="h-4 w-4 shrink-0" />
            <span>GP Stats</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center justify-center gap-2 py-2">
            <Link className="h-4 w-4 shrink-0" />
            <span>GP Access Links</span>
          </TabsTrigger>
        </TabsList>

        {/* GP Stats Tab */}
        {team && (
          <GPStatsTab 
            teams={[team]} 
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            setSelectedMonth={setSelectedMonth}
            setSelectedYear={setSelectedYear}
            isFMView={true}
          />
        )}

        {/* GP Access Links Tab */}
        <GPAccessLinksTab 
          gamePresenters={gamePresenters || []}
          accessTokens={accessTokens || []}
          teams={teams || []}
          refetchTokens={refetchTokens}
          isLoading={gpsLoading || tokensLoading}
        />
      </Tabs>
    </div>
  );
}

// Full Admin Panel
function FullAdminPanel() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: teams, isLoading: teamsLoading, refetch: refetchTeams } = trpc.fmTeam.list.useQuery();
  const { data: errorFiles, isLoading: filesLoading, refetch: refetchFiles } = trpc.errorFile.list.useQuery();
  const { data: gamePresenters, isLoading: gpsLoading, refetch: refetchGPs } = trpc.gamePresenter.list.useQuery();
  const { data: accessTokens, isLoading: tokensLoading, refetch: refetchTokens } = trpc.gpAccess.list.useQuery();

  if (teamsLoading || filesLoading || gpsLoading || tokensLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground">System administration and management</p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">System administration and management</p>
        </div>
        <Badge variant="default" className="bg-primary">
          Administrator
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 h-auto p-1">
          <TabsTrigger value="overview" className="flex items-center justify-center gap-2 py-2">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center justify-center gap-2 py-2">
            <UserCog className="h-4 w-4 shrink-0" />
            <span>Users</span>
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center justify-center gap-2 py-2">
            <Building2 className="h-4 w-4 shrink-0" />
            <span>Teams</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center justify-center gap-2 py-2">
            <Star className="h-4 w-4 shrink-0" />
            <span>GP Stats</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center justify-center gap-2 py-2">
            <Link className="h-4 w-4 shrink-0" />
            <span>GP Access</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center justify-center gap-2 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Errors</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <AdminOverviewTab />

        {/* User Management Tab */}
        <UserManagementTab teams={teams || []} />

        {/* Teams Management Tab */}
        <TeamsManagementTab refetchTeams={refetchTeams} />

        {/* GP Stats Tab */}
        <GPStatsTab 
          teams={teams || []} 
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
          isFMView={false}
        />

        {/* GP Access Links Tab */}
        <GPAccessLinksTab 
          gamePresenters={gamePresenters || []}
          accessTokens={accessTokens || []}
          teams={teams || []}
          refetchTokens={refetchTokens}
          isLoading={false}
        />

        {/* Error Files Tab */}
        <ErrorFilesTab 
          errorFiles={errorFiles || []}
          refetchFiles={refetchFiles}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
        />
      </Tabs>
    </div>
  );
}

// Admin Overview Tab with system stats
function AdminOverviewTab() {
  const { data: adminStats, isLoading } = trpc.dashboard.adminStats.useQuery();

  if (isLoading) {
    return (
      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="overview" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.totalUsers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.totalTeams || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Game Presenters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.totalGPs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Evaluations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.totalEvaluations || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.totalReports || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {adminStats?.recentReports && adminStats.recentReports.length > 0 ? (
              <div className="space-y-2">
                {adminStats.recentReports.map((item: any) => (
                  <div key={item.report.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">{item.team?.teamName || "Unknown Team"}</div>
                      <div className="text-sm text-muted-foreground">
                        {MONTHS[item.report.reportMonth - 1]} {item.report.reportYear}
                      </div>
                    </div>
                    <Badge variant={item.report.status === "finalized" ? "default" : "secondary"}>
                      {item.report.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No recent reports</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {adminStats?.recentUsers && adminStats.recentUsers.length > 0 ? (
              <div className="space-y-2">
                {adminStats.recentUsers.map((user: any) => (
                  <div key={user.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">{user.name || "Unknown"}</div>
                      <div className="text-sm text-muted-foreground">{user.email || "-"}</div>
                    </div>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No users yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
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
  const updateRole = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });
  const deleteUser = trpc.user.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete user");
    },
  });

  const handleTeamChange = (userId: number, teamId: string) => {
    assignToTeam.mutate({
      userId,
      teamId: teamId === "none" ? null : Number(teamId),
    });
  };

  const handleRoleChange = (userId: number, role: "user" | "admin") => {
    updateRole.mutate({ userId, role });
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
            Manage user roles and team assignments. Floor Managers with assigned teams can only see their team's data.
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
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((item: any) => (
                  <TableRow key={item.user.id}>
                    <TableCell className="font-medium">{item.user.name || "Unknown"}</TableCell>
                    <TableCell>{item.user.email || "-"}</TableCell>
                    <TableCell>
                      <Select
                        value={item.user.role}
                        onValueChange={(v) => handleRoleChange(item.user.id, v as "user" | "admin")}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {item.user.name || "this user"}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUser.mutate({ userId: item.user.id })}
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
              No users found
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// Teams Management Tab Component
function TeamsManagementTab({ refetchTeams }: { refetchTeams: () => void }) {
  const { data: teamsWithStats, isLoading, refetch } = trpc.fmTeam.listWithStats.useQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newFMName, setNewFMName] = useState("");
  const [editingTeam, setEditingTeam] = useState<any>(null);

  const createTeam = trpc.fmTeam.create.useMutation({
    onSuccess: () => {
      toast.success("Team created");
      setIsCreateOpen(false);
      setNewTeamName("");
      setNewFMName("");
      refetch();
      refetchTeams();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create team");
    },
  });

  const updateTeam = trpc.fmTeam.update.useMutation({
    onSuccess: () => {
      toast.success("Team updated");
      setEditingTeam(null);
      refetch();
      refetchTeams();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update team");
    },
  });

  const deleteTeam = trpc.fmTeam.delete.useMutation({
    onSuccess: () => {
      toast.success("Team deleted");
      refetch();
      refetchTeams();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete team");
    },
  });

  return (
    <TabsContent value="teams" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Teams Management
              </CardTitle>
              <CardDescription>
                Create and manage FM teams. Each team has its own Game Presenters and reports.
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Team</DialogTitle>
                  <DialogDescription>
                    Add a new FM team to the system.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="teamName">Team Name</Label>
                    <Input
                      id="teamName"
                      placeholder="e.g., Team Alpha"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fmName">Floor Manager Name</Label>
                    <Input
                      id="fmName"
                      placeholder="e.g., John Smith"
                      value={newFMName}
                      onChange={(e) => setNewFMName(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => createTeam.mutate({ teamName: newTeamName, floorManagerName: newFMName })}
                    disabled={!newTeamName || !newFMName || createTeam.isPending}
                  >
                    {createTeam.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : teamsWithStats && teamsWithStats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Floor Manager</TableHead>
                  <TableHead>Assigned Users</TableHead>
                  <TableHead>GPs</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamsWithStats.map((team: any) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.teamName}</TableCell>
                    <TableCell>{team.floorManagerName}</TableCell>
                    <TableCell>
                      {team.assignedUsers?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {team.assignedUsers.map((u: any) => (
                            <Badge key={u.id} variant="secondary" className="text-xs">
                              {u.name || u.email || "Unknown"}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>{team.gpCount}</TableCell>
                    <TableCell>{team.reportCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Dialog open={editingTeam?.id === team.id} onOpenChange={(open) => !open && setEditingTeam(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setEditingTeam(team)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Team</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Team Name</Label>
                                <Input
                                  value={editingTeam?.teamName || ""}
                                  onChange={(e) => setEditingTeam({ ...editingTeam, teamName: e.target.value })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Floor Manager Name</Label>
                                <Input
                                  value={editingTeam?.floorManagerName || ""}
                                  onChange={(e) => setEditingTeam({ ...editingTeam, floorManagerName: e.target.value })}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditingTeam(null)}>
                                Cancel
                              </Button>
                              <Button 
                                onClick={() => updateTeam.mutate({
                                  teamId: editingTeam.id,
                                  teamName: editingTeam.teamName,
                                  floorManagerName: editingTeam.floorManagerName,
                                })}
                                disabled={updateTeam.isPending}
                              >
                                {updateTeam.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Save
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Team</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{team.teamName}"? All users will be unassigned from this team.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTeam.mutate({ teamId: team.id })}
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
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No teams found. Create your first team to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// GP Access Links Tab Component
function GPAccessLinksTab({ 
  gamePresenters, 
  accessTokens, 
  teams, 
  refetchTokens,
  isLoading 
}: { 
  gamePresenters: any[];
  accessTokens: any[];
  teams: any[];
  refetchTokens: () => void;
  isLoading: boolean;
}) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatingForGp, setGeneratingForGp] = useState<number | null>(null);

  const generateTokenMutation = trpc.gpAccess.generateToken.useMutation();
  const deactivateTokenMutation = trpc.gpAccess.deactivate.useMutation();

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

  return (
    <TabsContent value="access" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            GP Access Links
          </CardTitle>
          <CardDescription>
            Generate unique links for Game Presenters to view their evaluations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : gamePresenters && gamePresenters.length > 0 ? (
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
                          format(new Date(tokenData.token.lastAccessedAt), "MMM d, yyyy HH:mm")
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {hasActiveLink ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(tokenData.token.token)}
                              >
                                {copiedToken === tokenData.token.token ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(`/gp/${tokenData.token.token}`, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeactivateToken(tokenData.token.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateToken(gp.id)}
                              disabled={generatingForGp === gp.id}
                            >
                              {generatingForGp === gp.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Link className="h-4 w-4 mr-2" />
                                  Generate Link
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No Game Presenters found
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// Error Files Tab Component
function ErrorFilesTab({ 
  errorFiles, 
  refetchFiles,
  selectedMonth,
  selectedYear,
  setSelectedMonth,
  setSelectedYear
}: { 
  errorFiles: any[];
  refetchFiles: () => void;
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorType, setErrorType] = useState<"playgon" | "mg">("playgon");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const uploadErrorsMutation = trpc.errorFile.upload.useMutation();
  const deleteErrorsMutation = trpc.errorFile.delete.useMutation();

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

  return (
    <TabsContent value="errors" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Upload Error Files
          </CardTitle>
          <CardDescription>
            Upload Playgon or MG error files to track GP mistakes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Error Type</Label>
              <Select value={errorType} onValueChange={(v: "playgon" | "mg") => setErrorType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="playgon">Playgon</SelectItem>
                  <SelectItem value="mg">MG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploaded Error Files</CardTitle>
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
                              Are you sure you want to delete "{file.fileName}"?
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
  );
}

// GP Stats Tab Component
function GPStatsTab({ 
  teams, 
  selectedMonth, 
  selectedYear, 
  setSelectedMonth, 
  setSelectedYear,
  isFMView = false
}: { 
  teams: { id: number; teamName: string; floorManagerName: string }[];
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
  isFMView?: boolean;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(isFMView && teams.length > 0 ? teams[0].id : null);
  const [editingGpId, setEditingGpId] = useState<number | null>(null);
  const [editAttitude, setEditAttitude] = useState<number | null>(null);
  const [editMistakes, setEditMistakes] = useState<number>(0);
  const [editTotalGames, setEditTotalGames] = useState<number>(0);

  const { data: gpsWithStats, isLoading, refetch } = trpc.gamePresenter.listWithStats.useQuery({
    teamId: selectedTeamId || undefined,
    month: selectedMonth,
    year: selectedYear,
  });

  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation({
    onSuccess: () => {
      toast.success("Stats updated");
      refetch();
      setEditingGpId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update stats");
    },
  });

  const handleSaveStats = (gpId: number) => {
    updateStatsMutation.mutate({
      gpId,
      month: selectedMonth,
      year: selectedYear,
      attitude: editAttitude,
      mistakes: editMistakes,
      totalGames: editTotalGames,
    });
  };

  const startEditing = (gp: any) => {
    setEditingGpId(gp.id);
    setEditAttitude(gp.stats?.attitude || null);
    setEditMistakes(gp.stats?.mistakes || 0);
    setEditTotalGames(gp.stats?.totalGames || 0);
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
            Track attitude and mistakes for each Game Presenter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {!isFMView && (
              <div className="space-y-2">
                <Label>Team</Label>
                <Select 
                  value={selectedTeamId ? String(selectedTeamId) : "all"} 
                  onValueChange={(v) => setSelectedTeamId(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-40">
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
            )}
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gpsWithStats.map((gp: any) => (
                  <TableRow key={gp.id}>
                    <TableCell className="font-medium">{gp.name}</TableCell>
                    <TableCell>
                      {teams.find(t => t.id === gp.teamId)?.teamName || 
                        <span className="text-muted-foreground">Unassigned</span>
                      }
                    </TableCell>
                    <TableCell className="text-center">
                      {editingGpId === gp.id ? (
                        <QuickAttitudeButtons
                          gpId={gp.id}
                          currentAttitude={editAttitude}
                          currentMistakes={editMistakes}
                          selectedMonth={selectedMonth}
                          selectedYear={selectedYear}
                          onUpdate={refetch}
                        />
                      ) : (
                        <QuickAttitudeButtons
                          gpId={gp.id}
                          currentAttitude={gp.stats?.attitude || null}
                          currentMistakes={gp.stats?.mistakes || 0}
                          selectedMonth={selectedMonth}
                          selectedYear={selectedYear}
                          onUpdate={refetch}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {editingGpId === gp.id ? (
                        <Input
                          type="number"
                          min="0"
                          value={editMistakes}
                          onChange={(e) => setEditMistakes(Number(e.target.value))}
                          className="w-20 text-center"
                        />
                      ) : (
                        <Badge variant={gp.stats?.mistakes > 0 ? "destructive" : "secondary"}>
                          {gp.stats?.mistakes || 0}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {editingGpId === gp.id ? (
                        <Input
                          type="number"
                          min="0"
                          value={editTotalGames}
                          onChange={(e) => setEditTotalGames(Number(e.target.value))}
                          className="w-20 text-center"
                        />
                      ) : (
                        gp.stats?.totalGames || 0
                      )}
                    </TableCell>
                    <TableCell>
                      {editingGpId === gp.id ? (
                        <div className="flex items-center gap-1">
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
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingGpId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(gp)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No Game Presenters found for the selected criteria
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// Quick Attitude Buttons Component
function QuickAttitudeButtons({ 
  gpId, 
  currentAttitude, 
  currentMistakes,
  selectedMonth, 
  selectedYear, 
  onUpdate 
}: { 
  gpId: number;
  currentAttitude: number | null;
  currentMistakes: number;
  selectedMonth: number;
  selectedYear: number;
  onUpdate: () => void;
}) {
  const [isUpdating, setIsUpdating] = useState<number | null>(null);
  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation();

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

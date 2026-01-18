import { useState, useCallback, useMemo } from "react";
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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  FileSpreadsheet, Loader2, Users, AlertTriangle, Trash2, Link, Copy, Check, 
  RefreshCw, ExternalLink, Star, AlertCircle, UserCog, Download, Shield, 
  Building2, Plus, Edit, BarChart3, Activity, CheckSquare, Square, RotateCcw,
  TrendingUp, TrendingDown, Search, Filter, X, Eye, EyeOff, Calendar,
  Award, Target, Zap, Clock, ChevronUp, ChevronDown
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">
            Manage your team: {team?.teamName || "Loading..."}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Users className="h-3 w-3 mr-1" />
          Floor Manager
        </Badge>
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
      <div className="space-y-6 p-6">
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
    <div className="space-y-6 p-6">
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
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </TabsContent>
    );
  }

  const statCards = [
    { 
      title: "Total Users", 
      value: adminStats?.totalUsers || 0, 
      icon: Users, 
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950/30"
    },
    { 
      title: "Teams", 
      value: adminStats?.totalTeams || 0, 
      icon: Building2, 
      color: "text-purple-500",
      bgColor: "bg-purple-50 dark:bg-purple-950/30"
    },
    { 
      title: "Game Presenters", 
      value: adminStats?.totalGPs || 0, 
      icon: Star, 
      color: "text-yellow-500",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/30"
    },
    { 
      title: "Evaluations", 
      value: adminStats?.totalEvaluations || 0, 
      icon: Target, 
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-950/30"
    },
    { 
      title: "Reports", 
      value: adminStats?.totalReports || 0, 
      icon: FileSpreadsheet, 
      color: "text-orange-500",
      bgColor: "bg-orange-50 dark:bg-orange-950/30"
    },
  ];

  return (
    <TabsContent value="overview" className="space-y-6">
      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        {statCards.map((stat, idx) => (
          <Card key={idx} className={`${stat.bgColor} border-0`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("Navigate to Users tab")}>
              <UserCog className="h-6 w-6" />
              <span>Manage Users</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("Navigate to Teams tab")}>
              <Building2 className="h-6 w-6" />
              <span>Manage Teams</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("Navigate to GP Stats tab")}>
              <Star className="h-6 w-6" />
              <span>View GP Stats</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("Navigate to Errors tab")}>
              <AlertTriangle className="h-6 w-6" />
              <span>Check Errors</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Database</span>
                <span className="text-green-500 font-medium">Healthy</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Storage</span>
                <span className="text-green-500 font-medium">Available</span>
              </div>
              <Progress value={35} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>API</span>
                <span className="text-green-500 font-medium">Operational</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// User Management Tab Component
function UserManagementTab({ teams }: { teams: { id: number; teamName: string }[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  
  const { data: users, isLoading, refetch } = trpc.user.list.useQuery();
  const updateRole = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  const assignTeam = trpc.user.assignToTeam.useMutation({
    onSuccess: () => {
      toast.success("Team assigned");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to assign team");
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

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => {
      const user = u.user;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = user.name?.toLowerCase() || "";
        const email = user.email?.toLowerCase() || "";
        if (!name.includes(query) && !email.includes(query)) return false;
      }
      if (filterRole && filterRole !== "all" && user.role !== filterRole) return false;
      return true;
    });
  }, [users, searchQuery, filterRole]);

  const hasActiveFilters = searchQuery || (filterRole && filterRole !== "all");

  return (
    <TabsContent value="users" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                {filteredUsers.length} of {users?.length || 0} users
                {hasActiveFilters && " (filtered)"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/50 rounded-lg">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setFilterRole("all"); }}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const user = u.user;
                    return (
                    <TableRow key={user.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {(user.name || user.email || "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{user.name || "No name"}</div>
                            <div className="text-sm text-muted-foreground">{user.email || "No email"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(role) => updateRole.mutate({ userId: user.id, role: role as "admin" | "user" })}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="user">
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                User
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.teamId ? String(user.teamId) : "none"}
                          onValueChange={(teamId) => assignTeam.mutate({ 
                            userId: user.id, 
                            teamId: teamId === "none" ? null : Number(teamId) 
                          })}
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="No team" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No team</SelectItem>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={String(team.id)}>
                                {team.teamName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(user.createdAt), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{user.name || user.email}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUser.mutate({ userId: user.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );})}                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {hasActiveFilters ? "No users match your filters" : "No users found"}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// Teams Management Tab Component
function TeamsManagementTab({ refetchTeams }: { refetchTeams: () => void }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newFMName, setNewFMName] = useState("");
  const [editingTeam, setEditingTeam] = useState<any>(null);

  const { data: teamsWithStats, isLoading, refetch } = trpc.fmTeam.listWithStats.useQuery();

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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teamsWithStats.map((team: any) => (
                <Card key={team.id} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/50" />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{team.teamName}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Dialog open={editingTeam?.id === team.id} onOpenChange={(open) => !open && setEditingTeam(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
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
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
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
                    </div>
                    <CardDescription>{team.floorManagerName}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">{team.gpCount}</div>
                        <div className="text-xs text-muted-foreground">GPs</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{team.reportCount}</div>
                        <div className="text-xs text-muted-foreground">Reports</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{team.assignedUsers?.length || 0}</div>
                        <div className="text-xs text-muted-foreground">Users</div>
                      </div>
                    </div>
                    {team.assignedUsers?.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-xs text-muted-foreground mb-2">Assigned Users:</div>
                        <div className="flex flex-wrap gap-1">
                          {team.assignedUsers.slice(0, 3).map((u: any, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {u.name || u.email || "Unknown"}
                            </Badge>
                          ))}
                          {team.assignedUsers.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{team.assignedUsers.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No teams yet</h3>
              <p className="text-muted-foreground mb-4">Create your first team to get started</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Team
              </Button>
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
  const [searchQuery, setSearchQuery] = useState("");

  const generateToken = trpc.gpAccess.generateToken.useMutation({
    onSuccess: () => {
      toast.success("Access link generated");
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate link");
    },
  });

  const deactivateToken = trpc.gpAccess.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Access link deactivated");
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to deactivate link");
    },
  });

  const handleGenerateToken = async (gpId: number) => {
    setGeneratingForGp(gpId);
    try {
      await generateToken.mutateAsync({ gpId });
    } finally {
      setGeneratingForGp(null);
    }
  };

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/gp-portal/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const filteredGPs = useMemo(() => {
    if (!searchQuery) return gamePresenters;
    const query = searchQuery.toLowerCase();
    return gamePresenters.filter(gp => gp.name.toLowerCase().includes(query));
  }, [gamePresenters, searchQuery]);

  // Group GPs by team
  const gpsByTeam = useMemo(() => {
    const grouped: Record<number, any[]> = {};
    filteredGPs.forEach(gp => {
      const teamId = gp.teamId || 0;
      if (!grouped[teamId]) grouped[teamId] = [];
      grouped[teamId].push(gp);
    });
    return grouped;
  }, [filteredGPs]);

  return (
    <TabsContent value="access" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            GP Access Links
          </CardTitle>
          <CardDescription>
            Generate unique access links for Game Presenters to view their evaluations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Game Presenters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredGPs.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(gpsByTeam).map(([teamId, gps]) => {
                const team = teams.find(t => t.id === Number(teamId));
                return (
                  <div key={teamId} className="space-y-2">
                    <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {team?.teamName || "Unassigned"}
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Access Link</TableHead>
                            <TableHead className="w-[150px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gps.map((gp) => {
                            const token = accessTokens.find(t => t.gpId === gp.id && t.isActive);
                            return (
                              <TableRow key={gp.id} className="hover:bg-muted/50">
                                <TableCell className="font-medium">{gp.name}</TableCell>
                                <TableCell>
                                  {token ? (
                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                      <Check className="h-3 w-3 mr-1" />
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">No Link</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {token ? (
                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                      /gp-portal/{token.token.slice(0, 8)}...
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {token ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => copyToClipboard(token.token)}
                                        >
                                          {copiedToken === token.token ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                          ) : (
                                            <Copy className="h-4 w-4" />
                                          )}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => window.open(`/gp-portal/${token.token}`, "_blank")}
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-destructive hover:text-destructive"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Deactivate Link</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                This will revoke access for {gp.name}. They will no longer be able to view their evaluations.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => deactivateToken.mutate({ id: token.id })}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              >
                                                Deactivate
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => handleGenerateToken(gp.id)}
                                        disabled={generatingForGp === gp.id}
                                      >
                                        {generatingForGp === gp.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                          <Plus className="h-4 w-4 mr-2" />
                                        )}
                                        Generate
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? "No Game Presenters match your search" : "No Game Presenters found"}
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

  const uploadMutation = trpc.errorFile.upload.useMutation({
    onSuccess: () => {
      toast.success("Error file uploaded");
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload file");
    },
  });

  const deleteMutation = trpc.errorFile.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await uploadMutation.mutateAsync({
filename: file.name,
                  errorType: errorType,
                  month: selectedMonth,
                  year: selectedYear,
                  fileBase64: base64,
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Failed to read file");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    setDeletingId(fileId);
    try {
      await deleteMutation.mutateAsync({ id: fileId });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <TabsContent value="errors" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Upload Error Files
          </CardTitle>
          <CardDescription>
            Upload Playgon or MG error files for tracking GP mistakes.
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
          <CardDescription>{errorFiles.length} files uploaded</CardDescription>
        </CardHeader>
        <CardContent>
          {errorFiles && errorFiles.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Filename</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorFiles.map((file) => (
                    <TableRow key={file.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{file.fileName}</TableCell>
                      <TableCell>
                        <Badge variant={file.fileType === 'playgon' ? 'default' : 'secondary'}>
                          {file.fileType === 'playgon' ? 'Playgon' : 'MG'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {MONTHS[file.month - 1]} {file.year}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(file.createdAt), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
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
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No error files uploaded</h3>
              <p className="text-muted-foreground">Upload your first error file to track GP mistakes</p>
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
  const [searchQuery, setSearchQuery] = useState("");
  
  // Bulk selection state
  const [selectedGpIds, setSelectedGpIds] = useState<number[]>([]);
  const [bulkAttitude, setBulkAttitude] = useState<number>(3);

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

  // Bulk mutations
  const bulkSetAttitudeMutation = trpc.gamePresenter.bulkSetAttitude.useMutation({
    onSuccess: (result) => {
      toast.success(`Updated attitude for ${result.success} GPs`);
      setSelectedGpIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to bulk update attitude");
    },
  });

  const bulkResetMistakesMutation = trpc.gamePresenter.bulkResetMistakes.useMutation({
    onSuccess: (result) => {
      toast.success(`Reset mistakes for ${result.success} GPs`);
      setSelectedGpIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reset mistakes");
    },
  });

  const filteredGPs = useMemo(() => {
    if (!gpsWithStats) return [];
    if (!searchQuery) return gpsWithStats;
    const query = searchQuery.toLowerCase();
    return gpsWithStats.filter((gp: any) => gp.name.toLowerCase().includes(query));
  }, [gpsWithStats, searchQuery]);

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

  // Bulk selection handlers
  const toggleGpSelection = (gpId: number) => {
    setSelectedGpIds(prev => 
      prev.includes(gpId) ? prev.filter(id => id !== gpId) : [...prev, gpId]
    );
  };

  const toggleSelectAll = () => {
    if (!filteredGPs) return;
    if (selectedGpIds.length === filteredGPs.length) {
      setSelectedGpIds([]);
    } else {
      setSelectedGpIds(filteredGPs.map((gp: any) => gp.id));
    }
  };

  const handleBulkSetAttitude = () => {
    if (selectedGpIds.length === 0) {
      toast.error("Please select at least one GP");
      return;
    }
    bulkSetAttitudeMutation.mutate({
      gpIds: selectedGpIds,
      attitude: bulkAttitude,
      month: selectedMonth,
      year: selectedYear,
    });
  };

  const handleBulkResetMistakes = () => {
    if (selectedGpIds.length === 0) {
      toast.error("Please select at least one GP");
      return;
    }
    bulkResetMistakesMutation.mutate({
      gpIds: selectedGpIds,
      month: selectedMonth,
      year: selectedYear,
    });
  };

  // Stats summary
  const statsSummary = useMemo(() => {
    if (!filteredGPs || filteredGPs.length === 0) return null;
    const withAttitude = filteredGPs.filter((gp: any) => gp.stats?.attitude != null);
    const avgAttitude = withAttitude.length > 0 
      ? withAttitude.reduce((sum: number, gp: any) => sum + (gp.stats?.attitude || 0), 0) / withAttitude.length 
      : 0;
    const totalMistakes = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.mistakes || 0), 0);
    const highPerformers = filteredGPs.filter((gp: any) => (gp.stats?.attitude || 0) >= 4).length;
    
    return { avgAttitude, totalMistakes, highPerformers, total: filteredGPs.length };
  }, [filteredGPs]);

  return (
    <TabsContent value="stats" className="space-y-4">
      {/* Stats Summary */}
      {statsSummary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total GPs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsSummary.total}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950/30 border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Award className="h-4 w-4 text-green-500" />
                High Performers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{statsSummary.highPerformers}</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 dark:bg-yellow-950/30 border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Attitude</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsSummary.avgAttitude.toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 dark:bg-red-950/30 border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Total Mistakes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{statsSummary.totalMistakes}</div>
            </CardContent>
          </Card>
        </div>
      )}

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
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/50 rounded-lg">
            {!isFMView && (
              <div className="space-y-2">
                <Label>Team</Label>
                <Select 
                  value={selectedTeamId ? String(selectedTeamId) : "all"} 
                  onValueChange={(v) => setSelectedTeamId(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
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
                <SelectTrigger className="w-[140px]">
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
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="sr-only">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedGpIds.length > 0 && (
            <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <Badge variant="secondary" className="text-sm">
                {selectedGpIds.length} selected
              </Badge>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Set Attitude:</Label>
                <Select value={String(bulkAttitude)} onValueChange={(v) => setBulkAttitude(Number(v))}>
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  size="sm" 
                  onClick={handleBulkSetAttitude}
                  disabled={bulkSetAttitudeMutation.isPending}
                >
                  {bulkSetAttitudeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Apply
                </Button>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleBulkResetMistakes}
                disabled={bulkResetMistakesMutation.isPending}
              >
                {bulkResetMistakesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reset Mistakes
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setSelectedGpIds([])}
              >
                Clear Selection
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredGPs && filteredGPs.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px]">
                      <Checkbox 
                        checked={selectedGpIds.length === filteredGPs.length && filteredGPs.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    {!isFMView && <TableHead>Team</TableHead>}
                    <TableHead className="text-center">Attitude (1-5)</TableHead>
                    <TableHead className="text-center">Mistakes</TableHead>
                    <TableHead className="text-center">Total Games</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGPs.map((gp: any) => (
                    <TableRow 
                      key={gp.id} 
                      className={selectedGpIds.includes(gp.id) ? "bg-primary/5" : "hover:bg-muted/50"}
                    >
                      <TableCell>
                        <Checkbox 
                          checked={selectedGpIds.includes(gp.id)}
                          onCheckedChange={() => toggleGpSelection(gp.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{gp.name}</TableCell>
                      {!isFMView && (
                        <TableCell>
                          {teams.find(t => t.id === gp.teamId)?.teamName || 
                            <span className="text-muted-foreground">Unassigned</span>
                          }
                        </TableCell>
                      )}
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
                            className="w-20 text-center mx-auto"
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
                            className="w-20 text-center mx-auto"
                          />
                        ) : (
                          gp.stats?.totalGames || 0
                        )}
                      </TableCell>
                      <TableCell>
                        {editingGpId === gp.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              className="h-8 w-8"
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
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditingGpId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
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
            </div>
          ) : (
            <div className="text-center py-12">
              <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No Game Presenters found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "Try adjusting your search" : "Select a team or add Game Presenters"}
              </p>
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
          className={`w-8 h-8 p-0 text-xs font-medium ${getButtonStyle(n)}`}
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

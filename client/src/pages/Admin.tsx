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
  Award, Target, Zap, Clock, ChevronUp, ChevronDown, Mail, Send, UserPlus,
  MailCheck, MailX, MailQuestion, Sparkles, Timer, Trophy, ThumbsUp, ThumbsDown
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
          refetchGPs={refetchGPs}
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
        <TabsList className="grid w-full grid-cols-7 h-auto p-1">
          <TabsTrigger value="overview" className="flex items-center justify-center gap-2 py-2">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center justify-center gap-2 py-2">
            <UserPlus className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Invites</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center justify-center gap-2 py-2">
            <UserCog className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center justify-center gap-2 py-2">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Teams</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center justify-center gap-2 py-2">
            <Star className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">GP Stats</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center justify-center gap-2 py-2">
            <Link className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">GP Access</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center justify-center gap-2 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Errors</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <AdminOverviewTab />

        {/* Invitations Tab */}
        <InvitationsTab teams={teams || []} />

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
          refetchGPs={refetchGPs}
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
  const [selectedGPs, setSelectedGPs] = useState<number[]>([]);
  const [gpSearchTerm, setGpSearchTerm] = useState("");

  const { data: teamsWithGPs, isLoading, refetch } = trpc.fmTeam.listWithGPs.useQuery();
  const { data: allGPs } = trpc.gamePresenter.list.useQuery();
  const { data: unassignedGPs, refetch: refetchUnassigned } = trpc.fmTeam.getUnassignedGPs.useQuery();

  const createTeam = trpc.fmTeam.create.useMutation({
    onSuccess: () => {
      toast.success("Team created successfully");
      setIsCreateOpen(false);
      setNewTeamName("");
      setNewFMName("");
      refetch();
      refetchTeams();
      refetchUnassigned();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create team");
    },
  });

  const updateTeam = trpc.fmTeam.update.useMutation({
    onSuccess: () => {
      toast.success("Team updated successfully");
      setEditingTeam(null);
      setSelectedGPs([]);
      setGpSearchTerm("");
      refetch();
      refetchTeams();
      refetchUnassigned();
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
      refetchUnassigned();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete team");
    },
  });

  // When editing team opens, set selected GPs
  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setSelectedGPs(team.gamePresenters?.map((gp: any) => gp.id) || []);
    setGpSearchTerm("");
  };

  // Get available GPs for selection (unassigned + currently assigned to this team)
  const getAvailableGPs = () => {
    if (!allGPs) return [];
    return allGPs.filter((gp: any) => {
      // Include if unassigned or assigned to current editing team
      return !gp.teamId || gp.teamId === editingTeam?.id;
    });
  };

  const availableGPs = getAvailableGPs();
  const filteredGPs = availableGPs.filter((gp: any) =>
    gp.name.toLowerCase().includes(gpSearchTerm.toLowerCase())
  );

  const toggleGP = (gpId: number) => {
    setSelectedGPs(prev =>
      prev.includes(gpId)
        ? prev.filter(id => id !== gpId)
        : [...prev, gpId]
    );
  };

  const selectAllFilteredGPs = () => {
    const filteredIds = filteredGPs.map((gp: any) => gp.id);
    setSelectedGPs(prev => {
      const newSet = new Set([...prev, ...filteredIds]);
      return Array.from(newSet);
    });
  };

  const deselectAllGPs = () => {
    setSelectedGPs([]);
  };

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
                Create and manage FM teams. Assign Game Presenters to each team.
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
                    Add a new FM team. You can assign GPs after creating the team.
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
          ) : teamsWithGPs && teamsWithGPs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teamsWithGPs.map((team: any) => (
                <Card key={team.id} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/50" />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{team.teamName}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Dialog open={editingTeam?.id === team.id} onOpenChange={(open) => {
                          if (!open) {
                            setEditingTeam(null);
                            setSelectedGPs([]);
                            setGpSearchTerm("");
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditTeam(team)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit Team: {team.teamName}</DialogTitle>
                              <DialogDescription>
                                Update team details and assign Game Presenters.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                              {/* Team Details */}
                              <div className="grid grid-cols-2 gap-4">
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

                              {/* GP Selection */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label className="text-base font-semibold">Assign Game Presenters</Label>
                                  <Badge variant="secondary">
                                    {selectedGPs.length} selected
                                  </Badge>
                                </div>

                                {/* Search and Actions */}
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                      placeholder="Search GPs..."
                                      value={gpSearchTerm}
                                      onChange={(e) => setGpSearchTerm(e.target.value)}
                                      className="pl-9"
                                    />
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={selectAllFilteredGPs}
                                    disabled={filteredGPs.length === 0}
                                  >
                                    <CheckSquare className="h-4 w-4 mr-1" />
                                    All
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={deselectAllGPs}
                                    disabled={selectedGPs.length === 0}
                                  >
                                    <Square className="h-4 w-4 mr-1" />
                                    None
                                  </Button>
                                </div>

                                {/* GP List */}
                                <div className="border rounded-lg max-h-64 overflow-y-auto">
                                  {filteredGPs.length > 0 ? (
                                    <div className="divide-y">
                                      {filteredGPs.map((gp: any) => (
                                        <label
                                          key={gp.id}
                                          className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                                        >
                                          <Checkbox
                                            checked={selectedGPs.includes(gp.id)}
                                            onCheckedChange={() => toggleGP(gp.id)}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{gp.name}</div>
                                            {gp.teamId && gp.teamId !== editingTeam?.id && (
                                              <div className="text-xs text-muted-foreground">
                                                Currently in another team
                                              </div>
                                            )}
                                          </div>
                                          <Star className="h-4 w-4 text-yellow-500 shrink-0" />
                                        </label>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="p-8 text-center text-muted-foreground">
                                      <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No GPs found</p>
                                      {gpSearchTerm && (
                                        <p className="text-sm">Try a different search term</p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Selected GPs Preview */}
                                {selectedGPs.length > 0 && (
                                  <div className="bg-muted/50 rounded-lg p-3">
                                    <div className="text-sm font-medium mb-2">Selected GPs:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {selectedGPs.slice(0, 10).map(gpId => {
                                        const gp = availableGPs.find((g: any) => g.id === gpId);
                                        return gp ? (
                                          <Badge
                                            key={gpId}
                                            variant="secondary"
                                            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                            onClick={() => toggleGP(gpId)}
                                          >
                                            {gp.name}
                                            <X className="h-3 w-3 ml-1" />
                                          </Badge>
                                        ) : null;
                                      })}
                                      {selectedGPs.length > 10 && (
                                        <Badge variant="outline">
                                          +{selectedGPs.length - 10} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => {
                                setEditingTeam(null);
                                setSelectedGPs([]);
                                setGpSearchTerm("");
                              }}>
                                Cancel
                              </Button>
                              <Button
                                onClick={() => updateTeam.mutate({
                                  teamId: editingTeam.id,
                                  teamName: editingTeam.teamName,
                                  floorManagerName: editingTeam.floorManagerName,
                                  gpIds: selectedGPs,
                                })}
                                disabled={updateTeam.isPending}
                              >
                                {updateTeam.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Save Changes
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
                                Are you sure you want to delete "{team.teamName}"? All users and GPs will be unassigned from this team.
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

                    {/* Show assigned GPs */}
                    {team.gamePresenters?.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          Game Presenters:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {team.gamePresenters.slice(0, 5).map((gp: any) => (
                            <Badge key={gp.id} variant="outline" className="text-xs">
                              {gp.name}
                            </Badge>
                          ))}
                          {team.gamePresenters.length > 5 && (
                            <Badge variant="secondary" className="text-xs">
                              +{team.gamePresenters.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Show assigned users */}
                    {team.assignedUsers?.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Assigned Users:
                        </div>
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

      {/* Unassigned GPs Section */}
      {unassignedGPs && unassignedGPs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="h-5 w-5 text-yellow-500" />
              Unassigned Game Presenters
              <Badge variant="secondary">{unassignedGPs.length}</Badge>
            </CardTitle>
            <CardDescription>
              These GPs are not assigned to any team. Edit a team above to assign them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unassignedGPs.slice(0, 20).map((gp: any) => (
                <Badge key={gp.id} variant="outline" className="py-1">
                  {gp.name}
                </Badge>
              ))}
              {unassignedGPs.length > 20 && (
                <Badge variant="secondary">
                  +{unassignedGPs.length - 20} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}

// GP Access Links Tab Component
function GPAccessLinksTab({ 
  gamePresenters, 
  accessTokens, 
  teams, 
  refetchTokens,
  refetchGPs,
  isLoading 
}: { 
  gamePresenters: any[];
  accessTokens: any[];
  teams: any[];
  refetchTokens: () => void;
  refetchGPs: () => void;
  isLoading: boolean;
}) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatingForGp, setGeneratingForGp] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [assigningTeamForGp, setAssigningTeamForGp] = useState<number | null>(null);

  const assignToTeam = trpc.gamePresenter.assignToTeam.useMutation({
    onSuccess: () => {
      toast.success("GP assigned to team");
      refetchGPs();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to assign team");
    },
  });

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Export to CSV function
  const exportToCSV = () => {
    setIsExportingCSV(true);
    try {
      // Prepare CSV data
      const csvRows: string[] = [];
      csvRows.push('GP Name,Team,Access Link,Status,Last Accessed');
      
      gamePresenters.forEach(gp => {
        const tokenData = accessTokens.find(t => t.token?.gamePresenterId === gp.id && t.token?.isActive === 1);
        const token = tokenData?.token;
        const team = teams.find(t => t.id === gp.teamId);
        
        const gpName = gp.name.replace(/,/g, ' ');
        const teamName = team?.teamName?.replace(/,/g, ' ') || 'Unassigned';
        const accessLink = token ? `${window.location.origin}/gp-portal/${token.token}` : '';
        const status = token ? 'Active' : 'No Link';
        const lastAccessed = token?.lastAccessedAt ? new Date(token.lastAccessedAt).toLocaleDateString() : '-';
        
        csvRows.push(`${gpName},${teamName},${accessLink},${status},${lastAccessed}`);
      });
      
      // Create and download CSV file
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gp-access-links-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported ${gamePresenters.length} GP access links to CSV`);
    } catch (error) {
      toast.error('Failed to export CSV');
    } finally {
      setIsExportingCSV(false);
    }
  };

  const generateToken = trpc.gpAccess.generateToken.useMutation({
    onSuccess: () => {
      toast.success("Access link generated");
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate link");
    },
  });

  const generateAllTokens = trpc.gpAccess.generateAllTokens.useMutation({
    onSuccess: (result) => {
      toast.success(`Generated ${result.totalGenerated} access links (${result.totalSkipped} already had links)`);
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate links");
    },
  });

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      await generateAllTokens.mutateAsync({});
    } finally {
      setIsGeneratingAll(false);
    }
  };

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
          <div className="pt-2 flex gap-2">
            <Button 
              onClick={handleGenerateAll}
              disabled={isGeneratingAll}
              className="gap-2"
            >
              {isGeneratingAll ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><Zap className="h-4 w-4" /> Generate All Links</>
              )}
            </Button>
            <Button 
              variant="outline"
              onClick={exportToCSV}
              disabled={isExportingCSV || gamePresenters.length === 0}
              className="gap-2"
            >
              {isExportingCSV ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
              ) : (
                <><Download className="h-4 w-4" /> Export to CSV</>
              )}
            </Button>
          </div>
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
                            <TableHead>Team</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Access Link</TableHead>
                            <TableHead className="w-[150px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gps.map((gp) => {
                            // accessTokens returns {token: {...}, gp: {...}} structure
                            const tokenData = accessTokens.find(t => t.token?.gamePresenterId === gp.id && t.token?.isActive === 1);
                            const token = tokenData ? { ...tokenData.token, gpId: tokenData.token?.gamePresenterId } : null;
                            return (
                              <TableRow key={gp.id} className="hover:bg-muted/50">
                                <TableCell className="font-medium">{gp.name}</TableCell>
                                <TableCell>
                                  <Select
                                    value={gp.teamId?.toString() || "0"}
                                    onValueChange={(value) => {
                                      const newTeamId = parseInt(value);
                                      if (newTeamId !== gp.teamId) {
                                        setAssigningTeamForGp(gp.id);
                                        assignToTeam.mutate(
                                          { gpId: gp.id, teamId: newTeamId },
                                          { onSettled: () => setAssigningTeamForGp(null) }
                                        );
                                      }
                                    }}
                                    disabled={assigningTeamForGp === gp.id}
                                  >
                                    <SelectTrigger className="w-[140px] h-8">
                                      {assigningTeamForGp === gp.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <SelectValue placeholder="Select team" />
                                      )}
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="0">Unassigned</SelectItem>
                                      {teams.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>
                                          {t.teamName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
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

// Invitations Tab Component - Modern UI for invite-only registration
function InvitationsTab({ teams }: { teams: { id: number; teamName: string; floorManagerName: string }[] }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("none");
  const [selectedRole, setSelectedRole] = useState<"user" | "admin">("user");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: invitations, isLoading, refetch } = trpc.invitation.list.useQuery();
  const { data: stats } = trpc.invitation.stats.useQuery();

  const createMutation = trpc.invitation.create.useMutation({
    onSuccess: (data) => {
      toast.success("Invitation created successfully");
      setIsCreateOpen(false);
      setEmail("");
      setSelectedTeamId("");
      setSelectedRole("user");
      refetch();
      // Auto-copy link
      const url = `${window.location.origin}/invite/${data.token}`;
      navigator.clipboard.writeText(url);
      toast.info("Invite link copied to clipboard!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create invitation");
    },
  });

  const bulkCreateMutation = trpc.invitation.bulkCreate.useMutation({
    onSuccess: (result) => {
      toast.success(`Created ${result.successful} invitations (${result.failed} failed)`);
      setIsBulkOpen(false);
      setBulkEmails("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create invitations");
    },
  });

  const revokeMutation = trpc.invitation.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      refetch();
    },
  });

  const deleteMutation = trpc.invitation.delete.useMutation({
    onSuccess: () => {
      toast.success("Invitation deleted");
      refetch();
    },
  });

  const resendMutation = trpc.invitation.resend.useMutation({
    onSuccess: (data) => {
      toast.success("New invitation link generated");
      refetch();
      const url = `${window.location.origin}/invite/${data.token}`;
      navigator.clipboard.writeText(url);
      toast.info("New link copied to clipboard!");
    },
  });

  const handleCreate = () => {
    if (!email) {
      toast.error("Please enter an email address");
      return;
    }
    createMutation.mutate({
      email,
      teamId: selectedTeamId && selectedTeamId !== 'none' ? Number(selectedTeamId) : undefined,
      role: selectedRole,
      expiresInDays,
    });
  };

  const handleBulkCreate = () => {
    const emails = bulkEmails
      .split(/[\n,;]/)
      .map(e => e.trim())
      .filter(e => e && e.includes("@"));
    
    if (emails.length === 0) {
      toast.error("Please enter at least one valid email address");
      return;
    }

    bulkCreateMutation.mutate({
      emails,
      teamId: selectedTeamId && selectedTeamId !== 'none' ? Number(selectedTeamId) : undefined,
      role: selectedRole,
      expiresInDays,
    });
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied!");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getStatusBadge = (invitation: any) => {
    const now = new Date();
    if (invitation.status === "accepted") {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><MailCheck className="h-3 w-3 mr-1" />Accepted</Badge>;
    }
    if (invitation.status === "revoked") {
      return <Badge variant="destructive"><MailX className="h-3 w-3 mr-1" />Revoked</Badge>;
    }
    if (invitation.status === "expired" || new Date(invitation.expiresAt) < now) {
      return <Badge variant="secondary"><Timer className="h-3 w-3 mr-1" />Expired</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><MailQuestion className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  const filteredInvitations = useMemo(() => {
    if (!invitations) return [];
    let filtered = invitations;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(inv => 
        inv.email.toLowerCase().includes(query) ||
        inv.team?.teamName?.toLowerCase().includes(query)
      );
    }
    
    if (statusFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(inv => {
        if (statusFilter === "pending") {
          return inv.status === "pending" && new Date(inv.expiresAt) >= now;
        }
        if (statusFilter === "expired") {
          return inv.status === "expired" || (inv.status === "pending" && new Date(inv.expiresAt) < now);
        }
        return inv.status === statusFilter;
      });
    }
    
    return filtered;
  }, [invitations, searchQuery, statusFilter]);

  return (
    <TabsContent value="invitations" className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Invitations</p>
                <p className="text-3xl font-bold">{stats?.total || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-amber-400" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold">{stats?.pending || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <MailQuestion className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-400" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Accepted</p>
                <p className="text-3xl font-bold">{stats?.accepted || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <MailCheck className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-500 to-gray-400" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired/Revoked</p>
                <p className="text-3xl font-bold">{(stats?.expired || 0) + (stats?.revoked || 0)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center">
                <MailX className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                FM Invitations
              </CardTitle>
              <CardDescription>
                Invite Floor Managers to join the system. They can only register with a valid invitation link.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Users className="h-4 w-4" />
                    Bulk Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Bulk Invite Floor Managers
                    </DialogTitle>
                    <DialogDescription>
                      Enter multiple email addresses to send invitations at once.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Email Addresses</Label>
                      <Textarea
                        placeholder="Enter emails separated by commas, semicolons, or new lines...\nexample1@email.com\nexample2@email.com"
                        value={bulkEmails}
                        onChange={(e) => setBulkEmails(e.target.value)}
                        rows={5}
                      />
                      <p className="text-xs text-muted-foreground">
                        {bulkEmails.split(/[\n,;]/).filter(e => e.trim() && e.includes("@")).length} valid emails detected
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Assign to Team</Label>
                        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select team (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No team</SelectItem>
                            {teams.map(team => (
                              <SelectItem key={team.id} value={String(team.id)}>
                                {team.teamName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={selectedRole} onValueChange={(v: "user" | "admin") => setSelectedRole(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Floor Manager</SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Expires In</Label>
                      <Select value={String(expiresInDays)} onValueChange={(v) => setExpiresInDays(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 day</SelectItem>
                          <SelectItem value="3">3 days</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="14">14 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBulkOpen(false)}>Cancel</Button>
                    <Button onClick={handleBulkCreate} disabled={bulkCreateMutation.isPending}>
                      {bulkCreateMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" />Send Invitations</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    New Invitation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Invite Floor Manager
                    </DialogTitle>
                    <DialogDescription>
                      Create an invitation link for a new Floor Manager to join.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input
                        type="email"
                        placeholder="fm@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Assign to Team</Label>
                        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No team</SelectItem>
                            {teams.map(team => (
                              <SelectItem key={team.id} value={String(team.id)}>
                                {team.teamName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={selectedRole} onValueChange={(v: "user" | "admin") => setSelectedRole(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Floor Manager</SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Expires In</Label>
                      <Select value={String(expiresInDays)} onValueChange={(v) => setExpiresInDays(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 day</SelectItem>
                          <SelectItem value="3">3 days</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="14">14 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                      {createMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" />Create & Copy Link</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filter */}
          <div className="flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Invitations Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredInvitations.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Email</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvitations.map((inv) => {
                    const isExpired = inv.status === "expired" || (inv.status === "pending" && new Date(inv.expiresAt) < new Date());
                    const isPending = inv.status === "pending" && !isExpired;
                    
                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {inv.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          {inv.team ? (
                            <Badge variant="outline">
                              <Building2 className="h-3 w-3 mr-1" />
                              {inv.team.teamName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inv.role === "admin" ? "default" : "secondary"}>
                            {inv.role === "admin" ? (
                              <><Shield className="h-3 w-3 mr-1" />Admin</>
                            ) : (
                              <>FM</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(inv)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(inv.expiresAt), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isPending && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => copyInviteLink(inv.token)}
                                  title="Copy invite link"
                                >
                                  {copiedToken === inv.token ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => window.open(`/invite/${inv.token}`, "_blank")}
                                  title="Preview invite page"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Revoke invitation"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will invalidate the invitation link for {inv.email}. They won't be able to register.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => revokeMutation.mutate({ id: inv.id })}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Revoke
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {(isExpired || inv.status === "revoked") && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1"
                                  onClick={() => resendMutation.mutate({ id: inv.id })}
                                  disabled={resendMutation.isPending}
                                  title="Resend with new link"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Resend
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Delete invitation"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Invitation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete the invitation record for {inv.email}.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteMutation.mutate({ id: inv.id })}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {inv.status === "accepted" && (
                              <span className="text-sm text-muted-foreground px-2">Completed</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">
                {searchQuery || statusFilter !== "all" ? "No invitations match your filters" : "No invitations yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "all" 
                  ? "Try adjusting your search or filter criteria"
                  : "Create your first invitation to onboard Floor Managers"
                }
              </p>
              {!searchQuery && statusFilter === "all" && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Invitation
                </Button>
              )}
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
  
  // GP Detail Modal state
  const [detailGpId, setDetailGpId] = useState<number | null>(null);
  
  // Bulk selection state
  const [selectedGpIds, setSelectedGpIds] = useState<number[]>([]);
  const [bulkAttitude, setBulkAttitude] = useState<number>(0);

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

  // Stats summary with extended analytics
  const statsSummary = useMemo(() => {
    if (!filteredGPs || filteredGPs.length === 0) return null;
    const withAttitude = filteredGPs.filter((gp: any) => gp.stats?.attitude != null && gp.stats?.attitude !== 0);
    const totalAttitudeSum = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.attitude || 0), 0);
    const totalMistakes = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.mistakes || 0), 0);
    // For cumulative system: count GPs with positive/negative totals
    const positiveAttitude = filteredGPs.filter((gp: any) => (gp.stats?.attitude ?? 0) > 0).length;
    const negativeAttitude = filteredGPs.filter((gp: any) => (gp.stats?.attitude ?? 0) < 0).length;
    const neutralAttitude = filteredGPs.filter((gp: any) => (gp.stats?.attitude ?? 0) === 0).length;
    const totalGames = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.totalGames || 0), 0);
    
    // Sum of all positive and negative attitude points
    const totalPositivePoints = filteredGPs.reduce((sum: number, gp: any) => {
      const att = gp.stats?.attitude ?? 0;
      return sum + (att > 0 ? att : 0);
    }, 0);
    const totalNegativePoints = filteredGPs.reduce((sum: number, gp: any) => {
      const att = gp.stats?.attitude ?? 0;
      return sum + (att < 0 ? Math.abs(att) : 0);
    }, 0);
    
    // Attitude distribution for cumulative system
    const attitudeDistribution = {
      negative: negativeAttitude,
      neutral: neutralAttitude,
      positive: positiveAttitude,
      totalPositivePoints,
      totalNegativePoints
    };
    
    // Top performers by attitude (highest positive totals)
    const topByAttitude = [...filteredGPs]
      .filter((gp: any) => (gp.stats?.attitude ?? 0) > 0)
      .sort((a: any, b: any) => (b.stats?.attitude ?? 0) - (a.stats?.attitude ?? 0))
      .slice(0, 5);
    
    // Negative attitude (needs attention - lowest totals)
    const needsAttention = [...filteredGPs]
      .filter((gp: any) => (gp.stats?.attitude ?? 0) < 0)
      .sort((a: any, b: any) => (a.stats?.attitude ?? 0) - (b.stats?.attitude ?? 0));
    
    // Most mistakes
    const topByMistakes = [...filteredGPs]
      .filter((gp: any) => (gp.stats?.mistakes || 0) > 0)
      .sort((a: any, b: any) => (b.stats?.mistakes || 0) - (a.stats?.mistakes || 0))
      .slice(0, 5);
    
    // Team breakdown
    const teamStats: Record<string, { count: number; positiveCount: number; negativeCount: number; totalMistakes: number }> = {};
    filteredGPs.forEach((gp: any) => {
      const teamName = gp.teamName || 'Unassigned';
      if (!teamStats[teamName]) {
        teamStats[teamName] = { count: 0, positiveCount: 0, negativeCount: 0, totalMistakes: 0 };
      }
      teamStats[teamName].count++;
      teamStats[teamName].totalMistakes += gp.stats?.mistakes || 0;
      // Sum up cumulative attitude values
      const attitudeValue = gp.stats?.attitude ?? 0;
      if (attitudeValue > 0) {
        teamStats[teamName].positiveCount += attitudeValue;
      } else if (attitudeValue < 0) {
        teamStats[teamName].negativeCount += Math.abs(attitudeValue);
      }
    });
    
    return { 
      totalAttitudeSum, 
      totalMistakes, 
      positiveAttitude, 
      negativeAttitude,
      neutralAttitude,
      total: filteredGPs.length,
      totalGames,
      attitudeDistribution,
      topByAttitude,
      needsAttention,
      topByMistakes,
      teamStats,
      withAttitudeCount: withAttitude.length
    };
  }, [filteredGPs]);

  return (
    <TabsContent value="stats" className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            GP Performance Dashboard
          </h2>
          <p className="text-muted-foreground">
            {MONTHS[selectedMonth - 1]} {selectedYear} • Visual analytics for Game Presenters
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isFMView && (
            <Select 
              value={selectedTeamId ? String(selectedTeamId) : "all"} 
              onValueChange={(v) => setSelectedTeamId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-[160px]">
                <Building2 className="h-4 w-4 mr-2" />
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
          )}
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[130px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={String(idx + 1)}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : statsSummary && (
        <>
          {/* Stats Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50 dark:border-blue-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total GPs</p>
                    <p className="text-3xl font-bold">{statsSummary.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {statsSummary.withAttitudeCount} with ratings
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/50 dark:border-green-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Positive (+1)</p>
                    <p className="text-3xl font-bold text-green-600">{statsSummary.positiveAttitude}</p>
                    <p className="text-xs text-muted-foreground mt-1">GPs with positive attitude</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <ThumbsUp className="h-6 w-6 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-gray-500/10 to-gray-600/5 border-gray-200/50 dark:border-gray-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Neutral (0)</p>
                    <p className="text-3xl font-bold text-gray-600">{statsSummary.neutralAttitude}</p>
                    <p className="text-xs text-muted-foreground mt-1">GPs with no rating</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-gray-500/20 flex items-center justify-center">
                    <Star className="h-6 w-6 text-gray-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-200/50 dark:border-red-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Negative (-1)</p>
                    <p className="text-3xl font-bold text-red-600">{statsSummary.negativeAttitude}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {statsSummary.totalMistakes} total mistakes
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                    <ThumbsDown className="h-6 w-6 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50 dark:border-purple-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Games</p>
                    <p className="text-3xl font-bold">{statsSummary.totalGames.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">this month</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Activity className="h-6 w-6 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Attitude Distribution - Simple -1/0/+1 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Attitude Distribution
                </CardTitle>
                <CardDescription>Attitude breakdown for this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Positive */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-28">
                      <ThumbsUp className="h-5 w-5 text-green-500" />
                      <span className="text-sm font-medium">Positive</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-10 bg-muted rounded-lg overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-500 flex items-center justify-end pr-3"
                          style={{ width: `${statsSummary.total > 0 ? Math.max((statsSummary.positiveAttitude / statsSummary.total) * 100, 5) : 5}%` }}
                        >
                          <span className="text-sm font-bold text-white">{statsSummary.positiveAttitude}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Neutral */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-28">
                      <Star className="h-5 w-5 text-gray-400" />
                      <span className="text-sm font-medium">Neutral</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-10 bg-muted rounded-lg overflow-hidden">
                        <div 
                          className="h-full bg-gray-400 transition-all duration-500 flex items-center justify-end pr-3"
                          style={{ width: `${statsSummary.total > 0 ? Math.max((statsSummary.neutralAttitude / statsSummary.total) * 100, 5) : 5}%` }}
                        >
                          <span className="text-sm font-bold text-white">{statsSummary.neutralAttitude}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Negative */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-28">
                      <ThumbsDown className="h-5 w-5 text-red-500" />
                      <span className="text-sm font-medium">Negative</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-10 bg-muted rounded-lg overflow-hidden">
                        <div 
                          className="h-full bg-red-500 transition-all duration-500 flex items-center justify-end pr-3"
                          style={{ width: `${statsSummary.total > 0 ? Math.max((statsSummary.negativeAttitude / statsSummary.total) * 100, 5) : 5}%` }}
                        >
                          <span className="text-sm font-bold text-white">{statsSummary.negativeAttitude}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Positive Attitude & Needs Attention */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Attitude Overview
                </CardTitle>
                <CardDescription>Positive performers and those needing attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* Positive Attitude */}
                  <div>
                    <h4 className="text-sm font-semibold text-green-600 mb-3 flex items-center gap-1">
                      <ThumbsUp className="h-4 w-4" /> Positive Attitude
                    </h4>
                    <div className="space-y-2">
                      {statsSummary.topByAttitude.slice(0, 5).map((gp: any, idx: number) => (
                        <div key={gp.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                          <span className="text-xs font-bold text-green-600 w-5">#{idx + 1}</span>
                          <span className="text-sm truncate flex-1">{gp.name}</span>
                          <Badge className="bg-green-500">+1</Badge>
                        </div>
                      ))}
                      {statsSummary.topByAttitude.length === 0 && (
                        <p className="text-sm text-muted-foreground">No positive ratings</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Negative Attitude / Needs Attention */}
                  <div>
                    <h4 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-1">
                      <ThumbsDown className="h-4 w-4" /> Needs Attention
                    </h4>
                    <div className="space-y-2">
                      {statsSummary.needsAttention?.slice(0, 5).map((gp: any, idx: number) => (
                        <div key={gp.id} className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30">
                          <span className="text-xs font-bold text-red-600 w-5">#{idx + 1}</span>
                          <span className="text-sm truncate flex-1">{gp.name}</span>
                          <Badge variant="destructive">-1</Badge>
                        </div>
                      ))}
                      {(!statsSummary.needsAttention || statsSummary.needsAttention.length === 0) && (
                        <p className="text-sm text-muted-foreground">No negative ratings</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Team Breakdown */}
          {Object.keys(statsSummary.teamStats).length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Team Comparison
                </CardTitle>
                <CardDescription>Performance breakdown by team</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(statsSummary.teamStats).map(([teamName, stats]: [string, any]) => (
                    <div key={teamName} className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
                      <h4 className="font-semibold truncate mb-3">{teamName}</h4>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-xl font-bold text-blue-600">{stats.count}</p>
                          <p className="text-xs text-muted-foreground">GPs</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-green-600">{stats.positiveCount}</p>
                          <p className="text-xs text-muted-foreground">+1</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-red-600">{stats.negativeCount}</p>
                          <p className="text-xs text-muted-foreground">-1</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-orange-600">{stats.totalMistakes}</p>
                          <p className="text-xs text-muted-foreground">Errors</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* GP Cards Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Game Presenters
              </CardTitle>
              <CardDescription>
                Click on attitude buttons to update ratings
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions */}
          {selectedGpIds.length > 0 && (
            <div className="flex items-center gap-4 p-4 mb-4 bg-primary/5 border border-primary/20 rounded-lg">
              <Badge variant="secondary" className="text-sm">
                {selectedGpIds.length} selected
              </Badge>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Set Attitude:</Label>
                <Select value={String(bulkAttitude)} onValueChange={(v) => setBulkAttitude(Number(v))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">-1 (Negative)</SelectItem>
                    <SelectItem value="0">0 (Neutral)</SelectItem>
                    <SelectItem value="1">+1 (Positive)</SelectItem>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredGPs.map((gp: any) => {
                const attitude = gp.stats?.attitude;
                const mistakes = gp.stats?.mistakes || 0;
                const totalGames = gp.stats?.totalGames || 0;
                const teamName = teams.find(t => t.id === gp.teamId)?.teamName || 'Unassigned';
                
                // Border color based on cumulative attitude
                const getBorderColor = () => {
                  const value = attitude ?? 0;
                  if (value > 0) return 'border-green-400';
                  if (value < 0) return 'border-red-400';
                  return 'border-muted';
                };
                
                // Get attitude display for cumulative values
                const getAttitudeDisplay = () => {
                  const value = attitude ?? 0;
                  if (value > 0) return { icon: <ThumbsUp className="h-5 w-5" />, label: `+${value}`, color: 'text-green-600 bg-green-100 dark:bg-green-950' };
                  if (value < 0) return { icon: <ThumbsDown className="h-5 w-5" />, label: `${value}`, color: 'text-red-600 bg-red-100 dark:bg-red-950' };
                  return { icon: null, label: '0', color: 'text-gray-500 bg-gray-100 dark:bg-gray-800' };
                };
                const attitudeDisplay = getAttitudeDisplay();

                return (
                  <div 
                    key={gp.id} 
                    className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer ${getBorderColor()} ${selectedGpIds.includes(gp.id) ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setDetailGpId(gp.id)}
                  >
                    {/* Header with checkbox */}
                    <div className="flex items-start justify-between p-4 pb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-base truncate">{gp.name}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{teamName}</p>
                      </div>
                      <Checkbox 
                        checked={selectedGpIds.includes(gp.id)}
                        onCheckedChange={() => toggleGpSelection(gp.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                    </div>
                    
                    {/* Attitude Section */}
                    <div className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Attitude</span>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-semibold ${attitudeDisplay.color}`}>
                          {attitudeDisplay.icon}
                          <span>{attitudeDisplay.label}</span>
                        </div>
                      </div>
                      <QuickAttitudeButtons
                        gpId={gp.id}
                        currentAttitude={attitude ?? null}
                        currentMistakes={mistakes}
                        selectedMonth={selectedMonth}
                        selectedYear={selectedYear}
                        onUpdate={refetch}
                      />
                    </div>
                    
                    {/* Stats Footer */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50 dark:bg-gray-800/30 border-t">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className={`h-4 w-4 ${mistakes > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className={`text-sm font-medium ${mistakes > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {mistakes}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-4 w-4 text-blue-500" />
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            {totalGames.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); startEditing(gp); }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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

      {/* GP Detail Modal */}
      <GPDetailModal
        gpId={detailGpId}
        month={selectedMonth}
        year={selectedYear}
        onClose={() => setDetailGpId(null)}
      />
    </TabsContent>
  );
}

// GP Detail Modal Component
function GPDetailModal({
  gpId,
  month,
  year,
  onClose,
}: {
  gpId: number | null;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.gamePresenter.getDetails.useQuery(
    { gpId: gpId!, month, year },
    { enabled: !!gpId }
  );

  const [activeTab, setActiveTab] = useState<'evaluations' | 'errors' | 'attitude'>('evaluations');

  if (!gpId) return null;

  return (
    <Dialog open={!!gpId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <span className="text-xl">{data.gp.name}</span>
                  <p className="text-sm font-normal text-muted-foreground">{data.gp.teamName}</p>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4 py-4">
              <div className="text-center p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30">
                <p className="text-2xl font-bold text-blue-600">{data.evaluations.length}</p>
                <p className="text-sm text-muted-foreground">Evaluations</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${(data.stats.attitude ?? 0) > 0 ? 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30' : (data.stats.attitude ?? 0) < 0 ? 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/30' : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950/50 dark:to-gray-900/30'}`}>
                <p className={`text-2xl font-bold ${(data.stats.attitude ?? 0) > 0 ? 'text-green-600' : (data.stats.attitude ?? 0) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {(data.stats.attitude ?? 0) > 0 ? '+' : ''}{data.stats.attitude ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Attitude</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${(data.stats.mistakes ?? 0) > 0 ? 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/30' : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950/50 dark:to-gray-900/30'}`}>
                <p className={`text-2xl font-bold ${(data.stats.mistakes ?? 0) > 0 ? 'text-red-600' : 'text-gray-600'}`}>{data.stats.mistakes ?? 0}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b pb-2">
              <Button
                variant={activeTab === 'evaluations' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('evaluations')}
              >
                <Star className="h-4 w-4 mr-2" />
                Evaluations ({data.evaluations.length})
              </Button>
              <Button
                variant={activeTab === 'errors' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('errors')}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Errors ({data.errors.length})
              </Button>
              <Button
                variant={activeTab === 'attitude' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('attitude')}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Attitude ({data.attitudeScreenshots.length})
              </Button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {activeTab === 'evaluations' && (
                <div className="space-y-3 py-4">
                  {data.evaluations.length > 0 ? (
                    data.evaluations.map((evaluation) => (
                      <div key={evaluation.id} className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(evaluation.date), 'MMM dd, yyyy')}
                          </span>
                          <Badge variant="secondary">
                            Total: {evaluation.totalScore}/24
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Appearance:</span>
                            <span className="ml-2 font-medium">{evaluation.appearanceScore}/12</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Game Performance:</span>
                            <span className="ml-2 font-medium">{evaluation.gamePerformanceScore}/10</span>
                          </div>
                        </div>
                        {evaluation.comments && (
                          <p className="mt-2 text-sm text-muted-foreground italic">"{evaluation.comments}"</p>
                        )}
                        {evaluation.evaluatedBy && (
                          <p className="mt-1 text-xs text-muted-foreground">Evaluated by: {evaluation.evaluatedBy}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No evaluations for this month</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'errors' && (
                <div className="space-y-3 py-4">
                  {data.errors.length > 0 ? (
                    data.errors.map((error) => (
                      <div key={error.id} className="p-4 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                              Excel
                            </Badge>
                            {error.errorCode && (
                              <Badge variant="secondary">{error.errorCode}</Badge>
                            )}
                          </div>
                          {error.date && (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(error.date), 'MMM dd, yyyy')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{error.description || 'No description'}</p>
                        {(error.gameType || error.tableId) && (
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            {error.gameType && <span>Game: {error.gameType}</span>}
                            {error.tableId && <span>Table: {error.tableId}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No errors recorded for this month</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'attitude' && (
                <div className="space-y-3 py-4">
                  {data.attitudeScreenshots.length > 0 ? (
                    data.attitudeScreenshots.map((screenshot) => (
                      <div key={screenshot.id} className="p-4 rounded-lg border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline">Screenshot</Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(screenshot.createdAt), 'MMM dd, yyyy HH:mm')}
                          </span>
                        </div>
                        {screenshot.extractedData && (
                          <div className="mt-2 p-3 rounded bg-muted/50">
                            <p className="text-sm whitespace-pre-wrap">{screenshot.extractedData}</p>
                          </div>
                        )}
                        {screenshot.url && (
                          <a
                            href={screenshot.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Screenshot
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <ThumbsUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No attitude screenshots for this month</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Failed to load GP details</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Quick Attitude Buttons Component - Cumulative system: each click adds/subtracts from total
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
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation();

  // Add to current attitude (cumulative)
  const handleAddAttitude = async (delta: number) => {
    const action = delta > 0 ? 'add' : 'subtract';
    setIsUpdating(action);
    try {
      const newAttitude = (currentAttitude ?? 0) + delta;
      await updateStatsMutation.mutateAsync({
        gpId,
        month: selectedMonth,
        year: selectedYear,
        attitude: newAttitude,
        mistakes: currentMistakes,
      });
      const label = delta > 0 ? '+1 added' : '-1 added';
      toast.success(`Attitude: ${label} (Total: ${newAttitude >= 0 ? '+' : ''}${newAttitude})`);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    } finally {
      setIsUpdating(null);
    }
  };

  // Reset attitude to 0
  const handleReset = async () => {
    setIsUpdating('reset');
    try {
      await updateStatsMutation.mutateAsync({
        gpId,
        month: selectedMonth,
        year: selectedYear,
        attitude: 0,
        mistakes: currentMistakes,
      });
      toast.success('Attitude reset to 0');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to reset");
    } finally {
      setIsUpdating(null);
    }
  };

  const attitudeValue = currentAttitude ?? 0;
  const attitudeColor = attitudeValue > 0 ? 'text-green-600' : attitudeValue < 0 ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="flex items-center justify-center gap-1">
      {/* Subtract button */}
      <Button
        size="sm"
        variant="ghost"
        className="px-2 h-8 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
        onClick={() => handleAddAttitude(-1)}
        disabled={isUpdating !== null}
        title="Add -1 to attitude"
      >
        {isUpdating === 'subtract' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ThumbsDown className="h-4 w-4" />
        )}
      </Button>
      
      {/* Current value display with reset on click */}
      <Button
        size="sm"
        variant="ghost"
        className={`px-3 h-8 min-w-[50px] font-bold ${attitudeColor} hover:bg-gray-100 dark:hover:bg-gray-800`}
        onClick={handleReset}
        disabled={isUpdating !== null}
        title="Click to reset to 0"
      >
        {isUpdating === 'reset' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span>{attitudeValue >= 0 ? '+' : ''}{attitudeValue}</span>
        )}
      </Button>
      
      {/* Add button */}
      <Button
        size="sm"
        variant="ghost"
        className="px-2 h-8 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
        onClick={() => handleAddAttitude(1)}
        disabled={isUpdating !== null}
        title="Add +1 to attitude"
      >
        {isUpdating === 'add' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ThumbsUp className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

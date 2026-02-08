import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  UserPlus, Mail, Building2, Shield, Clock, CheckCircle2, 
  XCircle, AlertTriangle, Loader2, Sparkles, ArrowRight
} from "lucide-react";
import { format } from "date-fns";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);

  // Validate invitation token
  const { data: validation, isLoading: validationLoading, error } = trpc.invitation.validate.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  // Accept invitation mutation
  const acceptMutation = trpc.invitation.accept.useMutation({
    onSuccess: () => {
      toast.success("Welcome! Your account has been set up successfully.");
      // Redirect to dashboard
      setTimeout(() => {
        setLocation("/dashboard");
      }, 1500);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to accept invitation");
      setIsAccepting(false);
    },
  });

  // Auto-accept invitation if user is logged in and invitation is valid
  useEffect(() => {
    if (user && validation?.valid && !isAccepting && !acceptMutation.isPending && !acceptMutation.isSuccess) {
      setIsAccepting(true);
      acceptMutation.mutate({ token: token || "" });
    }
  }, [user, validation, token, isAccepting, acceptMutation]);

  // Loading state
  if (validationLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-12 w-12 rounded-full mx-auto" />
              <Skeleton className="h-6 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired invitation
  if (!validation?.valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200 dark:border-red-900">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl">Invalid Invitation</CardTitle>
            <CardDescription className="text-base">
              {validation?.reason || "This invitation link is not valid."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-red-500/10 rounded-lg p-4 text-center border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-400">
                Please contact your administrator to request a new invitation link.
              </p>
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setLocation("/")}
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Accepting invitation (user is logged in)
  if (user && (isAccepting || acceptMutation.isPending)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto animate-pulse">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold">Setting up your account...</h2>
              <p className="text-muted-foreground">
                Please wait while we configure your access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (acceptMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-green-200 dark:border-green-900">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold">Welcome aboard!</h2>
              <p className="text-muted-foreground">
                Your account has been set up successfully. Redirecting to dashboard...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid invitation - show details and login button
  const invitation = validation.invitation!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">GP Report Generator</h1>
              <p className="text-blue-100 text-sm">You've been invited!</p>
            </div>
          </div>
        </div>

        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Join as Floor Manager
          </CardTitle>
          <CardDescription>
            You've been invited to join the GP Report Generator system.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{invitation.email}</p>
              </div>
            </div>

            {invitation.teamName && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Assigned Team</p>
                  <p className="font-medium">{invitation.teamName}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <Badge variant={invitation.role === "admin" ? "default" : "secondary"}>
                  {invitation.role === "admin" ? "Administrator" : "Floor Manager"}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-[#d4af37]/10 border border-[#d4af37]/20 rounded-lg">
              <Clock className="h-5 w-5 text-[#d4af37]" />
              <div>
                <p className="text-xs text-[#d4af37]">Expires</p>
                <p className="font-medium text-[#d4af37]">
                  {format(new Date(invitation.expiresAt), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
          </div>

          {/* Login Button */}
          <Button 
            className="w-full h-12 text-base gap-2 bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#b8860b] hover:to-[#8b6914]"
            onClick={() => {
              // Store invitation token in sessionStorage for after login
              sessionStorage.setItem("pendingInviteToken", token || "");
              window.location.href = getLoginUrl();
            }}
          >
            Continue with Manus Account
            <ArrowRight className="h-5 w-5" />
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to join the GP Report Generator system with the role and team specified above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

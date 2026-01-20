import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { 
  Upload, BarChart3, FileSpreadsheet, Zap, Image, ArrowRight, 
  CheckCircle2, Shield, Clock, Users, Sparkles, TrendingUp,
  FileCheck, Star, ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">GP Report Generator</span>
          </div>
          <nav className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm">Dashboard</Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    Upload Evaluations
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                  Sign In
                </Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl" />
            <div className="absolute top-40 right-20 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl" />
            <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-purple-400/10 rounded-full blur-3xl" />
          </div>
          
          <div className="container py-20 md:py-28">
            <div className="text-center max-w-4xl mx-auto">
              <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                AI-Powered Evaluation System
              </Badge>
              
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl mb-6">
                Automate Your
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"> GP Evaluations</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                Upload evaluation screenshots, let AI extract the data, and generate
                professional Team Monthly Overview reports in seconds.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isAuthenticated ? (
                  <>
                    <Link href="/upload">
                      <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25">
                        <Upload className="mr-2 h-5 w-5" />
                        Start Uploading
                      </Button>
                    </Link>
                    <Link href="/dashboard">
                      <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-base border-2">
                        View Dashboard
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  </>
                ) : (
                  <a href={getLoginUrl()}>
                    <Button size="lg" className="h-12 px-8 text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                )}
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>AI-Powered OCR</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  <span>Secure & Private</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span>Save Hours Weekly</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="container py-20">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">Simple Process</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Three simple steps to transform your evaluation workflow
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <Card className="relative group hover:shadow-lg transition-all duration-300 border-2 hover:border-blue-200 dark:hover:border-blue-800">
              <div className="absolute -top-4 left-6">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                  1
                </div>
              </div>
              <CardHeader className="pt-8">
                <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="h-7 w-7 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Upload Screenshots</CardTitle>
                <CardDescription className="text-base">
                  Drag and drop your Game Presenter evaluation screenshots. 
                  Upload multiple files at once for batch processing.
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="relative group hover:shadow-lg transition-all duration-300 border-2 hover:border-amber-200 dark:hover:border-amber-800">
              <div className="absolute -top-4 left-6">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                  2
                </div>
              </div>
              <CardHeader className="pt-8">
                <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Zap className="h-7 w-7 text-amber-600" />
                </div>
                <CardTitle className="text-xl">AI Extraction</CardTitle>
                <CardDescription className="text-base">
                  Our AI automatically reads and extracts all evaluation data including
                  scores, comments, presenter names, and dates.
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="relative group hover:shadow-lg transition-all duration-300 border-2 hover:border-green-200 dark:hover:border-green-800">
              <div className="absolute -top-4 left-6">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                  3
                </div>
              </div>
              <CardHeader className="pt-8">
                <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="h-7 w-7 text-green-600" />
                </div>
                <CardTitle className="text-xl">Generate Reports</CardTitle>
                <CardDescription className="text-base">
                  Create professional Team Monthly Overview reports with aggregated
                  statistics and export them to Excel format.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-white/50 dark:bg-gray-800/50 py-20">
          <div className="container">
            <div className="text-center mb-14">
              <Badge variant="outline" className="mb-4">Features</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Powerful features designed to streamline your evaluation workflow
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <div className="flex gap-4 p-5 rounded-xl bg-white dark:bg-gray-900 border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Image className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Batch Upload</h3>
                  <p className="text-muted-foreground text-sm">
                    Upload multiple screenshots at once with drag-and-drop
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 p-5 rounded-xl bg-white dark:bg-gray-900 border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <Sparkles className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">AI-Powered OCR</h3>
                  <p className="text-muted-foreground text-sm">
                    Automatically extract names, scores, and comments
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 p-5 rounded-xl bg-white dark:bg-gray-900 border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Monthly Statistics</h3>
                  <p className="text-muted-foreground text-sm">
                    View aggregated metrics and performance trends
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 p-5 rounded-xl bg-white dark:bg-gray-900 border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <FileCheck className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Excel Export</h3>
                  <p className="text-muted-foreground text-sm">
                    Generate reports matching your template structure
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 p-5 rounded-xl bg-white dark:bg-gray-900 border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                  <Users className="h-6 w-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Team Management</h3>
                  <p className="text-muted-foreground text-sm">
                    Organize GPs by teams with role-based access
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 p-5 rounded-xl bg-white dark:bg-gray-900 border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Star className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">GP Portal</h3>
                  <p className="text-muted-foreground text-sm">
                    Unique links for GPs to view their evaluations
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        {!isAuthenticated && (
          <section className="container py-20">
            <Card className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-0">
              <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -ml-32 -mb-32" />
              
              <CardContent className="relative py-16 text-center">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
                <p className="text-white/80 mb-8 max-w-xl mx-auto text-lg">
                  Sign in to start uploading evaluation screenshots and generating reports automatically.
                </p>
                <a href={getLoginUrl()}>
                  <Button size="lg" variant="secondary" className="h-12 px-8 text-base shadow-lg">
                    Sign In Now
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/50 dark:bg-gray-900/50 py-8">
        <div className="container text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <FileSpreadsheet className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">GP Report Generator</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Streamline your Game Presenter evaluations
          </p>
        </div>
      </footer>
    </div>
  );
}

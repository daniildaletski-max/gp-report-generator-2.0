import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { 
  Upload, BarChart3, FileSpreadsheet, Zap, Image, ArrowRight, 
  CheckCircle2, Shield, Clock, Users, Sparkles, TrendingUp,
  FileCheck, Star, ChevronRight, Play
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "GP Report Generator - AI-Powered Evaluation Automation Tool";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh">
      {/* Floating background shapes */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="floating-shape w-[500px] h-[500px] bg-primary/20 top-[-10%] left-[-5%]" style={{ animationDelay: '0s' }} />
        <div className="floating-shape w-[400px] h-[400px] bg-purple-500/15 top-[20%] right-[-5%]" style={{ animationDelay: '-5s' }} />
        <div className="floating-shape w-[350px] h-[350px] bg-cyan-500/15 bottom-[10%] left-[20%]" style={{ animationDelay: '-10s' }} />
        <div className="floating-shape w-[300px] h-[300px] bg-amber-500/10 bottom-[-5%] right-[15%]" style={{ animationDelay: '-15s' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-strong">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg glow-primary">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">GP Report Generator</span>
          </div>
          <nav className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="glass-button rounded-xl">Dashboard</Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 shadow-lg glow-primary">
                    Upload Evaluations
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 shadow-lg glow-primary">
                  Sign In
                </Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="container">
            <div className="text-center max-w-4xl mx-auto">
              <Badge className="mb-6 px-4 py-2 text-sm glass-card border-primary/20 text-foreground">
                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                AI-Powered Evaluation System
              </Badge>
              
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl mb-6">
                Automate Your
                <span className="gradient-text block sm:inline"> GP Evaluations</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                Upload evaluation screenshots, let AI extract the data, and generate
                professional Team Monthly Overview reports in seconds.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isAuthenticated ? (
                  <>
                    <Link href="/upload">
                      <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 shadow-xl glow-primary btn-press">
                        <Upload className="mr-2 h-5 w-5" />
                        Start Uploading
                      </Button>
                    </Link>
                    <Link href="/dashboard">
                      <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl glass-button border-2 btn-press">
                        View Dashboard
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  </>
                ) : (
                  <a href={getLoginUrl()}>
                    <Button size="lg" className="h-14 px-10 text-base rounded-2xl bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 shadow-xl glow-primary btn-press">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                )}
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center justify-center gap-8 mt-14">
                <div className="flex items-center gap-2 glass-subtle px-4 py-2 rounded-full">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium">AI-Powered OCR</span>
                </div>
                <div className="flex items-center gap-2 glass-subtle px-4 py-2 rounded-full">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Secure & Private</span>
                </div>
                <div className="flex items-center gap-2 glass-subtle px-4 py-2 rounded-full">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <span className="text-sm font-medium">Save Hours Weekly</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="container py-20">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 glass-subtle">Simple Process</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Three simple steps to transform your evaluation workflow
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 stagger-children">
            <div className="glass-card p-8 group">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  1
                </div>
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">Upload Screenshots</h3>
              <p className="text-muted-foreground">
                Drag and drop your Game Presenter evaluation screenshots. 
                Upload multiple files at once for batch processing.
              </p>
            </div>
            
            <div className="glass-card p-8 group">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  2
                </div>
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Zap className="h-7 w-7 text-amber-500" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">AI Extraction</h3>
              <p className="text-muted-foreground">
                Our AI automatically reads and extracts all evaluation data including
                scores, comments, presenter names, and dates.
              </p>
            </div>
            
            <div className="glass-card p-8 group">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  3
                </div>
                <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="h-7 w-7 text-green-500" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">Generate Reports</h3>
              <p className="text-muted-foreground">
                Create professional Team Monthly Overview reports with aggregated
                statistics and export them to Excel format.
              </p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20">
          <div className="container">
            <div className="text-center mb-16">
              <Badge variant="outline" className="mb-4 glass-subtle">Features</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful Features</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Everything you need to streamline your evaluation workflow
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto stagger-children">
              <div className="glass-card p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shrink-0">
                  <Image className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Batch Upload</h3>
                  <p className="text-muted-foreground text-sm">
                    Upload multiple screenshots at once with drag-and-drop
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
                  <Sparkles className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">AI-Powered OCR</h3>
                  <p className="text-muted-foreground text-sm">
                    Automatically extract names, scores, and comments
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Monthly Statistics</h3>
                  <p className="text-muted-foreground text-sm">
                    View aggregated metrics and performance trends
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center shrink-0">
                  <FileCheck className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Excel Export</h3>
                  <p className="text-muted-foreground text-sm">
                    Generate reports matching your template structure
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
                  <Users className="h-6 w-6 text-rose-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Team Management</h3>
                  <p className="text-muted-foreground text-sm">
                    Organize GPs by teams with role-based access
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
                  <Star className="h-6 w-6 text-cyan-500" />
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
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-purple-600 to-pink-600 text-white p-1">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIgMS44LTQgNC00czQgMS44IDQgNC0xLjggNC00IDQtNC0xLjgtNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
              <div className="relative glass rounded-[22px] py-16 px-8 text-center">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Automate Your GP Evaluations?</h2>
                <p className="text-white/80 mb-8 max-w-xl mx-auto text-lg">
                  Sign in to start uploading evaluation screenshots and generating reports automatically.
                </p>
                <a href={getLoginUrl()}>
                  <Button size="lg" className="h-14 px-10 text-base rounded-2xl bg-white text-primary hover:bg-white/90 shadow-xl btn-press">
                    Sign In Now
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="glass-subtle border-t py-8 mt-10">
        <div className="container text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
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

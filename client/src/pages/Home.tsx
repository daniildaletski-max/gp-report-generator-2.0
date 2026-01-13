import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Upload, BarChart3, FileSpreadsheet, Zap, Image, ArrowRight } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">GP Report Generator</span>
          </div>
          <nav className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost">Dashboard</Button>
                </Link>
                <Link href="/upload">
                  <Button>Upload Evaluations</Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Sign In</Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="container py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl mb-6">
            Automate Your
            <span className="text-primary"> GP Evaluations</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Upload evaluation screenshots, let AI extract the data, and generate
            professional Team Monthly Overview reports in seconds.
          </p>
          <div className="flex gap-4 justify-center">
            {isAuthenticated ? (
              <>
                <Link href="/upload">
                  <Button size="lg">
                    <Upload className="mr-2 h-5 w-5" />
                    Start Uploading
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button size="lg" variant="outline">
                    View Dashboard
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="lg">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
            )}
          </div>
        </section>

        <section className="container py-16">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>1. Upload Screenshots</CardTitle>
                <CardDescription>
                  Drag and drop your Game Presenter evaluation screenshots. 
                  Upload multiple files at once for batch processing.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>2. AI Extraction</CardTitle>
                <CardDescription>
                  Our AI automatically reads and extracts all evaluation data including
                  scores, comments, presenter names, and dates.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>3. Generate Reports</CardTitle>
                <CardDescription>
                  Create professional Team Monthly Overview reports with aggregated
                  statistics and export them to Excel format.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="container py-16">
          <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="flex gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Batch Upload</h3>
                <p className="text-muted-foreground text-sm">
                  Upload multiple evaluation screenshots at once with drag-and-drop support
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">AI-Powered OCR</h3>
                <p className="text-muted-foreground text-sm">
                  Automatically extract presenter names, scores, and comments from images
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Monthly Statistics</h3>
                <p className="text-muted-foreground text-sm">
                  View aggregated performance metrics and trends for each Game Presenter
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Excel Export</h3>
                <p className="text-muted-foreground text-sm">
                  Generate professional reports matching your existing template structure
                </p>
              </div>
            </div>
          </div>
        </section>

        {!isAuthenticated && (
          <section className="container py-16">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="py-12 text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
                <p className="text-primary-foreground/80 mb-6 max-w-xl mx-auto">
                  Sign in to start uploading evaluation screenshots and generating reports automatically.
                </p>
                <a href={getLoginUrl()}>
                  <Button size="lg" variant="secondary">
                    Sign In Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </section>
        )}
      </main>

      <footer className="border-t py-8 mt-16">
        <div className="container text-center text-sm text-muted-foreground">
          <p>GP Report Generator - Streamline your Game Presenter evaluations</p>
        </div>
      </footer>
    </div>
  );
}

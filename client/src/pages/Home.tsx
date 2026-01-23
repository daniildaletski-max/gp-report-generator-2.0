import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { 
  Upload, BarChart3, FileSpreadsheet, Zap, Image, ArrowRight, 
  CheckCircle2, Shield, Clock, Sparkles
} from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "GP Report Generator - AI-Powered Evaluation Automation Tool";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-[#67B2E7] border-t-transparent animate-spin" />
          <p className="text-[#9DCDEE]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card-subtle border-b border-[rgba(100,120,200,0.2)]">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#323D9A] to-[#5B62B2] flex items-center justify-center shadow-lg glow-purple">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-[#E4F4FC]">GP Report Generator</span>
          </div>
          <nav className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="text-[#9DCDEE] hover:text-[#E4F4FC] hover:bg-[rgba(103,178,231,0.1)]">
                    Dashboard
                  </Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="rounded-lg bg-gradient-to-r from-[#323D9A] to-[#5B62B2] hover:opacity-90 text-white border-0">
                    Upload Evaluations
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="rounded-lg bg-gradient-to-r from-[#323D9A] to-[#5B62B2] hover:opacity-90 text-white border-0">
                  Sign In
                </Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden py-24 md:py-36">
          {/* Background glow effects */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-[#323D9A] rounded-full blur-[150px] opacity-20" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#67B2E7] rounded-full blur-[150px] opacity-15" />
          </div>

          <div className="container">
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full glass-card-subtle text-sm">
                <Sparkles className="h-4 w-4 text-[#67B2E7]" />
                <span className="text-[#9DCDEE]">AI-Powered Evaluation System</span>
              </div>
              
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl mb-6 text-[#E4F4FC]">
                Automate Your
                <span className="block gradient-text">GP Evaluations</span>
              </h1>
              
              <p className="text-lg md:text-xl text-[#94A2D6] max-w-2xl mx-auto mb-12">
                Upload evaluation screenshots, let AI extract the data, and generate
                professional Team Monthly Overview reports in seconds.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isAuthenticated ? (
                  <>
                    <Link href="/upload">
                      <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-xl bg-gradient-to-r from-[#323D9A] to-[#5B62B2] hover:opacity-90 text-white border-0 shadow-lg glow-purple">
                        <Upload className="mr-2 h-5 w-5" />
                        Start Uploading
                      </Button>
                    </Link>
                    <Link href="/dashboard">
                      <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base rounded-xl glass-button text-[#E4F4FC]">
                        View Dashboard
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  </>
                ) : (
                  <a href={getLoginUrl()}>
                    <Button size="lg" className="h-14 px-10 text-base rounded-xl bg-gradient-to-r from-[#323D9A] to-[#5B62B2] hover:opacity-90 text-white border-0 shadow-lg glow-purple">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                )}
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center justify-center gap-6 mt-16">
                <div className="flex items-center gap-2 glass-card-subtle px-4 py-2 rounded-full">
                  <CheckCircle2 className="h-5 w-5 text-[#4ade80]" />
                  <span className="text-sm text-[#9DCDEE]">AI-Powered OCR</span>
                </div>
                <div className="flex items-center gap-2 glass-card-subtle px-4 py-2 rounded-full">
                  <Shield className="h-5 w-5 text-[#67B2E7]" />
                  <span className="text-sm text-[#9DCDEE]">Secure & Private</span>
                </div>
                <div className="flex items-center gap-2 glass-card-subtle px-4 py-2 rounded-full">
                  <Clock className="h-5 w-5 text-[#fbbf24]" />
                  <span className="text-sm text-[#9DCDEE]">Save Hours Weekly</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="container py-24">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full glass-card-subtle text-xs uppercase tracking-wider text-[#9DCDEE]">
              Simple Process
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#E4F4FC]">How It Works</h2>
            <p className="text-[#94A2D6] max-w-2xl mx-auto">
              Three simple steps to transform your evaluation workflow
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <div className="glass-card p-8 hover-lift">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#323D9A] to-[#5B62B2] flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  1
                </div>
                <div className="w-14 h-14 rounded-xl bg-[rgba(103,178,231,0.1)] flex items-center justify-center">
                  <Upload className="h-7 w-7 text-[#67B2E7]" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-[#E4F4FC]">Upload Screenshots</h3>
              <p className="text-[#94A2D6]">
                Drag and drop your Game Presenter evaluation screenshots. 
                Upload multiple files at once for batch processing.
              </p>
            </div>
            
            <div className="glass-card p-8 hover-lift">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#f97316] flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  2
                </div>
                <div className="w-14 h-14 rounded-xl bg-[rgba(245,158,11,0.1)] flex items-center justify-center">
                  <Zap className="h-7 w-7 text-[#fbbf24]" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-[#E4F4FC]">AI Extraction</h3>
              <p className="text-[#94A2D6]">
                Our AI automatically reads and extracts all evaluation data including
                scores, comments, presenter names, and dates.
              </p>
            </div>
            
            <div className="glass-card p-8 hover-lift">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#22c55e] to-[#10b981] flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  3
                </div>
                <div className="w-14 h-14 rounded-xl bg-[rgba(34,197,94,0.1)] flex items-center justify-center">
                  <FileSpreadsheet className="h-7 w-7 text-[#4ade80]" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-[#E4F4FC]">Generate Reports</h3>
              <p className="text-[#94A2D6]">
                Create professional Team Monthly Overview reports with aggregated
                statistics and export them to Excel format.
              </p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24">
          <div className="container">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full glass-card-subtle text-xs uppercase tracking-wider text-[#9DCDEE]">
                Features
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#E4F4FC]">Powerful Features</h2>
              <p className="text-[#94A2D6] max-w-2xl mx-auto">
                Everything you need to streamline your evaluation workflow
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              <div className="glass-card p-6 flex gap-4 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-[rgba(103,178,231,0.15)] flex items-center justify-center shrink-0">
                  <Image className="h-6 w-6 text-[#67B2E7]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-[#E4F4FC]">Batch Upload</h3>
                  <p className="text-[#94A2D6] text-sm">
                    Upload multiple screenshots at once with drag-and-drop
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-[rgba(91,98,178,0.15)] flex items-center justify-center shrink-0">
                  <Sparkles className="h-6 w-6 text-[#94A2D6]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-[#E4F4FC]">AI-Powered OCR</h3>
                  <p className="text-[#94A2D6] text-sm">
                    Automatically extract names, scores, and comments
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-[rgba(34,197,94,0.15)] flex items-center justify-center shrink-0">
                  <BarChart3 className="h-6 w-6 text-[#4ade80]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-[#E4F4FC]">Analytics Dashboard</h3>
                  <p className="text-[#94A2D6] text-sm">
                    Track team performance with visual charts
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-[rgba(245,158,11,0.15)] flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-6 w-6 text-[#fbbf24]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-[#E4F4FC]">Excel Export</h3>
                  <p className="text-[#94A2D6] text-sm">
                    Export reports in professional Excel format
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-[rgba(239,68,68,0.15)] flex items-center justify-center shrink-0">
                  <Shield className="h-6 w-6 text-[#f87171]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-[#E4F4FC]">Secure Storage</h3>
                  <p className="text-[#94A2D6] text-sm">
                    Your data is encrypted and securely stored
                  </p>
                </div>
              </div>
              
              <div className="glass-card p-6 flex gap-4 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-[rgba(168,85,247,0.15)] flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-[#a855f7]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-[#E4F4FC]">Time Saving</h3>
                  <p className="text-[#94A2D6] text-sm">
                    Reduce report creation time by 90%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24">
          <div className="container">
            <div className="glass-card-strong p-12 md:p-16 text-center max-w-4xl mx-auto glow-purple">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#E4F4FC]">
                Ready to Streamline Your Workflow?
              </h2>
              <p className="text-[#94A2D6] text-lg mb-8 max-w-xl mx-auto">
                Join Floor Managers who save hours every week with automated evaluation processing.
              </p>
              {isAuthenticated ? (
                <Link href="/upload">
                  <Button size="lg" className="h-14 px-10 text-base rounded-xl bg-gradient-to-r from-[#323D9A] to-[#5B62B2] hover:opacity-90 text-white border-0 shadow-lg">
                    Start Uploading Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="h-14 px-10 text-base rounded-xl bg-gradient-to-r from-[#323D9A] to-[#5B62B2] hover:opacity-90 text-white border-0 shadow-lg">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="glass-card-subtle border-t border-[rgba(100,120,200,0.2)] py-8">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#323D9A] to-[#5B62B2] flex items-center justify-center">
                <FileSpreadsheet className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-[#E4F4FC]">GP Report Generator</span>
            </div>
            <p className="text-sm text-[#94A2D6]">
              © 2026 GP Report Generator. Built for Floor Managers.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

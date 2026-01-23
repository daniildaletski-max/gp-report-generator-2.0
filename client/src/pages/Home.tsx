import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { ArrowRight, Zap, BarChart3, FileText, Upload, Shield, Clock } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "GP Report Generator - AI-Powered Evaluation Automation";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d14] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-[#64d2ff]/20 border-t-[#64d2ff] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0d0d14]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#64d2ff] to-[#5ac8fa] flex items-center justify-center">
              <Zap className="h-4 w-4 text-[#0d0d14]" />
            </div>
            <span className="font-semibold text-white/90 tracking-tight">GP Report</span>
          </div>
          
          <nav className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="text-white/50 hover:text-white hover:bg-white/[0.04] rounded-lg">
                    Dashboard
                  </Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="bg-[#64d2ff] text-[#0d0d14] hover:bg-[#5ac8fa] rounded-lg px-4 font-medium">
                    Upload
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="bg-[#64d2ff] text-[#0d0d14] hover:bg-[#5ac8fa] rounded-lg px-4 font-medium">
                  Sign In
                </Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="min-h-[85vh] flex items-center justify-center px-6 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#64d2ff]/[0.04] rounded-full blur-[120px]" />
          
          <div className="max-w-3xl mx-auto text-center relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
              <span className="text-xs text-white/50 font-medium">AI-Powered Automation</span>
            </div>

            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
              <span className="text-white">Streamline your</span>
              <br />
              <span className="gradient-text-cyan">GP evaluations</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-white/40 max-w-lg mx-auto mb-10 leading-relaxed">
              Upload screenshots, extract data with AI, and generate professional reports in seconds.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isAuthenticated ? (
                <>
                  <Link href="/upload">
                    <Button size="lg" className="w-full sm:w-auto bg-[#64d2ff] text-[#0d0d14] hover:bg-[#5ac8fa] rounded-xl px-8 h-12 font-semibold shadow-lg shadow-[#64d2ff]/20">
                      Start uploading
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-xl px-8 h-12 font-medium border-white/[0.08] text-white/70 hover:bg-white/[0.04] hover:text-white hover:border-white/[0.12]">
                      View dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-[#64d2ff] text-[#0d0d14] hover:bg-[#5ac8fa] rounded-xl px-8 h-12 font-semibold shadow-lg shadow-[#64d2ff]/20">
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 px-6 border-y border-white/[0.04]">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-1">90%</div>
                <div className="text-sm text-white/30">Time saved</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-1">100%</div>
                <div className="text-sm text-white/30">Accurate extraction</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-1">24/7</div>
                <div className="text-sm text-white/30">Always available</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">How it works</h2>
              <p className="text-white/40">Three simple steps to transform your workflow</p>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {/* Step 1 */}
              <div className="card-base p-6 group">
                <div className="icon-container icon-container-cyan mb-4">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium text-[#64d2ff] mb-2">Step 01</div>
                <h3 className="text-lg font-semibold text-white mb-2">Upload</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Drag and drop evaluation screenshots. Batch upload supported for efficiency.
                </p>
              </div>

              {/* Step 2 */}
              <div className="card-base p-6 group">
                <div className="icon-container icon-container-purple mb-4">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium text-[#bf5af2] mb-2">Step 02</div>
                <h3 className="text-lg font-semibold text-white mb-2">Extract</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  AI automatically extracts scores, names, comments, and evaluation dates.
                </p>
              </div>

              {/* Step 3 */}
              <div className="card-base p-6 group">
                <div className="icon-container icon-container-green mb-4">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium text-[#30d158] mb-2">Step 03</div>
                <h3 className="text-lg font-semibold text-white mb-2">Generate</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Create professional reports and export to Excel format instantly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 px-6 bg-white/[0.01]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">Why choose us</h2>
              <p className="text-white/40">Built for Floor Managers who value their time</p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="card-base p-6 flex gap-4">
                <div className="icon-container icon-container-amber shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Save hours every week</h3>
                  <p className="text-sm text-white/40">Automate repetitive data entry and report generation tasks.</p>
                </div>
              </div>

              <div className="card-base p-6 flex gap-4">
                <div className="icon-container icon-container-cyan shrink-0">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Accurate & reliable</h3>
                  <p className="text-sm text-white/40">AI-powered extraction ensures consistent, error-free data.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6">
          <div className="max-w-xl mx-auto text-center">
            <div className="card-elevated p-10">
              <h2 className="text-2xl font-bold text-white mb-3">Ready to get started?</h2>
              <p className="text-white/40 mb-8">Join Floor Managers who save hours every week.</p>
              {isAuthenticated ? (
                <Link href="/upload">
                  <Button className="bg-[#64d2ff] text-[#0d0d14] hover:bg-[#5ac8fa] rounded-xl px-8 h-12 font-semibold shadow-lg shadow-[#64d2ff]/20">
                    Start uploading now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button className="bg-[#64d2ff] text-[#0d0d14] hover:bg-[#5ac8fa] rounded-xl px-8 h-12 font-semibold shadow-lg shadow-[#64d2ff]/20">
                    Get started free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-white/[0.04]">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#64d2ff] to-[#5ac8fa] flex items-center justify-center">
                <Zap className="h-3 w-3 text-[#0d0d14]" />
              </div>
              <span className="text-sm text-white/30">GP Report Generator</span>
            </div>
            <div className="text-xs text-white/20">
              © 2026 All rights reserved
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { ArrowRight, Zap, BarChart3, FileText, Upload, Shield, Clock, Sparkles } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "GP Report Generator - AI-Powered Evaluation Automation";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0c0a09] via-[#1c1917] to-[#1a1412] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c0a09] via-[#1c1917] to-[#1a1412] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#0c0a09]/90 via-[#1c1917]/85 to-[#0c0a09]/90 backdrop-blur-2xl border-b border-white/[0.08] shadow-lg shadow-black/20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 animate-hover">
              <Zap className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="font-semibold text-white/90 tracking-tight">GP Report</span>
          </div>
          
          <nav className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="text-white/50 hover:text-white hover:bg-amber-500/10 rounded-xl transition-all duration-300">
                    Dashboard
                  </Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-xl px-5 font-medium shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-105">
                    Upload
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-xl px-5 font-medium shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-105">
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
          {/* Background glows */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/[0.08] rounded-full blur-[150px]" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[300px] bg-orange-500/[0.06] rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[200px] bg-fuchsia-500/[0.05] rounded-full blur-[100px]" />
          
          <div className="max-w-3xl mx-auto text-center relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-8 animate-hover">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-300 font-medium">AI-Powered Automation</span>
            </div>

            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              <span className="text-white">Streamline your</span>
              <br />
              <span className="text-gradient-amber">GP evaluations</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-white/40 max-w-lg mx-auto mb-10 leading-relaxed">
              Upload screenshots, extract data with AI, and generate professional reports in seconds.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <>
                  <Link href="/upload">
                    <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-amber-500/30 transition-all duration-300 hover:shadow-amber-500/50 hover:scale-105 hover:-translate-y-1">
                      Start uploading
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-2xl px-8 h-14 font-medium border-amber-500/20 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 hover:border-amber-500/40 transition-all duration-300 hover:scale-105">
                      View dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-amber-500/30 transition-all duration-300 hover:shadow-amber-500/50 hover:scale-105 hover:-translate-y-1">
                    Get started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-20 px-6 border-y border-amber-500/10">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-3 gap-8">
              <div className="text-center group animate-hover cursor-default">
                <div className="text-4xl font-bold text-gradient-amber mb-2">90%</div>
                <div className="text-sm text-white/30 group-hover:text-amber-300/50 transition-colors">Time saved</div>
              </div>
              <div className="text-center group animate-hover cursor-default">
                <div className="text-4xl font-bold text-gradient-amber mb-2">100%</div>
                <div className="text-sm text-white/30 group-hover:text-amber-300/50 transition-colors">Accurate extraction</div>
              </div>
              <div className="text-center group animate-hover cursor-default">
                <div className="text-4xl font-bold text-gradient-amber mb-2">24/7</div>
                <div className="text-sm text-white/30 group-hover:text-amber-300/50 transition-colors">Always available</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-28 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">How it works</h2>
              <p className="text-white/40">Three simple steps to transform your workflow</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="premium-card p-7 group">
                <div className="icon-container icon-container-amber mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold text-amber-400 mb-2 tracking-wide">STEP 01</div>
                <h3 className="text-xl font-semibold text-white mb-3">Upload</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Drag and drop evaluation screenshots. Batch upload supported for efficiency.
                </p>
              </div>

              {/* Step 2 */}
              <div className="premium-card p-7 group">
                <div className="icon-container icon-container-orange mb-5 group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold text-orange-400 mb-2 tracking-wide">STEP 02</div>
                <h3 className="text-xl font-semibold text-white mb-3">Extract</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  AI automatically extracts scores, names, comments, and evaluation dates.
                </p>
              </div>

              {/* Step 3 */}
              <div className="premium-card p-7 group">
                <div className="icon-container icon-container-green mb-5 group-hover:scale-110 transition-transform duration-300">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold text-green-400 mb-2 tracking-wide">STEP 03</div>
                <h3 className="text-xl font-semibold text-white mb-3">Generate</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Create professional reports and export to Excel format instantly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-28 px-6 bg-amber-500/[0.02]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Why choose us</h2>
              <p className="text-white/40">Built for Floor Managers who value their time</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="floating-card p-7 flex gap-5">
                <div className="icon-container icon-container-amber shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg mb-2">Save hours every week</h3>
                  <p className="text-sm text-white/40 leading-relaxed">Automate repetitive data entry and report generation tasks.</p>
                </div>
              </div>

              <div className="floating-card p-7 flex gap-5">
                <div className="icon-container icon-container-fuchsia shrink-0">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg mb-2">Accurate & reliable</h3>
                  <p className="text-sm text-white/40 leading-relaxed">AI-powered extraction ensures consistent, error-free data.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-28 px-6">
          <div className="max-w-xl mx-auto text-center">
            <div className="card-elevated p-12 relative overflow-hidden">
              {/* Background glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-amber-500/20 rounded-full blur-[80px]" />
              
              <div className="relative z-10">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to get started?</h2>
                <p className="text-white/40 mb-8">Join Floor Managers who save hours every week.</p>
                {isAuthenticated ? (
                  <Link href="/upload">
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-amber-500/30 transition-all duration-300 hover:shadow-amber-500/50 hover:scale-105">
                      Start uploading now
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                ) : (
                  <a href={getLoginUrl()}>
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-amber-500/30 transition-all duration-300 hover:shadow-amber-500/50 hover:scale-105">
                      Get started free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-10 px-6 border-t border-amber-500/10">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-white" />
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

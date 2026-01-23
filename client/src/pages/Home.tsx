import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "GP Report Generator - AI-Powered Evaluation Automation Tool";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-[#1a1a2e]/50 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#0f0f1a] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#0d0d15] rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-white/90">GP Report</span>
          </div>
          
          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/5">
                    Dashboard
                  </Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="bg-white text-black hover:bg-white/90 rounded-full px-4">
                    Upload
                  </Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="bg-white text-black hover:bg-white/90 rounded-full px-4">
                  Sign In
                </Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="min-h-[90vh] flex items-center justify-center px-6">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-white/60 uppercase tracking-wider">AI-Powered</span>
            </div>

            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6">
              <span className="text-white">Automate your</span>
              <br />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                GP evaluations
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
              Upload screenshots, let AI extract the data, and generate professional reports in seconds.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isAuthenticated ? (
                <>
                  <Link href="/upload">
                    <Button size="lg" className="w-full sm:w-auto bg-white text-black hover:bg-white/90 rounded-full px-8 h-12 text-sm font-medium">
                      Start uploading
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full px-8 h-12 text-sm font-medium border-white/10 text-white/80 hover:bg-white/5 hover:text-white">
                      View dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-white text-black hover:bg-white/90 rounded-full px-8 h-12 text-sm font-medium">
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-center gap-8 mt-16 pt-16 border-t border-white/5">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">90%</div>
                <div className="text-xs text-white/40 mt-1">Time saved</div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <div className="text-2xl font-bold text-white">100%</div>
                <div className="text-xs text-white/40 mt-1">Accurate</div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <div className="text-2xl font-bold text-white">24/7</div>
                <div className="text-xs text-white/40 mt-1">Available</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">How it works</h2>
              <p className="text-white/50">Three simple steps to transform your workflow</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4 text-indigo-400 font-mono text-sm">
                  01
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Upload</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Drag and drop your evaluation screenshots. Batch upload supported.
                </p>
              </div>

              {/* Step 2 */}
              <div className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4 text-purple-400 font-mono text-sm">
                  02
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Extract</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  AI automatically extracts scores, names, comments, and dates.
                </p>
              </div>

              {/* Step 3 */}
              <div className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center mb-4 text-pink-400 font-mono text-sm">
                  03
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Generate</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Create professional reports and export to Excel instantly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="p-8 rounded-3xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5">
              <h2 className="text-2xl font-bold text-white mb-3">Ready to get started?</h2>
              <p className="text-white/50 mb-6">Join Floor Managers who save hours every week.</p>
              {isAuthenticated ? (
                <Link href="/upload">
                  <Button className="bg-white text-black hover:bg-white/90 rounded-full px-6 h-11">
                    Start uploading now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button className="bg-white text-black hover:bg-white/90 rounded-full px-6 h-11">
                    Get started free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-white/5">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm text-white/40">GP Report Generator</span>
            </div>
            <div className="text-xs text-white/30">
              © 2026 All rights reserved
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

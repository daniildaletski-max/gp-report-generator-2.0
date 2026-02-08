import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { ArrowRight, Zap, BarChart3, FileText, Upload, Shield, Clock, Sparkles, LogOut, ChevronRight, Star, Activity } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    document.title = "GP Report Generator - AI-Powered Evaluation Automation";
    setMounted(true);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-[#d4af37]/20 border-t-[#d4af37] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white overflow-hidden">
      {/* Animated background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[15%] left-[10%] w-[500px] h-[500px] bg-[#d4af37]/[0.04] rounded-full blur-[150px] animate-float" />
        <div className="absolute top-[40%] right-[5%] w-[400px] h-[400px] bg-[#8b0000]/[0.05] rounded-full blur-[130px]" style={{ animation: 'float 8s ease-in-out infinite reverse' }} />
        <div className="absolute bottom-[10%] left-[30%] w-[350px] h-[350px] bg-[#b8860b]/[0.04] rounded-full blur-[120px]" style={{ animation: 'float 10s ease-in-out infinite' }} />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(212,175,55,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.015)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center shadow-lg shadow-[#d4af37]/20 transition-transform duration-300 hover:scale-110">
              <Zap className="h-4 w-4 text-black" />
            </div>
            <span className="font-semibold text-white/90 tracking-tight">GP Report</span>
          </div>
          
          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="text-white/50 hover:text-[#d4af37] hover:bg-[#d4af37]/8 rounded-xl transition-all duration-300">
                    Dashboard
                  </Button>
                </Link>
                <Link href="/upload">
                  <Button size="sm" className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black hover:from-[#e6c84b] hover:to-[#d4af37] rounded-xl px-5 font-semibold shadow-lg shadow-[#d4af37]/20 transition-all duration-300 hover:shadow-[#d4af37]/35 hover:scale-105">
                    Upload
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={async () => { await logout(); window.location.href = "/"; }}
                  className="text-white/30 hover:text-red-400 hover:bg-[#8b0000]/15 rounded-xl transition-all duration-300 ml-1"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="sm" className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black hover:from-[#e6c84b] hover:to-[#d4af37] rounded-xl px-5 font-semibold shadow-lg shadow-[#d4af37]/20 transition-all duration-300 hover:shadow-[#d4af37]/35 hover:scale-105">
                  Sign In
                </Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="pt-16 relative z-10">
        {/* Hero Section */}
        <section className="min-h-[90vh] flex items-center justify-center px-6 relative">
          <div className={`max-w-3xl mx-auto text-center transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#d4af37]/8 border border-[#d4af37]/15 mb-8 backdrop-blur-xl transition-all duration-300 hover:bg-[#d4af37]/12 hover:border-[#d4af37]/25">
              <Sparkles className="w-4 h-4 text-[#d4af37]" />
              <span className="text-sm text-[#d4af37]/80 font-medium">AI-Powered Automation</span>
              <ChevronRight className="w-3 h-3 text-[#d4af37]/40" />
            </div>

            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              <span className="text-white">Streamline your</span>
              <br />
              <span className="text-gradient-violet">GP evaluations</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-white/35 max-w-lg mx-auto mb-12 leading-relaxed">
              Upload screenshots, extract data with AI, and generate professional reports in seconds.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <>
                  <Link href="/upload">
                    <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black hover:from-[#e6c84b] hover:to-[#d4af37] rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-[#d4af37]/25 transition-all duration-300 hover:shadow-[#d4af37]/40 hover:scale-[1.03] hover:-translate-y-0.5 group">
                      Start uploading
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-2xl px-8 h-14 font-medium border-[#d4af37]/15 text-[#d4af37]/60 hover:bg-[#d4af37]/5 hover:text-[#d4af37]/80 hover:border-[#d4af37]/25 transition-all duration-300 hover:scale-[1.03]">
                      View dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black hover:from-[#e6c84b] hover:to-[#d4af37] rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-[#d4af37]/25 transition-all duration-300 hover:shadow-[#d4af37]/40 hover:scale-[1.03] hover:-translate-y-0.5 group">
                    Get started
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-20 px-6 border-y border-[#d4af37]/[0.04]">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-3 gap-8">
              {[
                { value: "90%", label: "Time saved", icon: Clock },
                { value: "100%", label: "Accurate extraction", icon: Star },
                { value: "24/7", label: "Always available", icon: Activity },
              ].map((stat, i) => (
                <div key={i} className="text-center group cursor-default transition-all duration-300 hover:-translate-y-1">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#d4af37]/5 border border-[#d4af37]/10 mb-3 transition-all duration-300 group-hover:bg-[#d4af37]/10 group-hover:border-[#d4af37]/20 group-hover:shadow-lg group-hover:shadow-[#d4af37]/8">
                    <stat.icon className="w-4 h-4 text-[#d4af37]/50 group-hover:text-[#d4af37] transition-colors" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-bold text-gradient-violet mb-2">{stat.value}</div>
                  <div className="text-sm text-white/25 group-hover:text-white/40 transition-colors">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-28 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">How it works</h2>
              <p className="text-white/30">Three simple steps to transform your workflow</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Upload, step: "01", title: "Upload", desc: "Drag and drop evaluation screenshots. Batch upload supported for efficiency.", color: "gold" },
                { icon: BarChart3, step: "02", title: "Extract", desc: "AI automatically extracts scores, names, comments, and evaluation dates.", color: "red" },
                { icon: FileText, step: "03", title: "Generate", desc: "Create professional reports and export to Excel format instantly.", color: "green" },
              ].map((feature, i) => (
                <div key={i} className="premium-card p-7 group">
                  <div className={`icon-container icon-container-${feature.color === 'gold' ? 'gold' : feature.color} mb-5 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div className={`text-xs font-semibold mb-2 tracking-widest uppercase ${
                    feature.color === 'gold' ? 'text-[#d4af37]' : feature.color === 'red' ? 'text-[#dc2626]' : 'text-emerald-400'
                  }`}>Step {feature.step}</div>
                  <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                  <p className="text-sm text-white/35 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-28 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Why choose us</h2>
              <p className="text-white/30">Built for Floor Managers who value their time</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                { icon: Clock, color: "gold", title: "Save hours every week", desc: "Automate repetitive data entry and report generation tasks." },
                { icon: Shield, color: "red", title: "Accurate & reliable", desc: "AI-powered extraction ensures consistent, error-free data." },
              ].map((benefit, i) => (
                <div key={i} className="floating-card p-7 flex gap-5 group">
                  <div className={`icon-container icon-container-${benefit.color} shrink-0 transition-all duration-300 group-hover:scale-110`}>
                    <benefit.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-lg mb-2">{benefit.title}</h3>
                    <p className="text-sm text-white/35 leading-relaxed">{benefit.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-28 px-6">
          <div className="max-w-xl mx-auto text-center">
            <div className="card-elevated p-12 relative overflow-hidden">
              {/* Background glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-[#d4af37]/10 rounded-full blur-[80px]" />
              
              <div className="relative z-10">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to get started?</h2>
                <p className="text-white/35 mb-8">Join Floor Managers who save hours every week.</p>
                {isAuthenticated ? (
                  <Link href="/upload">
                    <Button className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black hover:from-[#e6c84b] hover:to-[#d4af37] rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-[#d4af37]/25 transition-all duration-300 hover:shadow-[#d4af37]/40 hover:scale-[1.03] group">
                      Start uploading now
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </Button>
                  </Link>
                ) : (
                  <a href={getLoginUrl()}>
                    <Button className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black hover:from-[#e6c84b] hover:to-[#d4af37] rounded-2xl px-8 h-14 font-semibold shadow-xl shadow-[#d4af37]/25 transition-all duration-300 hover:shadow-[#d4af37]/40 hover:scale-[1.03] group">
                      Get started free
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-10 px-6 border-t border-[#d4af37]/[0.04]">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-black" />
              </div>
              <span className="text-sm text-white/25">GP Report Generator</span>
            </div>
            <div className="text-xs text-white/15">
              &copy; 2026 All rights reserved
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

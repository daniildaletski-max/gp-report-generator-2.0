export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden md:block w-[280px] border-r border-border bg-sidebar p-4 space-y-6 relative">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2 h-16 border-b border-border/50">
          <div className="h-8 w-8 rounded-lg skeleton-shimmer" />
          <div className="h-4 w-24 rounded skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
        </div>
        {/* Search bar */}
        <div className="px-2">
          <div className="h-10 w-full rounded-xl skeleton-shimmer" style={{ animationDelay: '0.15s' }} />
        </div>
        {/* Menu items */}
        <div className="space-y-2 px-2">
          <div className="h-11 w-full rounded-xl skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" style={{ animationDelay: '0.25s' }} />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" style={{ animationDelay: '0.35s' }} />
          <div className="h-11 w-full rounded-xl skeleton-shimmer" style={{ animationDelay: '0.4s' }} />
        </div>
        {/* User profile area at bottom */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 rounded skeleton-shimmer" />
              <div className="h-2 w-32 rounded skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-56 rounded-lg skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 rounded-xl skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
            <div className="h-10 w-20 rounded-xl skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 sm:h-32 rounded-2xl skeleton-shimmer border border-border/30" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        {/* Content blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-2xl skeleton-shimmer border border-border/30" style={{ animationDelay: '0.5s' }} />
          <div className="h-64 rounded-2xl skeleton-shimmer border border-border/30" style={{ animationDelay: '0.6s' }} />
        </div>
      </div>
    </div>
  );
}

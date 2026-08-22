import { SkeletonBlock } from "@/components/layout/SharedLayouts";

export default function Loading() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-4xl space-y-6">
      <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <SkeletonBlock className="size-12" />
          <div className="flex-1">
            <SkeletonBlock className="h-8 w-56" />
            <SkeletonBlock className="mt-3 h-4 w-64" />
          </div>
        </div>
      </div>
      <SkeletonBlock className="h-9 w-full" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-36 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

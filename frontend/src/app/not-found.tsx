import Link from "next/link";
import { Home } from "lucide-react";
import { RevizeMascot } from "@/components/brand/RevizeMascot";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <RevizeMascot state="confused" className="mb-6 size-24" />

      <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-foreground">
        404 - Page Not Found
      </h1>

      <p className="mb-8 max-w-md text-lg text-muted">
        We couldn&rsquo;t find the page you were looking for. It might have been removed, renamed, or didn&rsquo;t exist in the first place.
      </p>

      <Link
        href="/"
        className="motion-hover motion-active flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground hover:opacity-90"
      >
        <Home size={18} />
        Return to Homepage
      </Link>
    </div>
  );
}

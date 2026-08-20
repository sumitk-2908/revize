import Link from "next/link";
import { AlertTriangle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <AlertTriangle size={40} />
      </div>
      
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

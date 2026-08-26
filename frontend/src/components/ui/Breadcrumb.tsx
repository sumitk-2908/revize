"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { normalizeTitle } from "@/app/lib/subject-config";

export default function Breadcrumb() {
  const pathname = usePathname();

  if (!pathname || pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);

  const breadcrumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    // Format segment nicely
    const label = normalizeTitle(segment.replace(/-/g, " "));

    return { href, label, isSubject: segment === "subject" && index === 0 };
  }).filter(crumb => !crumb.isSubject);

  return (
    <nav aria-label="breadcrumb" className="mb-6 flex w-full overflow-x-auto py-2">
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted">
        <li>
          <Link href="/" className="motion-hover flex items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-surface-hover hover:text-foreground">
            <Home size={14} />
            Subjects
          </Link>
        </li>

        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              <ChevronRight size={14} className="opacity-50" />
              {isLast ? (
                <span className="px-2 py-1 font-bold text-foreground" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="motion-hover rounded-md px-2 py-1 font-medium hover:bg-surface-hover hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

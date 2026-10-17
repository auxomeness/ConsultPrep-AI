"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const onIntake = pathname === "/intake";

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="ConsultPrep AI, home"
          className="inline-flex items-center gap-2.5 rounded-xl font-semibold tracking-tight text-foreground focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-contrast">C</span>
          <span>ConsultPrep AI</span>
        </Link>
        <nav aria-label="Primary navigation" className="flex items-center gap-1 text-sm font-semibold">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`rounded-full px-3 py-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ${pathname === "/" ? "bg-secondary text-secondary-foreground" : "text-muted hover:bg-elevated hover:text-foreground"}`}
          >
            Home
          </Link>
          <Link
            href="/intake"
            aria-current={onIntake ? "page" : undefined}
            className={`rounded-full px-3 py-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ${onIntake ? "bg-secondary text-secondary-foreground" : "text-muted hover:bg-elevated hover:text-foreground"}`}
          >
            Intake preview
          </Link>
        </nav>
      </div>
    </header>
  );
}

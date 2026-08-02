import Link from "next/link";

import { NavLink } from "@/components/NavLink";
import { branding } from "@/lib/branding";
import type { Session } from "@/lib/auth";
import { USER_ROLE_LABELS } from "@/lib/types";

const FULL_ACCESS_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/route", label: "Route" },
  { href: "/schedule", label: "Schedule" },
  { href: "/customers", label: "Customers" },
  { href: "/estimates", label: "Estimates" },
  { href: "/equipment", label: "Equipment" },
  { href: "/settings", label: "Settings" },
];

const OPERATIONS_NAV = [
  { href: "/route", label: "Route" },
  { href: "/customers", label: "Customers" },
  { href: "/equipment", label: "Equipment" },
];

function LogoMark() {
  return (
    <svg
      viewBox={branding.logo.viewBox}
      aria-hidden="true"
      className="h-7 w-7 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {branding.logo.paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const nav = session.isAdmin ? FULL_ACCESS_NAV : OPERATIONS_NAV;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mowing-stripe">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 pb-3 pt-4">
            <Link
              href={session.isAdmin ? "/" : "/route"}
              className="flex items-center gap-2.5 text-cut"
            >
              <LogoMark />
              <span className="leading-none">
                <span className="block font-[family-name:var(--font-display)] text-lg font-bold uppercase tracking-[0.14em] text-white">
                  {branding.name}
                </span>
                <span className="block font-[family-name:var(--font-display)] text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-white/50">
                  {branding.tagline}
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <span className="hidden text-right leading-tight sm:block">
                <span className="block font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-white">
                  {session.profile.name || session.email}
                </span>
                <span className="block font-[family-name:var(--font-display)] text-[0.625rem] uppercase tracking-[0.18em] text-white/50">
                  {USER_ROLE_LABELS[session.profile.role]}
                </span>
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded border border-white/25 px-2.5 py-1.5 font-[family-name:var(--font-display)] text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:border-white/50 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <nav
            aria-label="Main"
            className="-mb-px flex gap-5 overflow-x-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

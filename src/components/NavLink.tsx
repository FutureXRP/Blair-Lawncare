"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cx(
        "relative whitespace-nowrap px-1 pb-3 pt-1",
        "font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.12em]",
        "transition",
        isActive ? "text-white" : "text-white/60 hover:text-white/90",
      )}
    >
      {children}
      <span
        className={cx(
          "absolute inset-x-0 bottom-0 h-0.5 rounded-full transition",
          isActive ? "bg-cut" : "bg-transparent",
        )}
      />
    </Link>
  );
}

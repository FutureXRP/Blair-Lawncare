import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section className={cx("card", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="eyebrow text-ink">{title}</h2>
        {meta ? <div className="mt-0.5 text-xs text-muted">{meta}</div> : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl uppercase tracking-wide text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonTone = "primary" | "secondary" | "ghost" | "alert";

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: "bg-cut text-white border-cut hover:brightness-105",
  secondary: "bg-card text-ink border-line hover:border-cut hover:text-cut",
  ghost: "bg-transparent text-muted border-transparent hover:text-ink",
  alert: "bg-orange text-white border-orange hover:brightness-105",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded border px-3.5 py-2 " +
  "font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] " +
  "transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  tone = "primary",
  className,
  ...rest
}: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return <button className={cx(BUTTON_BASE, BUTTON_TONES[tone], className)} {...rest} />;
}

export function ButtonLink({
  tone = "secondary",
  className,
  ...rest
}: ComponentProps<typeof Link> & { tone?: ButtonTone }) {
  return <Link className={cx(BUTTON_BASE, BUTTON_TONES[tone], className)} {...rest} />;
}

const FIELD_BASE =
  "w-full rounded border border-line bg-card px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted/70 focus:border-cut focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label block pb-1.5">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(FIELD_BASE, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(FIELD_BASE, "min-h-20", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx(FIELD_BASE, "pr-8", className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

type BadgeTone = "neutral" | "green" | "orange" | "quiet";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-canvas text-ink",
  green: "border-cut/40 bg-cut/10 text-cut",
  orange: "border-orange/40 bg-orange/10 text-orange",
  quiet: "border-line bg-transparent text-muted",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "font-[family-name:var(--font-display)] text-[0.625rem] font-semibold uppercase tracking-[0.1em]",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  headline,
  children,
  action,
}: {
  headline: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="eyebrow text-ink">{headline}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{children}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded border border-orange/40 bg-orange/10 px-3 py-2 text-sm text-orange">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded border border-cut/40 bg-cut/10 px-3 py-2 text-sm text-cut">
      {message}
    </p>
  );
}

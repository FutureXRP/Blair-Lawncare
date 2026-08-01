import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/LoginForm";
import { branding } from "@/lib/branding";
import { getSession } from "@/lib/auth";

export const metadata = { title: `Sign in · ${branding.name}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const { next, mode } = await searchParams;

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (configured) {
    const session = await getSession();
    if (session) redirect(session.isOwner ? "/" : "/route");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mowing-stripe h-28 sm:h-36" />

      <div className="mx-auto -mt-16 w-full max-w-md px-4 pb-16">
        <div className="card px-5 py-6 sm:px-7 sm:py-8">
          <p className="eyebrow text-cut">{branding.name}</p>
          <h1 className="mt-1 text-2xl uppercase text-ink">{branding.tagline}</h1>

          {configured ? (
            <LoginForm next={next ?? "/"} initialMode={mode === "signup" ? "signup" : "signin"} />
          ) : (
            <div className="mt-5 rounded border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-ink">
              <p className="text-orange">Supabase is not configured yet.</p>
              <p className="mt-2 text-muted">
                Copy .env.example to .env.local, fill in NEXT_PUBLIC_SUPABASE_URL and
                NEXT_PUBLIC_SUPABASE_ANON_KEY, run the migrations in supabase/migrations, then
                reload this page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

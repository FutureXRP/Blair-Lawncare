import Link from "next/link";

import { branding } from "@/lib/branding";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mowing-stripe h-28 sm:h-36" />
      <div className="mx-auto -mt-16 w-full max-w-md px-4">
        <div className="card px-5 py-6 sm:px-7 sm:py-8">
          <p className="eyebrow text-cut">{branding.name}</p>
          <h1 className="mt-1 text-2xl uppercase text-ink">Nothing here</h1>
          <p className="mt-2 text-sm text-muted">
            That page does not exist, or it belongs to a record that has been removed.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/" className="text-cut hover:underline">
              Back to the dashboard
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

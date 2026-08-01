/**
 * Teaches Node the "@/" path alias that tsconfig.json declares, so the
 * verification script can import the same modules the app does rather than a
 * copy of them.
 */

import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const PROJECT_ROOT = resolvePath(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = pathToFileURL(
      resolvePath(PROJECT_ROOT, "src", specifier.slice(2)),
    ).href;

    // Source files import without an extension; add the one they actually have.
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Try the next candidate.
      }
    }
  }

  return nextResolve(specifier, context);
}

/**
 * Single source of truth for branding.
 *
 * "TrueCut" is a placeholder name. To rebrand the whole app, change the values
 * in this file and nothing else. The color values are injected as CSS custom
 * properties by the root layout, and Tailwind's theme maps its color names onto
 * those same custom properties, so a color changed here changes everywhere.
 */

export const branding = {
  name: "TrueCut",
  fullName: "TrueCut Lawn & Landscape",
  tagline: "Lawn & Landscape",

  /**
   * Logo mark. Kept as inline SVG path data so there is no asset to swap and no
   * network request. Drawn on a 24x24 viewBox.
   */
  logo: {
    viewBox: "0 0 24 24",
    /** A blade of grass over a cut stripe. */
    paths: [
      "M12 3c2.6 2.9 3.9 5.9 3.9 9 0 2-.5 3.7-1.4 5.2h-5C8.6 15.7 8.1 14 8.1 12c0-3.1 1.3-6.1 3.9-9Z",
      "M3 20.5h18",
    ],
  },

  colors: {
    hedge: "#1C2E22",
    stripe: "#24382B",
    cut: "#4C9A46",
    canvas: "#F1F3EE",
    card: "#FFFFFF",
    ink: "#22271F",
    muted: "#6B7266",
    line: "#E1E5DC",
    orange: "#E4762B",
  },
} as const;

export type BrandColor = keyof typeof branding.colors;

/** Emitted into a <style> tag by the root layout. */
export function brandingCssVariables(): string {
  const declarations = Object.entries(branding.colors)
    .map(([token, value]) => `  --${token}: ${value};`)
    .join("\n");
  return `:root {\n${declarations}\n}`;
}

import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";

import { branding, brandingCssVariables } from "@/lib/branding";

import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${branding.name} Dashboard`,
  description: `Operations dashboard for ${branding.fullName}`,
};

export const viewport: Viewport = {
  themeColor: branding.colors.hedge,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}
    >
      <head>
        {/* Branding tokens come from src/lib/branding.ts and override the
            fallbacks in globals.css. One file, one place to rebrand. */}
        <style dangerouslySetInnerHTML={{ __html: brandingCssVariables() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

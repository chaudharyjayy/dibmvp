import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Geist, IBM_Plex_Mono } from "next/font/google";
import Disclaimer from "@/components/disclaimer";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The display face: an angular technical sans with cut corners. It reads as
 * instrumentation rather than editorial, which is what the HUD needs, and it
 * carries the uppercase tracked labels without turning into a novelty.
 */
const display = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

/**
 * The data face. Plex Mono is a working instrument's typeface: legible at
 * 10px, tabular, and square enough to sit in a readout without shouting.
 */
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vibrant Wellness — Drug-in-Body Simulator",
  description:
    "See how a drug moves through the body over time — simulated with standard pharmacokinetic models, not advice.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      {/*
        pb-12 / md:pb-10 reserves room for the fixed disclaimer (48px on
        mobile, 40px from md up) so it never covers page content.
      */}
      <body className="flex min-h-full flex-col pb-12 md:pb-10">
        {children}
        <Disclaimer />
      </body>
    </html>
  );
}

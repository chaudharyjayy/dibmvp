import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Disclaimer from "@/components/disclaimer";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
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

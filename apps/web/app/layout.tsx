import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vibrant Wellness — Drug-in-Body Simulator",
  description:
    "See how a drug moves through the body over time — simulated with standard pharmacokinetic models, not advice.",
};

export default function RootLayout({
  children,
}: import("next").RenderableBody & { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<"red" | "blue">("red");

  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-9 overflow-hidden">
        <ThemeToggle currentTheme={theme} setCurrentTheme={setTheme} />
        {children}
      </body>
    </html>
  );
}
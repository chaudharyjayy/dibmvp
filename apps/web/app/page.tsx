import Hero from "@/components/landing/hero";
import ScrollSections from "@/components/landing/scroll-sections";

export default function LandingPage() {
  return (
    <main className="relative flex-1 bg-black">
      <Hero />
      <ScrollSections />
    </main>
  );
}

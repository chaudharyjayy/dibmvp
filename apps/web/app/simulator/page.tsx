import type { Metadata } from "next";
import Simulator from "@/components/simulator/simulator";

export const metadata: Metadata = {
  title: "Simulator — Drug-in-Body",
  description:
    "Walk the body organ by organ while a simulated dose moves through it. Runs on labelled placeholder parameters.",
};

export default function SimulatorPage() {
  // The simulator draws its own HUD chrome: the bar, the backdrop and the
  // panel. The route only has to hand it the page.
  return (
    <main className="flex-1 bg-page">
      <Simulator />
    </main>
  );
}

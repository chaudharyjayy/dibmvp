import type { Metadata } from "next";
import Simulator from "@/components/simulator/simulator";

export const metadata: Metadata = {
  title: "Simulator — Drug-in-Body",
  description:
    "Enter doses and timing, see the simulated concentration curve. Runs on labelled placeholder parameters.",
};

export default function SimulatorPage() {
  return (
    <main className="flex-1">
      <Simulator />
    </main>
  );
}

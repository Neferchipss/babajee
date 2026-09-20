import type { Metadata } from "next";
import PitchApp from "./PitchApp";

// Temporary design pitch: one products page in three styles. Delete this
// folder once a direction is chosen.
export const metadata: Metadata = { title: "Babajee design pitch" };

export default function PitchPage() {
  return <PitchApp />;
}

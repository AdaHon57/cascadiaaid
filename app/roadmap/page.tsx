import type { Metadata } from "next";
import { HouseholdRoadmap } from "@/components/dashboard/household-roadmap";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return <HouseholdRoadmap />;
}

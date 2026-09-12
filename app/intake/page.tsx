import type { Metadata } from "next";
import { IntakeQuestionnaire } from "@/components/intake/intake-questionnaire";
export const metadata: Metadata = { title: "Intake" };
export default function IntakePage() {
  return <IntakeQuestionnaire />;
}

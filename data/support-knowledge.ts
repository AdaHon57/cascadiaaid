import { recoveryNodes } from "@/data/recovery-nodes";
import type { SupportSource } from "@/types/support-chat";

// Reviewed app guidance, not scraped policy. Keep this in sync with the named
// implementations. The /support page renders the same records used by retrieval.
const guides = [
  {
    id: "getting-started",
    title: "Getting started and your next step",
    summary:
      "Start with Intake, then review and confirm your answers. Open Dashboard to see your next step.",
    content:
      "Start at Intake and answer the questions about your household and affected home. Review and confirm your answers to create your recovery plan. The Dashboard shows a next step based on your recorded situation. You can return to Intake to update your answers. Draft edits do not change the confirmed plan until you review and confirm them. The chatbot explains the site; it cannot see your household record or determine your personal next step. Open Dashboard for your current recommendation.",
  },
  {
    id: "roadmap-status",
    title: "Understanding the recovery roadmap",
    summary:
      "A blocked step has an unresolved prerequisite. Open Roadmap to review it, then update and confirm your progress in Intake. Workflow prerequisites are planning examples; confirm agency requirements directly.",
    content:
      "The Roadmap organizes recovery steps using your confirmed intake answers. Ready means the planning prerequisites are satisfied; blocked means a required prerequisite is unresolved. Recommendations do not block a step. Waiting and answer-needed labels identify recorded follow-up or missing information. A submission is not the same as approval, payment, or completion. The workflow rules are illustrative planning aids, not verified agency requirements, eligibility decisions, or permission to occupy a property.",
  },
  {
    id: "intake-answers",
    title: "Updating and confirming intake answers",
    summary:
      "Update your answers in Intake, then review and confirm them to update your plan. Documents are optional.",
    content:
      "Intake has three questionnaire stages followed by a review screen. Questions adapt to your answers. Not sure, skipped, no, and unanswered have different meanings. You can finish intake without uploading documents. Review and confirm answers before using the personalized recovery plan. Use Intake to correct household details, record progress, or change an answer; the chatbot cannot save or change these records.",
  },
  {
    id: "documents-upload",
    title: "Uploading and reviewing documents",
    summary:
      "Add JPEG, PNG, or WebP photos in Intake or Documents. Convert PDF or HEIC files first. Review extracted text before saving it in Intake; uploading alone does not verify eligibility or complete a task.",
    content:
      "You can add optional document photos during Intake or use the Documents page for document text extraction and visible property-damage observations. Supported images are JPEG, PNG, and WebP. Convert PDF or HEIC files to a supported image first. Check extracted text and deliberately save relevant reviewed fields during Intake. Uploading a file does not automatically verify identity, prove eligibility, or complete a task. User confirmation is separate from acceptance by an agency. Standalone Documents results are temporary and do not update recovery records. Redact sensitive identifiers before uploading.",
  },
  {
    id: "applications-tracking",
    title: "Tracking assistance applications and deadlines",
    summary:
      "Open Applications to see recorded statuses and deadlines. Use Add or update applications to edit them in Intake, then confirm. Check deadlines with the organization handling your application.",
    content:
      "The Applications page lists separately recorded assistance applications from confirmed intake, including organization, status, requested action or appeal, and any recorded deadline. Select Add or update applications to return to Intake. Review and confirm edits to update the list. A denial does not mark an application complete. The site tracks information you enter; it does not submit applications, contact organizations, verify deadlines, or decide eligibility. Check requirements and dates with the organization responsible for the application.",
  },
  {
    id: "privacy-and-reset",
    title: "Saved data and clearing your information",
    summary:
      "Profile → Wipe user data deletes your saved household information after confirmation. New chat clears this tab’s conversation. The chatbot cannot access your household records.",
    content:
      "Household answers and intake documents are saved privately for the anonymous household identified by this browser's session cookie. There is no account-based cross-device recovery. Clearing the cookie removes this browser's access to that household. Profile → Wipe user data asks for confirmation, then deletes the household's saved answers, progress, applications, and uploaded documents. The support conversation is kept only in this tab's session storage, including across reloads. New chat clears that conversation; Wipe user data clears it in this tab too. Messages and recent conversation are sent to the server and, when AI answers are enabled, to the AI service. The chatbot does not automatically read saved household data or documents.",
  },
  {
    id: "housing-help",
    title: "Finding housing help in the app",
    summary:
      "In Intake, answer No or Not sure when asked whether you have a safe place tonight to see housing help. Support cannot check vacancies or reserve housing. For immediate danger, contact local emergency services.",
    content:
      "In Intake, answer the question about having a safe place to stay tonight. No or Not sure immediately displays the emergency housing help panel, even before finishing intake. The Dashboard also prioritizes housing help for these answers. Record household size, accommodation needs, current arrangement, and confirmation when asked. The chatbot cannot check shelter vacancies, reserve housing, or assess whether a building is safe. If you are in immediate danger, contact local emergency services.",
  },
  {
    id: "support-scope",
    title: "What Cascadia Aid support can answer",
    summary:
      "Ask about using Cascadia Aid or replacing a Washington ID or driver license. Support uses app guidance and reviewed Washington DOL sources; it cannot access your case or submit applications.",
    content:
      "Support explains Cascadia Aid's intake, documents, dashboard, roadmap, and application tracking using this site's guide and illustrative recovery workflow definitions. It also uses reviewed Washington State Department of Licensing (DOL) guidance for replacing lost IDs and driver licenses. Official guidance applies only to the stated jurisdiction and topic; it is a reviewed snapshot, not a live website lookup. Support cannot access your private case, submit applications, change progress, contact agencies, or transfer you to a human operator. Source links let you check the responsible organization’s current guidance.",
  },
];

// Reviewed against official DOL pages on the date below. Refresh these snapshots
// when DOL guidance changes. Do not infer fees or eligibility from workflow examples.
const officialSources: SupportSource[] = [
  {
    id: "wa-dol-replace-id",
    title: "Washington DOL: Replace a lost ID card",
    href: "https://dol.wa.gov/id-cards/replace-id-card",
    kind: "official",
    reviewedAt: "2026-09-12",
    summary:
      "For a lost Washington ID card, start with DOL’s replacement page and License Express. Update your address first if you’ve moved. For help, call DOL at 360-902-3900.",
    content:
      "Washington State Department of Licensing (DOL) provides an ID card replacement page for lost or stolen identification cards, with a link to License Express to request a replacement online. Update your address before ordering if you have moved; replacement cards cannot be forwarded. DOL says it mails replacement ID cards to the address on file within 7–10 days. If the card expires within 90 days, DOL says to renew it instead. The temporary ID has no photo and cannot be used as identification. For replacement help, call 360-902-3900 (TTY: 711). Consult DOL for current fees and online eligibility; this record does not establish either. This guidance is for Washington state ID cards, not passports, Social Security cards, or another state’s ID.",
  },
  {
    id: "wa-dol-replace-license",
    title: "Washington DOL: Replace a lost driver license or permit",
    href: "https://dol.wa.gov/driver-licenses-and-permits/renew-or-replace-driver-license/replace-your-license-or-learner-permit",
    kind: "official",
    reviewedAt: "2026-09-12",
    summary:
      "For a lost Washington driver license or learner permit, request a replacement through DOL online, at a driver licensing office, or by calling 360-902-3900. Update your address first if you’ve moved. Online restrictions apply; check DOL’s replacement page.",
    content:
      "Washington State Department of Licensing (DOL) lets you request a replacement for your own lost or stolen driver license or learner permit online through License Express, in person at a driver licensing office, or by phone at 360-902-3900. Update your address before requesting a replacement; DOL mails it to the address on file and cannot forward it. Online replacement is unavailable if the license expires within three months (renew instead), the license or permit is not valid, or you moved out of state. Online or phone replacements are limited to three per year. Consult the linked DOL page for current restrictions and fees. This guidance applies to Washington licenses and permits, not another state’s license or other identity documents.",
  },
];

export const supportKnowledge: SupportSource[] = [
  ...officialSources,
  ...guides.map((guide) => ({
    ...guide,
    href: `/support#${guide.id}`,
    kind: "site-guide" as const,
  })),
  ...recoveryNodes.map((node) => ({
    id: `workflow-${node.id}`,
    title: node.title,
    href: `/support#workflow-${node.id}`,
    kind: "illustrative" as const,
    summary: `${node.description} This is an illustrative planning step; confirm actual requirements with the responsible organization.`,
    content: `${node.description} The illustrative workflow lists these example records: ${node.requiredEvidence.join(", ")}. These are draft planning examples, not verified program requirements. Review the Roadmap for the recorded status and Intake to update information. Confirm actual requirements with the responsible organization.`,
  })),
];

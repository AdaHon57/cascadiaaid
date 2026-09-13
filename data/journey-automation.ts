import type { AutomationPlan } from "@/types/automation";

// Instructions identify the work, never eligibility, an available appointment,
// a legal finding, or a completed outcome. The runner finds the current process.
const plan = (
  mode: AutomationPlan["mode"],
  instruction: string,
  contextKeys: string[] = [],
): AutomationPlan => ({ mode, instruction, contextKeys });

export const journeyAutomation: Record<string, AutomationPlan> = {
  "temporary-housing": plan(
    "request",
    "Find the local emergency housing intake and submit a request for temporary accommodation. Ask about household placement needs. Do not book a paid stay or claim a placement is confirmed without an actual offer.",
    ["currentLocation", "placementNeeds", "householdSize"],
  ),
  "stable-housing": plan(
    "request",
    "Find the appropriate local housing agency or the household's chosen property manager and complete the housing application. Ask which program or property if there is more than one suitable choice. Do not execute a lease or pay an application fee.",
    ["currentLocation", "placementNeeds", "householdSize"],
  ),
  damage: plan(
    "document",
    "Organize the reviewed damage inventory and photographs into the household's damage packet.",
  ),
  identity: plan(
    "request",
    "Find the issuing authority for the specific lost document and complete its replacement request. Ask which document to replace first when several are missing. Hand off required identity checks, personal signatures, and payments.",
    ["lostTypes"],
  ),
  occupancy: plan(
    "document",
    "Assemble reviewed leases, utility bills, and ownership records into proof of occupancy. Identify missing issuer records without inventing them.",
  ),
  evidence: plan(
    "document",
    "Index the household's reviewed supporting records for reuse. Identify missing or conflicting information without inventing it.",
  ),
  claim: plan(
    "request",
    "Find the household's named insurer's official claim intake. Use an existing claim if one already exists; otherwise prepare and submit the loss notification. Never accept a settlement or change coverage.",
    ["insurerName", "claimReference", "claimSubmitted"],
  ),
  "claim-outcome": plan(
    "followup",
    "Locate the existing claim with the household's insurer and request or retrieve its status and decision. Do not file another claim or accept a settlement.",
    ["insurerName", "claimReference", "claimStatus"],
  ),
  assistance: plan(
    "request",
    "Find official assistance intake for the household's location and disaster. Ask the household to choose if multiple programs fit. Do not assume FEMA applies. Complete the selected intake; do not initiate a loan.",
    ["assistanceInterest", "affectedDate"],
  ),
  application: plan(
    "request",
    "Find the named program's official application and complete it. If no program is selected, identify options and ask the household to choose. Do not submit duplicate applications or initiate a loan.",
    ["assistanceInterest", "affectedDate"],
  ),
  review: plan(
    "followup",
    "Find the existing application at the named program. Retrieve its status or send a status request. Never start a new application.",
  ),
  appeal: plan(
    "followup",
    "Use the actual decision letter to locate its response process and deadline. Prepare and send the household's factual response when permitted. Hand off legal certifications or representations; do not invent grounds for an appeal.",
  ),
  funds: plan(
    "followup",
    "Use the existing program and application to check delivery of approved aid or services or send a delivery inquiry. Do not change banking details, authorize a financial transaction, or mark aid received based solely on approval.",
  ),
  hazards: plan(
    "request",
    "Find the responsible local environmental health authority or household-selected qualified provider. Submit a request for professional assessment/removal or the required authorization. Do not provide a professional finding, authorize paid work, or declare clearance.",
  ),
  cleanup: plan(
    "request",
    "Find local disaster debris-removal enrollment or the household's chosen cleanup provider. Complete the service request. Hand off property access waivers, contracts, and paid work authorization.",
  ),
  permits: plan(
    "request",
    "Identify the building authority for the affected property and the permit application for the specified work. Fill it using supplied plans and confirmed facts. Hand off professional certifications, signatures, and fee payment.",
    ["permitWork", "permitStatus"],
  ),
  rebuilding: plan(
    "request",
    "Find the household-selected repair assistance program or provider and submit a repair assistance or estimate request. Ask which provider or program if unspecified. Do not select a contractor, sign a construction contract, or apply for financing.",
    ["repairRole", "rebuild"],
  ),
  "safe-property": plan(
    "request",
    "Find the authority responsible for final inspection of the property and request an inspection using existing permit details. Do not claim occupancy is safe or approved; only the authority can confirm that.",
    ["inspectionDetails"],
  ),
  "tax-relief": plan(
    "request",
    "Find the assessor responsible for the affected property and its current disaster-damage reassessment application. Fill the household's factual request. Hand off personal certifications or legal signatures.",
    ["taxSeeking", "taxRequested"],
  ),
  "tax-determination": plan(
    "followup",
    "Find the assessor handling the existing relief request and retrieve the determination or send a status inquiry. Do not start a duplicate request or invent an appeal deadline.",
    ["taxDetermination", "taxAction"],
  ),
  "tax-outcome": plan(
    "followup",
    "Contact the assessor or tax collector responsible for the existing determination to check whether the adjustment or refund was implemented. Do not initiate a financial transaction or mark a refund received without evidence.",
    ["taxImplemented"],
  ),
};

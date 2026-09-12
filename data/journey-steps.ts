/** Plain-language actions for each goal; these are planning steps, not agency rules. */
export const journeySteps: Record<string, readonly [string, string, string]> = {
  "temporary-housing": [
    "Prepare your housing request",
    "Ask for a place that meets your needs",
    "Confirm your accommodation and move-in date",
  ],
  "stable-housing": [
    "Summarize your housing needs",
    "Review an offer and arrange your move",
    "Save your housing confirmation or lease",
  ],
  damage: [
    "Organize your photos and list of losses",
    "Check the damage summary for missing items",
    "Save the reviewed damage record",
  ],
  identity: [
    "Prepare your replacement request",
    "Request the missing documents from their issuer",
    "Confirm the replacement documents arrived",
  ],
  occupancy: [
    "Gather records showing where you lived",
    "Check the names and address on your records",
    "Confirm your proof of occupancy is ready",
  ],
  evidence: [
    "Organize your supporting documents",
    "Check the information on each document",
    "Confirm your documents are ready to reuse",
  ],
  claim: [
    "Prepare your claim materials",
    "Review and submit your claim to your insurer",
    "Save the claim receipt",
  ],
  "claim-outcome": [
    "Prepare a claim follow-up",
    "Ask your insurer to resolve the outstanding issue",
    "Record the payment or final decision",
  ],
  assistance: [
    "Summarize the help your household needs",
    "Discuss suitable programs with a recovery contact",
    "Save the options you reviewed",
  ],
  application: [
    "Prepare your application materials",
    "Review and submit through the program’s official process",
    "Save your submission receipt",
  ],
  review: [
    "Prepare a request for an update",
    "Ask the program for its decision and any conditions",
    "Save the decision",
  ],
  appeal: [
    "Prepare your response",
    "Review and send it through the program’s response process",
    "Save the resolution",
  ],
  funds: [
    "Prepare a payment or service follow-up",
    "Confirm delivery arrangements with the program",
    "Record the money or services received",
  ],
  hazards: [
    "Prepare a request for professional help",
    "Arrange a professional assessment and any required removal",
    "Save the professional completion record",
  ],
  cleanup: [
    "Prepare your cleanup request",
    "Arrange cleanup after required hazard work is complete",
    "Save the cleanup completion record",
  ],
  permits: [
    "Organize your plans and permit questions",
    "Confirm requirements and apply with the permitting office",
    "Save the issued permits",
  ],
  rebuilding: [
    "Summarize the repair work needed",
    "Arrange the work after required permits are issued",
    "Save the work completion record",
  ],
  "safe-property": [
    "Prepare your final inspection request",
    "Arrange required inspections with the responsible authority",
    "Save the final approval",
  ],
  "tax-relief": [
    "Prepare your tax-relief request",
    "Review and send the request to your county assessor",
    "Save the request receipt",
  ],
  "tax-determination": [
    "Prepare a request for the tax decision",
    "Ask the assessor about the decision and any follow-up",
    "Save the determination",
  ],
  "tax-outcome": [
    "Prepare an adjustment follow-up",
    "Ask the assessor to confirm the adjustment or refund",
    "Save the updated statement or refund record",
  ],
};

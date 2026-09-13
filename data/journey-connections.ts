export interface JourneyConnection {
  /** Include requests and their follow-ups in the Applications view. */
  applicationRelated: boolean;
  guidance: string;
  links: readonly { label: string; href: string }[];
}

// Official entry points checked 2026-09-12. Directories are labeled as directories,
// not submission portals. No household information is included in outbound URLs.
const housing = {
  label: "Find your local housing agency to apply for rental assistance",
  href: "https://www.hud.gov/contactus/public-housing-contacts",
};
const fema = {
  label: "Apply for FEMA disaster assistance",
  href: "https://www.disasterassistance.gov/",
};
const femaAccount = {
  label: "Open your FEMA application account",
  href: fema.href,
};
const sba = {
  label: "Check eligibility and apply for an SBA disaster loan",
  href: "https://lending.sba.gov/",
};
const localGovernment = {
  label: "Find your city or county office in the government directory",
  href: "https://www.usa.gov/local-governments",
};
const insuranceHelp = {
  label: "Find your state insurance department for claim help",
  href: "https://content.naic.org/state-insurance-departments",
};
const documents = {
  label: "Add or review your supporting documents",
  href: "/intake?stage=2",
};

/** Each roadmap node has an explicit request route or a document-only action. */
export const journeyConnections: Record<string, JourneyConnection> = {
  "temporary-housing": {
    applicationRelated: true,
    guidance:
      "For a place to stay now, contact local housing services. FEMA housing assistance depends on the declared disaster and your eligibility.",
    links: [
      { label: "Call 211 for emergency housing referrals", href: "tel:211" },
      {
        label: "Find shelters and temporary housing options",
        href: "https://www.usa.gov/disaster-housing-shelter",
      },
      fema,
    ],
  },
  "stable-housing": {
    applicationRelated: true,
    guidance:
      "Contact the housing agency serving the area where you want to live for its application process and waiting-list availability. For a private rental, apply directly with the property manager.",
    links: [housing],
  },
  damage: {
    applicationRelated: false,
    guidance:
      "This step organizes evidence. Attach the reviewed records when your insurer or assistance program requests them.",
    links: [documents],
  },
  identity: {
    applicationRelated: true,
    guidance: "Choose the missing document to find the issuing agency’s replacement process.",
    links: [
      {
        label: "Find official ID and vital-record replacement applications",
        href: "https://www.usa.gov/replace-vital-documents",
      },
    ],
  },
  occupancy: {
    applicationRelated: false,
    guidance:
      "Request a copy of your lease, utility bill, or property record from its issuer, then save it here for the program that needs it.",
    links: [documents, localGovernment],
  },
  evidence: {
    applicationRelated: false,
    guidance:
      "Review your reusable documents here, then supply them through the receiving program’s process.",
    links: [documents],
  },
  claim: {
    applicationRelated: true,
    guidance:
      "Submit through the claims website or phone number on your insurance policy. Your state insurance department can help you locate or resolve problems with that process; it does not receive your initial claim.",
    links: [documents, insuranceHelp],
  },
  "claim-outcome": {
    applicationRelated: true,
    guidance:
      "Use your insurer’s existing claim and claim reference for follow-up. Contact your state insurance department if you need help with a dispute.",
    links: [insuranceHelp],
  },
  assistance: {
    applicationRelated: true,
    guidance:
      "Review programs for your location and needs. FEMA assistance, housing assistance, and SBA loans have separate eligibility and application processes. SBA loans must be repaid.",
    links: [fema, housing, sba],
  },
  application: {
    applicationRelated: true,
    guidance:
      "Choose the program you are applying to. These are separate application routes; SBA disaster assistance is a loan that must be repaid. For another organization, use the official process provided by that organization.",
    links: [fema, housing, sba],
  },
  review: {
    applicationRelated: true,
    guidance:
      "Follow up through the program where you submitted. Use your existing application number; the FEMA and SBA accounts below are only for those programs.",
    links: [femaAccount, { label: "Check your SBA loan application", href: sba.href }, housing],
  },
  appeal: {
    applicationRelated: true,
    guidance:
      "Use the response or appeal instructions in your decision letter, including its deadline and submission destination. For FEMA, access your existing application account.",
    links: [femaAccount],
  },
  funds: {
    applicationRelated: true,
    guidance:
      "Contact the program that approved your money or services to confirm delivery. Use the existing application rather than starting another request for the same assistance.",
    links: [femaAccount, { label: "Manage your SBA disaster loan", href: sba.href }, housing],
  },
  hazards: {
    applicationRelated: true,
    guidance:
      "Find the environmental health or building office for the affected property and ask where to request assessment or removal services and any required authorization.",
    links: [localGovernment],
  },
  cleanup: {
    applicationRelated: true,
    guidance:
      "Ask the affected city or county about debris-removal enrollment, property access forms, and available cleanup services.",
    links: [localGovernment],
  },
  permits: {
    applicationRelated: true,
    guidance:
      "Locate the building or planning department for the affected property, then use its permit application process. This directory helps locate the office; it does not submit a permit.",
    links: [localGovernment],
  },
  rebuilding: {
    applicationRelated: true,
    guidance:
      "For repair funding, check the assistance programs below. SBA funding is a loan that must be repaid. Arrange the work separately with your chosen provider and confirm local permit requirements.",
    links: [fema, sba, localGovernment],
  },
  "safe-property": {
    applicationRelated: true,
    guidance:
      "Contact the building or inspection office responsible for your property to request final inspections and any required occupancy approval.",
    links: [localGovernment],
  },
  "tax-relief": {
    applicationRelated: true,
    guidance:
      "Find the assessor for the affected property and ask for the applicable disaster-damage reassessment or property-tax relief application and deadline.",
    links: [localGovernment],
  },
  "tax-determination": {
    applicationRelated: true,
    guidance:
      "Contact the assessor handling your request. Follow the decision notice for any review or appeal process and deadline.",
    links: [localGovernment],
  },
  "tax-outcome": {
    applicationRelated: true,
    guidance:
      "Follow up with the assessor or tax collection office named in your determination to check the adjustment or refund.",
    links: [localGovernment],
  },
};

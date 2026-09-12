/**
 * THE SOURCE ALLOWLIST.
 *
 * This is the single place that decides which web pages the RAG system may use.
 * - Only these exact URLs are downloaded. Links found on these pages are never followed.
 * - At question time, any indexed chunk whose URL is no longer listed here is ignored,
 *   so removing a source takes effect immediately (rebuild the index to add one).
 *
 * To change the knowledge base: edit this list, then run `npm run rag:index`.
 *
 * `id` must be unique and stable; it prefixes chunk IDs.
 * `extraction` is optional per-page cleanup on top of the generic rules in ingest/scrape.ts.
 */
import type { ApprovedSource } from "./types.ts";

export const APPROVED_SOURCES: readonly ApprovedSource[] = [
  {
    id: "spokane-complex-fires-resource-guide",
    url: "https://www.spokanecounty.gov/m/newsflash/home/detail/6212",
  },
  {
    id: "spokane-county-home",
    url: "https://www.spokanecounty.gov/",
    extraction: {
      // Homepage widgets unrelated to wildfire recovery (news teasers, events, spotlights).
      removeSelectors: [".widgetNewsFlash"],
      dropSectionHeadings: [
        "Popular Resources",
        "Current News & Topics",
        "Meetings & Events",
        "County Spotlights",
        "County Commissioners",
      ],
    },
  },
  {
    id: "epa-eastern-wa-wildfires-recovery",
    url: "https://www.epa.gov/wa/2026-eastern-washington-wildfires-recovery",
    extraction: {
      removeSelectors: [".l-sidebar__sidebar", ".box--news", ".l-page__footer"],
    },
  },
  {
    id: "spokane-fire-debris-disposal",
    url: "https://www.spokanecounty.gov/5447/Fire-Debris-Disposal",
    extraction: {
      removeSelectors: ["#FormCenterContent"],
    },
  },
  {
    id: "oic-steps-after-home-damage",
    url: "https://www.insurance.wa.gov/insurance-resources/natural-disasters/disaster-recovery/steps-take-after-home-damage-or-loss",
    extraction: {
      // "Related topics" teasers summarize other (non-approved) pages.
      removeSelectors: [".block-views-blockfeatured-content-block-1"],
    },
  },
  {
    id: "dol-wildfire-relief",
    url: "https://dol.wa.gov/wildfire-relief",
  },
  {
    id: "dor-destroyed-property",
    url: "https://dor.wa.gov/taxes-rates/property-tax/destroyed-property",
    extraction: {
      removeSelectors: ["#more-info-button"],
    },
  },
  {
    id: "dshs-disaster-cash-assistance",
    url: "https://www.dshs.wa.gov/node/1848",
    extraction: {
      removeSelectors: [".book-navigation", ".book_printer"],
    },
  },
];

const APPROVED_URLS = new Set(APPROVED_SOURCES.map((s) => s.url));

export function isApprovedSourceUrl(url: string): boolean {
  return APPROVED_URLS.has(url);
}

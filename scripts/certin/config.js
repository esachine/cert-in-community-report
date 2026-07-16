// Shared configuration and paths for the CERT-In community brief pipeline.
// CERT-In is the ONLY data source. Every item links back to its official page.

import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// project root = two levels up from scripts/certin/
export const ROOT = path.resolve(__dirname, "..", "..");

export const DATA_DIR = path.join(ROOT, "data");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const PUBLIC_DATA_DIR = path.join(PUBLIC_DIR, "data");

export const PATHS = {
  seen: path.join(DATA_DIR, "seen_ids.json"),
  catalog: path.join(DATA_DIR, "catalog.json"),
  latest: path.join(DATA_DIR, "latest.json"),
  html: path.join(PUBLIC_DIR, "threat-brief.html"),
  aboutHtml: path.join(PUBLIC_DIR, "about.html"),
  briefJson: path.join(PUBLIC_DATA_DIR, "brief.json"),
};

export const BASE = "https://www.cert-in.org.in/s2cMainServlet";
export const USER_AGENT =
  "CertCommunityBrief/1.0 (+community; CERT-In public pages only)";

// Politeness / reliability
export const REQUEST_DELAY_MS = 1000;
export const REQUEST_TIMEOUT_MS = 60000;
export const MAX_RETRIES = 2;

// Regex to detect CERT-In document IDs on list/detail pages.
export const ID_RE = /\b(CIAD|CIVN|CICA)-\d{4}-\d{4}\b/g;

// Item type metadata.
export const TYPE_LABELS = {
  CIAD: "Advisory",
  CIVN: "Vulnerability Note",
  CICA: "Current Activity",
};

/**
 * Source list pages. We deliberately use ONLY the CERT-In homepage panel
 * (PUBWEL01), which renders the "Latest Security Alert" (CIVN/CIAD) and
 * "Current Activities" (CICA) lists. This keeps the brief to the current,
 * curated set CERT-In is highlighting - not the full year archive.
 * @param {number} [year] kept for signature compatibility (unused)
 * @returns {{name: string, url: string}[]}
 */
export function listUrls(year) {
  return [{ name: "homepage", url: `${BASE}?pageid=PUBWEL01` }];
}

/**
 * Build the detail-page URL for a given CERT-In ID.
 * CIAD -> PUBVLNOTES02, CIVN -> PUBVLNOTES01, CICA -> PUBADV01.
 * @param {string} id
 * @returns {string}
 */
export function detailUrl(id) {
  const prefix = id.split("-", 1)[0];
  if (prefix === "CIAD") return `${BASE}?pageid=PUBVLNOTES02&VLCODE=${id}`;
  if (prefix === "CIVN") return `${BASE}?pageid=PUBVLNOTES01&VLCODE=${id}`;
  if (prefix === "CICA") return `${BASE}?pageid=PUBADV01&CACODE=${id}`;
  throw new Error(`Unknown CERT-In ID type: ${id}`);
}

// Parsing layer: turn CERT-In detail HTML into structured fields.
// Extracts the labeled sections CERT-In consistently uses so the community
// page can show real explanation, impact and actions - not just a title.

import { detailUrl } from "./config.js";

/**
 * Convert HTML to normalized plain text (drops script/style, collapses space).
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  // decode a few common entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\uFFFD/g, "-"); // replacement char seen in some CERT-In pages
  return text.replace(/\s+/g, " ").trim();
}

const SEVERITY_RE =
  /Severity\s*Rating\s*:?\s*(Critical|High|Medium|Low)/i;
const DATE_RE =
  /Original\s+Issue\s+Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i;

// Section labels in the order they generally appear on a CERT-In page.
// Each becomes a boundary; content is the text until the next boundary.
const SECTION_LABELS = [
  { key: "softwareAffected", patterns: ["Software Affected", "Systems Affected"] },
  { key: "overview", patterns: ["Overview"] },
  { key: "targetAudience", patterns: ["Target Audience"] },
  { key: "riskAssessment", patterns: ["Risk Assessment"] },
  { key: "impactAssessment", patterns: ["Impact Assessment"] },
  { key: "description", patterns: ["Description"] },
  { key: "recommendations", patterns: ["Recommendations", "Best practices", "Best Practices"] },
  { key: "solution", patterns: ["Solution"] },
  { key: "vendorInformation", patterns: ["Vendor Information"] },
  { key: "references", patterns: ["References"] },
  // Trailing boundaries so the last real section stops cleanly.
  { key: "_disclaimer", patterns: ["Disclaimer"] },
  { key: "_contact", patterns: ["Contact Information"] },
];

/**
 * Find the first index of any label variant in the text (case-insensitive).
 * Returns {index, label} or null.
 */
function findLabel(text, patterns) {
  let best = null;
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx !== -1 && (best === null || idx < best.index)) {
      best = { index: idx, label: p };
    }
  }
  return best;
}

/**
 * Extract labeled sections from a CERT-In detail text blob.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function extractSections(text) {
  // Locate every present label with its position.
  const marks = [];
  for (const { key, patterns } of SECTION_LABELS) {
    const hit = findLabel(text, patterns);
    if (hit) marks.push({ key, index: hit.index, label: hit.label });
  }
  marks.sort((a, b) => a.index - b.index);

  const sections = {};
  for (let i = 0; i < marks.length; i++) {
    const cur = marks[i];
    if (cur.key.startsWith("_")) continue; // boundary-only markers
    const start = cur.index + cur.label.length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    let value = text.slice(start, end).replace(/^[:\-\s]+/, "").trim();
    if (value) sections[cur.key] = value;
  }
  return sections;
}

/**
 * Derive a clean title for the item from its detail text.
 * @param {string} id
 * @param {string} text
 * @returns {string}
 */
export function extractTitle(id, text) {
  const type = id.split("-", 1)[0];
  if (type === "CIAD") {
    const m = text.match(
      /CERT-In\s+Advisor(?:y|ies)\s+CIAD-\d{4}-\d{4}\s+(.+?)\s+Original\s+Issue\s+Date/i
    );
    if (m) return m[1].trim();
  }
  if (type === "CIVN") {
    const m = text.match(
      /CERT-In\s+Vulnerability\s+Note\s+CIVN-\d{4}-\d{4}\s+(.+?)\s+Original\s+Issue\s+Date/i
    );
    if (m) return m[1].trim();
  }
  if (type === "CICA") {
    const m = text.match(
      /CURRENT\s+ACTIVITIES\s+(.+?)\s+Original\s+Issue\s+Date/i
    );
    if (m) return stripActivitiesPrefix(m[1].trim());
  }
  // Fallback: text right before "Original Issue Date"
  const generic = text.match(/([^.|]{6,120}?)\s+Original\s+Issue\s+Date/i);
  return generic ? stripActivitiesPrefix(generic[1].trim()) : id;
}

function stripActivitiesPrefix(title) {
  return title.replace(/^CURRENT\s+ACTIVITIES\s+/i, "").trim();
}

// Boundary labels that end a CICA free-text body.
const CICA_BODY_END = [
  "Best practices",
  "Best Practices",
  "Recommendations",
  "Exposed Information",
  "Impact",
  "References",
  "Disclaimer",
  "Contact Information",
];

/**
 * CICA (current activity) pages hold their main text as free prose after the
 * issue date, not under an "Overview" label. Extract that body.
 * @param {string} text
 * @param {string|null} dateStr
 * @returns {string}
 */
export function extractCicaBody(text, dateStr) {
  let start = -1;
  if (dateStr) {
    const idx = text.indexOf(dateStr);
    if (idx !== -1) start = idx + dateStr.length;
  }
  if (start === -1) {
    const m = text.match(/Original\s+Issue\s+Date\s*:?\s*/i);
    if (m) start = (m.index ?? 0) + m[0].length;
  }
  if (start === -1) return "";

  let end = text.length;
  for (const label of CICA_BODY_END) {
    const idx = text.indexOf(label, start);
    if (idx !== -1 && idx < end) end = idx;
  }
  return text.slice(start, end).replace(/^[:\-\s]+/, "").trim();
}

/**
 * Parse a fetched detail page into a structured raw record.
 * @param {{id: string, url: string, html: string}} detail
 * @returns {object}
 */
export function parseDetail({ id, url, html }) {
  const text = htmlToText(html);
  const type = id.split("-", 1)[0];
  const title = extractTitle(id, text);
  const sevMatch = text.match(SEVERITY_RE);
  const dateMatch = text.match(DATE_RE);
  const date = dateMatch ? dateMatch[1].trim() : null;
  const sections = extractSections(text);

  // CICA pages keep their body as free prose; lift it into "overview".
  if (type === "CICA" && !sections.overview) {
    const body = extractCicaBody(text, date);
    if (body) sections.overview = body;
  }

  return {
    id,
    type,
    title,
    date,
    severity: sevMatch
      ? sevMatch[1][0].toUpperCase() + sevMatch[1].slice(1).toLowerCase()
      : null,
    source_url: url || detailUrl(id),
    sections,
    fetched_at: new Date().toISOString(),
  };
}

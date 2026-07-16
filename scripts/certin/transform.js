// Transform layer: convert parsed CERT-In sections into community-friendly
// fields (priority, who is affected, what it means, what to do, category).
// We only condense/reorganize official CERT-In text - we do not invent facts.

/**
 * Split a block of text into clean sentence-like bullet points.
 * Handles numbered lists ("1. ... 2. ...") and plain prose.
 * @param {string} text
 * @param {number} max
 * @returns {string[]}
 */
export function toBullets(text, max = 6) {
  if (!text) return [];
  let cleaned = text.replace(/\s+/g, " ").trim();

  // Prefer numbered items if present (e.g. "1. Foo 2. Bar").
  const numbered = cleaned.split(/\s(?=\d{1,2}\.\s+[A-Z])/);
  let parts;
  if (numbered.length > 2) {
    parts = numbered.map((s) => s.replace(/^\d{1,2}\.\s*/, ""));
  } else {
    // Otherwise split on sentence boundaries.
    parts = cleaned.split(/(?<=[.:])\s+(?=[A-Z])/);
  }

  const bullets = [];
  for (let part of parts) {
    part = part.trim().replace(/[:\s]+$/, "");
    if (part.length < 12) continue; // drop fragments/labels
    if (/^[a-z]/.test(part)) continue; // starts lowercase -> mid-sentence fragment
    if (/^(For|References|Disclaimer|Contact)\b/i.test(part) && part.length < 20)
      continue;
    // Drop intro/heading sentences that only announce a list follows.
    if (
      /(follow (these|the following)|should implement the following|these (security )?(best )?practices|following (security )?(best )?practices)/i.test(
        part
      )
    )
      continue;
    bullets.push(part.endsWith(".") ? part : part + ".");
    if (bullets.length >= max) break;
  }
  return bullets;
}

/**
 * Condense a block into 1-2 plain sentences.
 * @param {string} text
 * @returns {string}
 */
export function condense(text, maxChars = 320) {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.])\s+(?=[A-Z])/);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > maxChars && out) break;
    out = (out + " " + s).trim();
  }
  return out || cleaned.slice(0, maxChars);
}

/**
 * Decide a priority tier for sorting/grouping.
 * @param {{type: string, severity: string|null}} item
 * @returns {"act-now"|"this-week"|"awareness"}
 */
export function priorityTier(item) {
  const sev = (item.severity || "").toLowerCase();
  if (sev === "critical") return "act-now";
  if (sev === "high") return "this-week";
  if (item.type === "CICA") return "this-week"; // active campaigns matter
  return "awareness";
}

const CATEGORY_RULES = [
  { category: "Operating systems", re: /\b(windows|macos|ios|ipados|android|linux|kernel|pan-os|fortios)\b/i },
  { category: "Web browsers", re: /\b(chrome|firefox|mozilla|safari|edge|browser)\b/i },
  { category: "Network & security gear", re: /\b(fortinet|fortigate|cisco|ivanti|vpn|firewall|sonicwall|palo alto)\b/i },
  { category: "Websites & CMS", re: /\b(wordpress|drupal|joomla|pagebuilder|cms|magento)\b/i },
  { category: "Enterprise software", re: /\b(microsoft|oracle|sap|adobe|atlassian|vmware|apache)\b/i },
  { category: "Developer & supply chain", re: /\b(npm|pypi|package|supply chain|github|open-source|open source)\b/i },
  { category: "Scams & campaigns", re: /\b(whatsapp|phishing|malware campaign|scam|deepfake|credential)\b/i },
];

/**
 * Guess a human category from the title.
 * @param {string} title
 * @param {string} type
 * @returns {string}
 */
export function categorize(title, type) {
  const t = title || "";
  for (const { category, re } of CATEGORY_RULES) {
    if (re.test(t)) return category;
  }
  if (type === "CICA") return "Scams & campaigns";
  return "Other software";
}

/**
 * Build the community-facing view of a parsed item.
 * @param {object} parsed  output of parseDetail
 * @returns {object}
 */
export function transformItem(parsed) {
  const s = parsed.sections || {};

  const overview = s.overview || s.description || "";
  const whoRaw = s.targetAudience || s.softwareAffected || "";
  const actionsRaw = s.recommendations || s.solution || "";

  const whatItMeans = condense(overview);
  const whoAffected = condense(whoRaw, 200);
  const whatToDo = toBullets(actionsRaw, 6);

  // Fallback action if CERT-In gave only a vendor link / solution sentence.
  if (whatToDo.length === 0 && s.solution) {
    whatToDo.push(condense(s.solution, 200));
  }

  const clean = (v) => {
    if (!v) return null;
    const t = String(v).replace(/\s+/g, " ").trim();
    return t.length ? t : null;
  };

  return {
    id: parsed.id,
    type: parsed.type,
    title: parsed.title,
    date: parsed.date,
    severity: parsed.severity,
    source_url: parsed.source_url,
    priority: priorityTier(parsed),
    category: categorize(parsed.title, parsed.type),
    whoAffected,
    whatItMeans,
    whatToDo,
    softwareAffected: s.softwareAffected || s.systemsAffected || null,
    // Full official CERT-In sections, cleaned but not condensed, so the page
    // can present a faithful document-style explanation of each item.
    sections: {
      softwareAffected: clean(s.softwareAffected || s.systemsAffected),
      overview: clean(s.overview),
      targetAudience: clean(s.targetAudience),
      riskAssessment: clean(s.riskAssessment),
      impactAssessment: clean(s.impactAssessment),
      description: clean(s.description),
      recommendations: clean(s.recommendations),
      solution: clean(s.solution),
      references: clean(s.references),
    },
    fetched_at: parsed.fetched_at,
  };
}

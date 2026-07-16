// Render layer: build a clean, professional, document-style threat-brief.html
// plus a machine-readable brief.json from the catalog. Vanilla HTML/CSS/JS.
//
// The page mirrors the CERT-In homepage structure: two groups -
// "Latest Security Alerts" (CIVN/CIAD) and "Current Activities" (CICA) -
// each sorted newest-first, with each item shown as a faithful document.

import fs from "node:fs";
import { PATHS, TYPE_LABELS } from "./config.js";
import { loadCatalog, loadLatest, ensurePublicDataDir } from "./store.js";

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SEV_META = {
  critical: { label: "Critical", cls: "crit", order: 0 },
  high: { label: "High", cls: "high", order: 1 },
  medium: { label: "Medium", cls: "med", order: 2 },
  low: { label: "Low", cls: "low", order: 3 },
};

function sevSlug(sev) {
  const s = (sev || "").toLowerCase().trim();
  return SEV_META[s] ? s : "none";
}

const URL_RE = /https?:\/\/[^\s<>()]+/g;

function stripTrailingPunct(u) {
  return u.replace(/[.,;:)\]}'"]+$/g, "");
}

function linkLabel(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    let last = segs.length ? segs[segs.length - 1] : "";
    last = last.replace(/\.(html?|php|aspx?|jsp)$/i, "").replace(/[?#].*$/, "");
    if (last && last.length >= 3 && last.length <= 42) return last;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Escape text and turn any embedded URLs into short, readable links inline.
function linkifyInline(text) {
  const raw = String(text || "");
  let out = "";
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(raw)) !== null) {
    const idx = m.index;
    out += escapeHtml(raw.slice(last, idx));
    const clean = stripTrailingPunct(m[0]);
    out += `<a href="${escapeHtml(clean)}" target="_blank" rel="noopener">${escapeHtml(
      linkLabel(clean)
    )}</a>`;
    const trailing = m[0].slice(clean.length);
    if (trailing) out += escapeHtml(trailing);
    last = idx + m[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

// References section: render the URLs as a clean list of links.
function renderReferences(text) {
  const urls = [
    ...new Set((String(text || "").match(URL_RE) || []).map(stripTrailingPunct)),
  ];
  if (!urls.length) return linkifyInline(text);
  return `<ul class="refs">${urls
    .map(
      (u) =>
        `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(
          u.replace(/^https?:\/\//, "")
        )}</a></li>`
    )
    .join("")}</ul>`;
}

function parseDate(item) {
  const t = Date.parse(item.date || "");
  return Number.isNaN(t) ? 0 : t;
}

// Newest first, then most severe.
function sortByDate(items) {
  return [...items].sort((a, b) => {
    const d = parseDate(b) - parseDate(a);
    if (d !== 0) return d;
    const sa = SEV_META[sevSlug(a.severity)]?.order ?? 4;
    const sb = SEV_META[sevSlug(b.severity)]?.order ?? 4;
    return sa - sb;
  });
}

function section(label, html) {
  if (!html) return "";
  return `<div class="sec"><h4>${escapeHtml(label)}</h4><div class="sec-body">${html}</div></div>`;
}

function para(text) {
  return text ? `<p>${linkifyInline(text)}</p>` : "";
}

// Render guidance text: if CERT-In numbered it ("1. ... 2. ..."), show a clean
// ordered list; otherwise fall back to a paragraph.
function renderGuidance(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s(?=\d{1,2}\.\s)/);
  if (parts.length > 2) {
    return `<ol class="steps">${parts
      .map((p) => `<li>${linkifyInline(p.replace(/^\d{1,2}\.\s*/, ""))}</li>`)
      .join("")}</ol>`;
  }
  return para(cleaned);
}

function renderItem(item, isNew) {
  const sec = item.sections || {};
  const type = TYPE_LABELS[item.type] || item.type;
  const slug = sevSlug(item.severity);
  const sevLabel = SEV_META[slug]?.label || "Not rated";
  const sevCls = SEV_META[slug]?.cls || "none";

  const dataStr = escapeHtml(
    [item.id, item.title, item.category, item.severity, type, sec.softwareAffected]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  );

  // Choose overview text; avoid repeating it as Description.
  const overview = sec.overview || sec.description || "";
  const showDescription =
    sec.description && sec.description !== overview ? sec.description : "";

  // Shown up front (the gist).
  const summary = section("What happened", para(overview));

  // Revealed on "View more".
  const details = [
    section("Software affected", para(sec.softwareAffected)),
    section("Who is affected", para(sec.targetAudience)),
    section("Risk", para(sec.riskAssessment)),
    section("Potential impact", para(sec.impactAssessment)),
    section("Details", para(showDescription)),
    section(
      "What to do",
      sec.solution || sec.recommendations
        ? para(sec.solution) + renderGuidance(sec.recommendations)
        : ""
    ),
    section("References", sec.references ? renderReferences(sec.references) : ""),
  ]
    .filter(Boolean)
    .join("");

  const newBadge = isNew ? `<span class="new">New</span>` : "";

  const more = details
    ? `<details class="more"><summary><span class="more-label"></span></summary>
        <div class="more-body">${details}</div></details>`
    : "";

  return `
      <article class="item lv-${sevCls}" data-sev="${slug === "none" ? "" : slug}" data-search="${dataStr}">
        <div class="item-head">
          <a class="doc-id" href="${escapeHtml(
            item.source_url
          )}" target="_blank" rel="noopener">${escapeHtml(item.id)}</a>
          <span class="doc-type">${escapeHtml(type)}</span>
          ${newBadge}
          <span class="doc-date">${escapeHtml(item.date || "")}</span>
        </div>
        <h3 class="item-title">${escapeHtml(item.title)}</h3>
        <p class="item-sev">Severity: <span class="sev sev-${sevCls}">${escapeHtml(
    sevLabel
  )}</span></p>
        ${summary}
        ${more}
        <p class="item-src"><a href="${escapeHtml(
          item.source_url
        )}" target="_blank" rel="noopener">View the official CERT-In page</a></p>
      </article>`;
}

function renderGroup(id, title, items, newIds) {
  if (!items.length) return "";
  const body = sortByDate(items)
    .map((it) => renderItem(it, newIds.has(it.id)))
    .join("\n");
  return `
      <section class="group" data-group="${id}">
        <h2 class="group-title">${escapeHtml(title)} <span class="count">(${items.length})</span></h2>
        <div class="group-list">
${body}
        </div>
      </section>`;
}

function buildHtml(catalog, latest) {
  const all = catalog.items || [];
  const lastCheck = latest.checked_at
    ? escapeHtml(latest.checked_at.replace("T", " ").slice(0, 16)) + " UTC"
    : "\u2014";

  const showNew = latest.mode === "delta";
  const newIds = new Set(showNew ? latest.new_ids || [] : []);

  // Only Latest Security Alerts (Vulnerability Notes + Advisories).
  const items = all.filter((i) => i.type === "CIAD" || i.type === "CIVN");

  const groups = renderGroup("alerts", "Latest Security Alerts", items, newIds);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CERT-In Community Threat Brief</title>
<meta name="description" content="Plain-language cybersecurity threat brief for India, built from official CERT-In advisories." />
<style>
  :root{
    --bg:#ffffff;--panel:#ffffff;--soft:#f6f7f8;--line:#e4e7e9;
    --ink:#1c2124;--muted:#61696f;--link:#0b5c8f;
    --crit:#b3261e;--high:#9a6100;--med:#345b73;--low:#3f6b45;
    --maxw:820px;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"Segoe UI",Roboto,system-ui,-apple-system,sans-serif;
    line-height:1.6;font-size:16px;overflow-wrap:break-word}
  a{color:var(--link);text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 1.15rem}

  header.hero{padding:2.2rem 0 1.1rem;border-bottom:1px solid var(--line)}
  .kicker{font-size:.76rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .hero h1{margin:.45rem 0 .5rem;font-size:clamp(1.5rem,3.5vw,2rem);letter-spacing:-.01em;font-weight:700}
  .hero p.lead{margin:0;color:var(--muted);max-width:46rem}
  .meta{margin-top:.9rem;font-size:.82rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:.3rem 1.2rem}
  .meta strong{color:var(--ink);font-weight:600}
  .note{margin-top:.9rem;font-size:.8rem;color:var(--muted);border-left:3px solid var(--line);padding:.15rem 0 .15rem .8rem}

  .toolbar{position:sticky;top:0;z-index:5;background:var(--bg);
    padding:.9rem 0;border-bottom:1px solid var(--line);margin-bottom:.4rem}
  .toolbar input{width:100%;background:var(--panel);color:var(--ink);
    border:1px solid var(--line);border-radius:8px;padding:.6rem .75rem;font-size:.95rem}
  .toolbar input:focus{outline:none;border-color:var(--link)}
  .result-count{color:var(--muted);font-size:.8rem;margin:.5rem 0 0}

  .group{margin:1.8rem 0}
  .group-title{font-size:1.15rem;font-weight:700;margin:0 0 1rem;
    padding-bottom:.5rem;border-bottom:2px solid var(--ink)}
  .group-title .count{color:var(--muted);font-weight:500;font-size:.9rem}
  .group-list{display:flex;flex-direction:column;gap:1.1rem}

  .item{border:1px solid var(--line);border-left:3px solid var(--line);
    border-radius:8px;padding:1.15rem 1.25rem;background:var(--panel)}
  .item.lv-crit{border-left-color:var(--crit)}
  .item.lv-high{border-left-color:var(--high)}
  .item.lv-med{border-left-color:var(--med)}
  .item.lv-low{border-left-color:var(--low)}

  .item-head{display:flex;flex-wrap:wrap;align-items:center;gap:.55rem;
    font-size:.8rem;color:var(--muted)}
  .doc-id{font-family:Consolas,"Courier New",monospace;font-weight:700;font-size:.8rem}
  .doc-type{background:var(--soft);border:1px solid var(--line);border-radius:5px;
    padding:.05rem .45rem;font-size:.72rem}
  .doc-date{margin-left:auto}
  .new{background:#0b5c8f;color:#fff;border-radius:5px;padding:.05rem .4rem;
    font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}

  .item-title{margin:.55rem 0 .35rem;font-size:1.14rem;font-weight:700;line-height:1.35}
  .item-sev{margin:0 0 .8rem;font-size:.84rem;color:var(--muted)}
  .item-sev .sev{font-weight:700}
  .sev-crit{color:var(--crit)} .sev-high{color:var(--high)}
  .sev-med{color:var(--med)} .sev-low{color:var(--low)} .sev-none{color:var(--muted)}

  .sec{margin:.7rem 0}
  .sec h4{margin:0 0 .15rem;font-size:.74rem;font-weight:700;letter-spacing:.05em;
    text-transform:uppercase;color:var(--muted)}
  .sec-body p{margin:0 0 .5rem;font-size:.93rem}
  .sec-body p:last-child{margin-bottom:0}
  .refs{margin:.1rem 0 0;padding-left:1.15rem}
  .refs li{font-size:.86rem;margin-bottom:.3rem;overflow-wrap:anywhere}
  .steps{margin:.2rem 0 0;padding-left:1.3rem}
  .steps li{font-size:.9rem;margin-bottom:.4rem}

  .more{margin:.4rem 0 0}
  .more>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:.35rem;
    color:var(--link);font-weight:600;font-size:.86rem;padding:.35rem 0}
  .more>summary::-webkit-details-marker{display:none}
  .more>summary::before{content:"\\25B8";font-size:.8em}
  .more[open]>summary::before{content:"\\25BE"}
  .more>summary .more-label::after{content:"View more details"}
  .more[open]>summary .more-label::after{content:"Show less"}
  .more-body{margin-top:.3rem;padding-top:.5rem;border-top:1px dashed var(--line)}

  .item-src{margin:.9rem 0 0;padding-top:.7rem;border-top:1px solid var(--line);font-size:.85rem}

  .empty{color:var(--muted);padding:2.5rem 0;text-align:center}
  footer{color:var(--muted);font-size:.82rem;padding:2rem 0 3rem;border-top:1px solid var(--line);margin-top:2.5rem}
  footer a{font-weight:600}

  @media (max-width:640px){
    body{font-size:15px}
    .item{padding:1rem 1rem}
    .doc-date{margin-left:0;width:100%}
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <p class="kicker">Community Threat Brief</p>
      <h1>CERT-In advisories, explained</h1>
      <p class="lead">A clean, plain-language view of the latest security alerts
        that India's CERT-In is highlighting right now.</p>
      <div class="meta">
        <span>Source: <strong>cert-in.org.in</strong> only</span>
        <span>Last updated: <strong>${lastCheck}</strong></span>
        <span>Items: <strong>${items.length}</strong></span>
      </div>
      <p class="note">A community project that reorganizes public CERT-In advisories for clarity.
        Not an official CERT-In publication &mdash; confirm details on the linked official page before acting.</p>
    </header>

    <div class="toolbar">
      <input id="search" type="search" placeholder="Search by product, ID or keyword..." aria-label="Search advisories" />
      <p class="result-count"><span id="shown">${items.length}</span> of ${items.length} items shown</p>
    </div>

    <main id="main">
${groups || '<p class="empty">No items available. Run the build to fetch from CERT-In.</p>'}
      <p class="empty" id="empty" hidden>No items match your search.</p>
    </main>

    <footer>
      <p>Community Threat Brief &middot; Data sourced only from
        <a href="https://www.cert-in.org.in/s2cMainServlet?pageid=PUBWEL01" target="_blank" rel="noopener">CERT-In</a>.
        Learn <a href="/about">how this works</a>.</p>
      <p>Machine-readable data: <a href="/data/brief.json">brief.json</a></p>
    </footer>
  </div>

<script>
(function(){
  var search=document.getElementById('search');
  var items=Array.prototype.slice.call(document.querySelectorAll('.item'));
  var groups=Array.prototype.slice.call(document.querySelectorAll('.group'));
  var empty=document.getElementById('empty');
  var shownEl=document.getElementById('shown');
  function apply(){
    var q=(search.value||'').toLowerCase().trim();
    var shown=0;
    items.forEach(function(it){
      var vis=!q||(it.getAttribute('data-search')||'').indexOf(q)!==-1;
      it.style.display=vis?'':'none';
      if(vis)shown++;
    });
    groups.forEach(function(g){
      var any=g.querySelectorAll('.item:not([style*="display: none"])').length>0;
      g.style.display=any?'':'none';
    });
    if(shownEl)shownEl.textContent=shown;
    empty.hidden=shown!==0;
  }
  search.addEventListener('input',apply);
})();
</script>
</body>
</html>
`;
}

function buildJson(catalog, latest) {
  return {
    generated_at: new Date().toISOString(),
    source: "https://www.cert-in.org.in/",
    disclaimer:
      "Community brief. Data reorganized from public CERT-In advisories. Not an official CERT-In publication.",
    last_check: latest.checked_at || null,
    new_count: latest.new_count || 0,
    count: (catalog.items || []).length,
    items: sortByDate(catalog.items || []),
  };
}

/**
 * Render both artifacts. Returns the paths written.
 * @returns {{html: string, json: string, count: number}}
 */
export function render() {
  const catalog = loadCatalog();
  const latest = loadLatest();
  ensurePublicDataDir();
  fs.writeFileSync(PATHS.html, buildHtml(catalog, latest), "utf-8");
  fs.writeFileSync(
    PATHS.briefJson,
    JSON.stringify(buildJson(catalog, latest), null, 2),
    "utf-8"
  );
  return {
    html: PATHS.html,
    json: PATHS.briefJson,
    count: (catalog.items || []).length,
  };
}

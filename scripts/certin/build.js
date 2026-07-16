// Build entry point: fetch -> parse -> transform -> store -> render.
// CERT-In only. The brief mirrors the CERT-In homepage panels
// ("Latest Security Alert" + "Current Activities") - the current curated set,
// not the full year archive.
//
// Usage:
//   node scripts/certin/build.js            # snapshot current homepage items
//   node scripts/certin/build.js --init     # baseline: mark current as seen (no NEW badges)
//   node scripts/certin/build.js --refresh  # re-fetch details even if cached

import { collectListedIds, fetchDetailHtml, sleep } from "./fetch.js";
import { parseDetail } from "./parse.js";
import { transformItem } from "./transform.js";
import { loadSeen, saveSeen, loadCatalog, saveCatalog, writeLatest } from "./store.js";
import { render } from "./render.js";
import { REQUEST_DELAY_MS } from "./config.js";

function parseArgs(argv) {
  const args = { year: new Date().getFullYear(), init: false, refresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--init") args.init = true;
    else if (a === "--refresh") args.refresh = true;
    else if (a === "--year") args.year = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg) => console.log(msg);

  log(`CERT-In build | homepage snapshot | init=${args.init} | refresh=${args.refresh}`);

  const found = await collectListedIds(args.year, log);
  if (found.size === 0) {
    log("No IDs found on the CERT-In homepage. Site may be down or its HTML changed.");
    process.exitCode = 1;
    return;
  }

  // Keep only the "Latest Security Alerts" - Vulnerability Notes (CIVN) and
  // Advisories (CIAD). Also drop permanent/older pinned links (before last year)
  // so the brief reflects what is genuinely "latest".
  const minYear = new Date().getFullYear() - 1;
  const idYear = (id) => parseInt(id.split("-")[1], 10) || 0;
  const isAlert = (id) => {
    const p = id.split("-")[0];
    return p === "CIVN" || p === "CIAD";
  };
  const currentIds = [...found].filter((id) => isAlert(id) && idYear(id) >= minYear);
  const dropped = found.size - currentIds.length;
  if (dropped > 0) log(`  Skipping ${dropped} non-alert / older item(s).`);

  const prev = loadCatalog();
  const prevById = new Map((prev.items || []).map((it) => [it.id, it]));
  const seen = loadSeen();

  // Build the snapshot: reuse cached detail when we already have it (polite),
  // otherwise fetch the detail page from CERT-In.
  const items = [];
  let fetched = 0;
  for (const id of currentIds) {
    if (!args.refresh && prevById.has(id)) {
      items.push(prevById.get(id));
      continue;
    }
    log(`  Fetching ${id}`);
    try {
      const detail = await fetchDetailHtml(id);
      items.push(transformItem(parseDetail(detail)));
      fetched++;
    } catch (err) {
      log(`    ! failed: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Replace catalog with exactly the current homepage set.
  const total = saveCatalog(items);

  // Items new relative to what we had already seen (skip on --init baseline).
  const newIds = args.init ? [] : currentIds.filter((id) => !seen.has(id));
  saveSeen(new Set([...seen, ...currentIds]));
  writeLatest({
    mode: args.init ? "init" : "delta",
    totalKnown: currentIds.length,
    newIds,
  });

  const out = render();
  log(`\nHomepage items: ${total} (fetched ${fetched}, reused ${total - fetched})`);
  if (newIds.length) {
    log(`New since last run: ${newIds.length}`);
    for (const id of newIds) log(`  - ${id}`);
  } else {
    log("New since last run: 0");
  }
  log(`\nUpdated page: ${out.html}`);
  log(`Machine data: ${out.json}`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exitCode = 1;
});

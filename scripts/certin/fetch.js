// Fetching layer for CERT-In pages.
// Uses Node 18+ built-in global fetch. No external dependencies.

import {
  BASE,
  USER_AGENT,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  REQUEST_DELAY_MS,
  ID_RE,
  listUrls,
  detailUrl,
} from "./config.js";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL as text, with timeout and simple retry on failure.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchText(url) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(REQUEST_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

/**
 * Extract the unique set of CERT-In IDs found in a page's HTML.
 * @param {string} html
 * @returns {Set<string>}
 */
export function extractIds(html) {
  const ids = new Set();
  for (const match of html.matchAll(ID_RE)) {
    ids.add(match[0]);
  }
  return ids;
}

/**
 * Check all list pages for a year and return the union of IDs found.
 * @param {number} year
 * @param {(msg: string) => void} [log]
 * @returns {Promise<Set<string>>}
 */
export async function collectListedIds(year, log = () => {}) {
  const found = new Set();
  for (const { name, url } of listUrls(year)) {
    log(`  Checking ${name}: ${url}`);
    try {
      const html = await fetchText(url);
      const ids = extractIds(html);
      log(`    -> ${ids.size} IDs`);
      for (const id of ids) found.add(id);
    } catch (err) {
      log(`    ! failed: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return found;
}

/**
 * Fetch the raw detail HTML for a single item.
 * @param {string} id
 * @returns {Promise<{id: string, url: string, html: string}>}
 */
export async function fetchDetailHtml(id) {
  const url = detailUrl(id);
  const html = await fetchText(url);
  return { id, url, html };
}

export { BASE, detailUrl };

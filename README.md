# CERT-In Community Threat Brief

A plain-language, community-friendly view of India's official
[CERT-In](https://www.cert-in.org.in/) cybersecurity advisories.

CERT-In publishes important advisories, but the site uses a legacy frameset +
Java servlet layout with no clean feed, which is hard for most people to read.
This project fetches the **Latest Security Alerts** from the CERT-In homepage and
presents each one as a clean, professional document (what happened, who is
affected, risk, impact, what to do, references) with a "View more" expander,
plus a machine-readable `brief.json`.

**CERT-In is the only data source. Every item links back to its official page.
This is a community project, not an official CERT-In publication.**

## Requirements

- Node.js 18+ (uses the built-in `fetch`). No npm dependencies.

## Commands

```bash
npm run brief          # fetch the current CERT-In homepage items, rebuild the page
npm run brief:refresh  # same, but re-fetch every detail page (ignore cache)
npm run brief:init     # baseline: mark current IDs as seen (no NEW badges next run)
npm run serve          # preview locally at http://localhost:3000
```

Flags (via `node scripts/certin/build.js`):

| Flag         | Purpose                                                   |
| ------------ | -------------------------------------------------------- |
| `--refresh`  | Re-fetch every item's detail page even if already cached |
| `--init`     | Record current IDs as seen; skip NEW flagging next run   |

## First run

```bash
npm run brief        # populates data/ and builds public/threat-brief.html
npm run serve        # open http://localhost:3000
```

After that, just run `npm run brief` on a schedule.

## What it tracks

The brief mirrors the **"Latest Security Alert"** panel on the CERT-In homepage
(`pageid=PUBWEL01`) - the Vulnerability Notes (`CIVN`) and Advisories (`CIAD`) it
is currently highlighting. Each run writes exactly that current set (sorted
newest-first), not the full year archive. Non-alert items (Current Activities)
and older pinned links (before last year) are skipped.

If CERT-In lists 6 alerts you get 6; if it lists 7, the next run gives 7. New IDs
are flagged with a **New** badge.

## How it works

```
cert-in.org.in homepage  ->  fetch.js  ->  parse.js  ->  transform.js  ->  data/catalog.json  ->  render.js  ->  public/threat-brief.html + public/data/brief.json
```

- `scripts/certin/fetch.js` - downloads the CERT-In homepage + detail pages (built-in `fetch`).
- `scripts/certin/parse.js` - extracts official sections (overview, risk, impact, recommendations, solution, references).
- `scripts/certin/transform.js` - keeps the full official sections plus a plain-language summary.
- `scripts/certin/store.js` - snapshots the current set and remembers seen IDs (for NEW flags).
- `scripts/certin/render.js` - builds the document-style page and JSON.
- `scripts/certin/build.js` - runs the whole pipeline.

Output the community reads: `public/threat-brief.html` (and `public/about.html`).

### Pages / routes (via `server.js`)

| URL | Serves |
| --- | ------ |
| `/` | the brief (canonical) |
| `/about` | how-it-works page |
| `/data/brief.json` | machine-readable data |
| `/threat-brief.html` | 301 redirect to `/` (no duplicate URLs) |

## Hosting on your existing Node.js site

The build produces plain static files in `public/`, so any Node host works.
Pick one:

### Option A - Standalone (simplest)

Copy this folder to your server and run:

```bash
node server.js   # or: npm run serve
```

`server.js` is a zero-dependency static server. Point your domain/reverse proxy
at it, or run it behind your existing app.

### Option B - Add to an Express app

```js
import express from "express";
import path from "node:path";
const app = express();

// serve the generated files
app.use("/brief", express.static(path.join(process.cwd(), "public")));
// now available at /brief/threat-brief.html and /brief/data/brief.json
```

### Option C - Next.js / static host

Copy `public/threat-brief.html`, `public/about.html`, and `public/data/brief.json`
into your framework's public/static directory, or fetch `brief.json` and render
your own page from it.

## Deploying on Hostinger (Node.js hosting)

Hostinger runs Node apps (Business / Cloud plans), so this project deploys
directly - no framework required. In hPanel: **Websites -> Add Website ->
Node.js Web App**, then choose GitHub (recommended) or a ZIP upload.

Settings to use:

| Setting | Value |
| ------- | ----- |
| Entry / main file | `server.js` |
| Start command | `npm start` |
| Build command | *(leave empty - nothing to build)* |
| Node version | 18, 20, 22 or 24 |
| Env var (optional) | `BRIEF_AUTORUN=1` for self-refresh |

`server.js` reads Hostinger's `PORT` automatically. The repo already ships a
built `public/`, so the site shows content on the first deploy.

**Recommended: GitHub deploy.** Push the repo, connect it in hPanel, and every
`git push` (including the daily GitHub Action commit) auto-redeploys.

Keep it fresh with either:
- **Self-refresh:** set `BRIEF_AUTORUN=1` (optional `BRIEF_INTERVAL_HOURS=24`).
  The running app rebuilds the brief on a schedule in the same process.
- **GitHub Actions:** `.github/workflows/update-brief.yml` rebuilds daily and
  commits the refreshed `public/` + `data/`, which triggers a redeploy.

Live pages: `/` (the brief) and `/about`, with data at `/data/brief.json`.

To mount it under a subpath of an existing Express site instead, use Option B above.

## Keeping it fresh (no Python needed)

Choose whichever fits your host:

1. **System cron (recommended if you have shell access)**

   ```
   30 3 * * *  cd /path/to/cert_project && /usr/bin/node scripts/certin/build.js
   ```

   (03:30 UTC = 09:00 IST daily.)

2. **In-process worker** (host runs a long-lived Node process):

   ```bash
   BRIEF_INTERVAL_HOURS=24 node scripts/worker.js
   ```

   Or import and start it from your existing app.

3. **GitHub Actions** (if your host only serves static files): see
   `.github/workflows/update-brief.yml`. It rebuilds daily and commits the
   refreshed `public/` and `data/` files, which your host can then deploy.

## Data files (`data/`)

| File             | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `seen_ids.json`  | IDs already processed (so runs are incremental)  |
| `catalog.json`   | Full structured item data used to build the page |
| `latest.json`    | Status of the last run (mode, new count)         |

These are for the build pipeline. The community only needs the page in `public/`.

## Disclaimer

Summaries are condensed from CERT-In's own text; no facts are added. Always
confirm details on the linked official CERT-In page before acting.

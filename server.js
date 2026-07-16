// Zero-dependency static server for the CERT-In community brief.
// Serves the public/ folder. Works on any host that runs Node 18+
// (Hostinger, VPS, etc.). Hostinger runs `npm start`, which runs this file.
//
//   node server.js                     # serves on http://localhost:3000
//   PORT=8080 node server.js           # custom port
//   BRIEF_AUTORUN=1 node server.js     # also rebuild the brief in-process on a schedule
//
// Routes:
//   /                        -> public/threat-brief.html (canonical brief page)
//   /threat-brief(.html)     -> 301 redirect to /  (avoid duplicate URLs)
//   /about                   -> public/about.html
//   /data/brief.json         -> public/data/brief.json
//   everything else          -> matching file in public/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;

// Optional in-process refresh: keeps content fresh on hosts (like Hostinger)
// where a single Node process is the whole app and system cron is awkward.
// Enable with BRIEF_AUTORUN=1. Interval via BRIEF_INTERVAL_HOURS (default 24).
function startAutoRefresh() {
  if (process.env.BRIEF_AUTORUN !== "1") return;
  const buildScript = path.join(__dirname, "scripts", "certin", "build.js");
  const year = process.env.BRIEF_YEAR || String(new Date().getFullYear());
  const hours = Number(process.env.BRIEF_INTERVAL_HOURS || 24);

  const run = () => {
    console.log(`[brief] rebuild starting ${new Date().toISOString()}`);
    const child = spawn(process.execPath, [buildScript, "--year", year], {
      stdio: "inherit",
    });
    child.on("exit", (code) => console.log(`[brief] rebuild exited ${code}`));
  };

  // First refresh shortly after boot (don't block server start), then on interval.
  setTimeout(run, 5000).unref?.();
  setInterval(run, hours * 60 * 60 * 1000).unref?.();
  console.log(`[brief] auto-refresh enabled every ${hours}h (year ${year})`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// The brief has a single canonical URL ("/"). Older/duplicate paths redirect
// so the same content is never served from two addresses.
const REDIRECTS = new Set(["/threat-brief", "/threat-brief.html", "/index.html"]);

const ROUTES = {
  "/": "threat-brief.html",
  "/about": "about.html",
  "/about.html": "about.html",
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base)) return null; // block path traversal
  return p;
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (REDIRECTS.has(urlPath)) {
    res.writeHead(301, { Location: "/" });
    res.end();
    return;
  }

  if (ROUTES[urlPath]) urlPath = "/" + ROUTES[urlPath];

  const filePath = safeJoin(PUBLIC, urlPath);
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404 - Not found</h1><p><a href=\"/\">Go to the brief</a></p>");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=300",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Community brief running at http://localhost:${PORT}/`);
  startAutoRefresh();
});

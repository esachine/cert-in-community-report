// Optional in-process scheduler for hosts without a system cron.
// Runs the build once on startup, then on a fixed interval.
// Import/start this from your existing Node app, or run: node scripts/worker.js
//
// Configure with env vars:
//   BRIEF_INTERVAL_HOURS  (default 24)
//   BRIEF_YEAR            (default current year)

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(__dirname, "certin", "build.js");

const INTERVAL_HOURS = Number(process.env.BRIEF_INTERVAL_HOURS || 24);
const YEAR = process.env.BRIEF_YEAR || String(new Date().getFullYear());

function runBuild() {
  console.log(`[worker] building at ${new Date().toISOString()}`);
  const child = spawn(process.execPath, [BUILD, "--year", YEAR], {
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    console.log(`[worker] build exited with code ${code}`);
  });
}

runBuild();
setInterval(runBuild, INTERVAL_HOURS * 60 * 60 * 1000);
console.log(`[worker] scheduled every ${INTERVAL_HOURS}h (year ${YEAR})`);

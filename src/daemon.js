/**
 * AustLII Scraper Daemon — runs scrape cycles forever.
 *
 * Each cycle:
 *   1. Spawn node src/index.js --once  (scrapes all 111 feeds)
 *   2. Wait INTERVAL hours
 *   3. Repeat
 *
 * Handles crashes by waiting CRASH_BACKOFF seconds then retrying.
 *
 * Run: node src/daemon.js
 * Or:  npm run daemon
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeStatus, readStatus } from './status.js';

const __dir   = dirname(fileURLToPath(import.meta.url));
const NODE    = process.execPath;
const SCRIPT  = join(__dir, 'index.js');

const INTERVAL_H     = 6;               // hours between scrape runs
const INTERVAL_MS    = INTERVAL_H * 60 * 60 * 1000;
const CRASH_BACKOFF  = 5 * 60 * 1000;  // 5 min wait after a crash before retrying

let cycleCount = 0;

function log(msg) {
  console.log(`[daemon ${new Date().toISOString()}] ${msg}`);
}

function runScraper() {
  return new Promise((resolve, reject) => {
    cycleCount++;
    log(`Starting scrape cycle #${cycleCount}`);

    const child = spawn(NODE, [SCRIPT, '--once'], {
      cwd: join(__dir, '..'),
      stdio: 'inherit', // pipe through to our terminal
    });

    child.on('close', code => {
      if (code === 0) {
        log(`Cycle #${cycleCount} completed successfully.`);
        resolve();
      } else {
        reject(new Error(`Scraper exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fmtMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

log(`AustLII daemon starting. Scrape interval: ${INTERVAL_H}h`);
log(`Press Ctrl+C to stop.\n`);

// Main loop
while (true) {
  try {
    await runScraper();
    const nextAt = new Date(Date.now() + INTERVAL_MS);
    writeStatus({ running: false, phase: 'waiting', nextRunAt: nextAt.toISOString() });
    log(`Next run at ${nextAt.toLocaleTimeString()} (in ${fmtMs(INTERVAL_MS)}). Sleeping…\n`);
    await delay(INTERVAL_MS);
  } catch (e) {
    log(`Scraper crashed: ${e.message}`);
    writeStatus({ running: false, phase: 'crashed', currentFeed: null });
    log(`Retrying in ${fmtMs(CRASH_BACKOFF)}…\n`);
    await delay(CRASH_BACKOFF);
  }
}

import pLimit from 'p-limit';
import { FEEDS, CONCURRENT_FEEDS, REQUEST_DELAY_MS } from './feeds.js';
import { scrapeFeed, closeBrowser, delay } from './scraper.js';
import { getDb, stats } from './db.js';
import { writeStatus, readStatus } from './status.js';

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function runOnce() {
  const startedAt = new Date().toISOString();
  console.log(`\n=== AustLII Scraper run started at ${startedAt} ===`);
  console.log(`Feeds to scrape: ${FEEDS.length}\n`);

  const prevRunCount = readStatus().runCount || 0;
  writeStatus({
    running: true,
    phase: 'scraping',
    feedsDone: 0,
    feedsTotal: FEEDS.length,
    newThisRun: 0,
    foundThisRun: 0,
    failedThisRun: 0,
    currentFeed: null,
    lastStartedAt: startedAt,
    nextRunAt: null,
    runCount: prevRunCount + 1,
  });

  const limit = pLimit(CONCURRENT_FEEDS);
  let feedsDone = 0, newThisRun = 0, foundThisRun = 0, failedThisRun = 0;
  const results = [];

  const tasks = FEEDS.map(feed =>
    limit(async () => {
      writeStatus({ currentFeed: feed.name, feedsDone, newThisRun, foundThisRun, failedThisRun });
      const result = await scrapeFeed(feed);
      feedsDone++;
      newThisRun   += result.new;
      foundThisRun += result.found;
      if (result.error) failedThisRun++;
      writeStatus({ currentFeed: feed.name, feedsDone, newThisRun, foundThisRun, failedThisRun });
      await delay(REQUEST_DELAY_MS);
      return result;
    })
  );

  for (const result of await Promise.all(tasks)) {
    results.push(result);
  }

  const succeeded = results.filter(r => !r.error);
  const failed    = results.filter(r => r.error);
  const totalNew   = results.reduce((s, r) => s + r.new, 0);
  const totalFound = results.reduce((s, r) => s + r.found, 0);

  console.log(`\n=== Run complete ===`);
  console.log(`Feeds: ${succeeded.length} ok, ${failed.length} failed`);
  console.log(`Items: ${totalFound} found, ${totalNew} new`);

  const s = stats();
  console.log(`\nDatabase totals:`);
  console.log(`  Total:      ${s.total}`);
  console.log(`  Case law:   ${s.case_law}`);
  console.log(`  Legislation:${s.legislation}`);

  if (failed.length > 0) {
    console.log(`\nFailed feeds:`);
    for (const f of failed) console.log(`  ${f.feed}: ${f.error}`);
  }

  const completedAt = new Date().toISOString();
  writeStatus({
    running: false,
    phase: 'idle',
    currentFeed: null,
    feedsDone: FEEDS.length,
    newThisRun: totalNew,
    foundThisRun: totalFound,
    failedThisRun: failed.length,
    lastCompletedAt: completedAt,
  });

  await closeBrowser();
  return { totalNew, totalFound };
}

async function runContinuous() {
  while (true) {
    await runOnce();
    const nextAt = new Date(Date.now() + POLL_INTERVAL_MS).toISOString();
    console.log(`\nNext poll at ${nextAt}`);
    writeStatus({ running: false, phase: 'waiting', nextRunAt: nextAt });
    await delay(POLL_INTERVAL_MS);
  }
}

getDb();

const once = process.argv.includes('--once');
if (once) {
  runOnce().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else {
  runContinuous().catch(e => { console.error(e); process.exit(1); });
}

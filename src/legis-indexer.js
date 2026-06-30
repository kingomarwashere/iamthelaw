/**
 * AustLII state legislation indexer — crawls per-letter TOC pages.
 *
 * AustLII exposes legislation databases as alphabet-keyed TOC files:
 *   /cgi-bin/viewtoc/<db>/toc-A.html through toc-Z.html
 *
 * Strategy:
 *   1. Navigate to the database index page (warms CF cookie for /cgi-bin/viewtoc/)
 *   2. In-page fetch each toc-X.html (26 per database)
 *   3. Parse /cgi-bin/viewdoc/ links and ingest titles
 *
 * Run: node src/legis-indexer.js [--jurisdiction nsw|qld|sa|wa|tas|nt|act]
 */
import { chromium } from 'playwright';
import { upsertDocument, logFeedRun } from './db.js';
import { AUSTLII_BASE, FEEDS } from './feeds.js';

const args     = process.argv.slice(2);
const jurisArg = args.find(a => a.startsWith('--jurisdiction='))?.split('=')[1];

const LEGIS_FEEDS = FEEDS.filter(f =>
  f.type === 'legislation' && (!jurisArg || f.jurisdiction === jurisArg)
);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function dbPath(feedCode) {
  // feedCode like 'au/legis/nsw/consol_act' → path for viewdb and viewtoc
  return feedCode;
}

async function indexLegisDb(page, feed) {
  const dbCode = feed.code; // e.g. au/legis/nsw/consol_act
  const indexUrl = `${AUSTLII_BASE}/cgi-bin/viewdb/${dbCode}/`;
  console.log(`  Indexing: ${feed.name}`);

  let totalFound = 0, totalNew = 0;

  try {
    // Navigate directly to the first TOC page to set CF cookie for this db's /cgi-bin/viewtoc/ path.
    // Each jurisdiction/database requires its own CF clearance — the cookie from one
    // jurisdiction does NOT carry over to another.
    const firstTocUrl = `${AUSTLII_BASE}/cgi-bin/viewtoc/${dbCode}/toc-A.html`;
    await page.goto(firstTocUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);

    for (const letter of LETTERS) {
      const tocUrl = `${AUSTLII_BASE}/cgi-bin/viewtoc/${dbCode}/toc-${letter}.html`;

      const result = await page.evaluate(async (url) => {
        const r = await fetch(url);
        if (!r.ok) return null;
        const html = await r.text();
        const links = [];
        // AustLII legislation TOC links: /cgi-bin/viewdoc/au/legis/<db>/<slug>/
        const re = /href="(\/cgi-bin\/viewdoc\/au\/legis\/[^"]+\/)"[^>]*>([^<]{3,120})<\/a>/gi;
        for (const m of html.matchAll(re)) {
          const title = m[2].trim();
          if (!title || title.length < 4) continue;
          links.push({ url: 'https://www.austlii.edu.au' + m[1], title });
        }
        return links;
      }, tocUrl);

      if (!result) continue; // 404 for this letter — normal for sparse databases

      for (const { url: docUrl, title } of result) {
        totalFound++;
        const { inserted } = upsertDocument({
          guid:         `austlii-legis:${docUrl}`,
          feed_code:    feed.code,
          type:         'legislation',
          jurisdiction: feed.jurisdiction,
          title,
          url:          docUrl,
          pub_date:     null,
          description:  '',
        });
        if (inserted) totalNew++;
      }

      await new Promise(r => setTimeout(r, 300)); // polite between letters
    }

    logFeedRun(feed.code, totalFound, totalNew);
    console.log(`  → ${totalFound} found, ${totalNew} new`);
    return { found: totalFound, new: totalNew };

  } catch (e) {
    console.error(`  [error] ${feed.code}: ${e.message}`);
    logFeedRun(feed.code, 0, 0, e.message);
    return { found: 0, new: 0, error: e.message };
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'en-AU',
});
const page = await context.newPage();
await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

console.log(`\nIndexing ${LEGIS_FEEDS.length} legislation databases...\n`);

let totalFound = 0, totalNew = 0;
for (const feed of LEGIS_FEEDS) {
  const r = await indexLegisDb(page, feed);
  totalFound += r.found || 0;
  totalNew   += r.new   || 0;
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\nDone. Total: ${totalFound} indexed, ${totalNew} new`);
await browser.close();

/**
 * Federal Register of Legislation — OData API ingestor
 * API: https://api.prod.legislation.gov.au/v1/
 *
 * Pulls all 131k+ Commonwealth titles (Acts, Legislative Instruments,
 * Notifiable Instruments, Constitution, etc.) going back to 1901.
 *
 * Run: node src/legis-federal.js [--status inforce|repealed|all]
 */
import fetch from 'node-fetch';
import { getDb, upsertDocument, logFeedRun } from './db.js';

const API = 'https://api.prod.legislation.gov.au/v1';
const PAGE_SIZE = 100; // API enforces max $top of 100 despite documentation saying 500
const DELAY_MS  = 500;

const args      = process.argv.slice(2);
const statusArg = args.find(a => a.startsWith('--status='))?.split('=')[1] || 'all';

const COLLECTION_JURISDICTION = {
  Act:                          'cth',
  LegislativeInstrument:        'cth',
  NotifiableInstrument:         'cth',
  AdministrativeArrangementsOrder: 'cth',
  Constitution:                 'cth',
  ContinuedLaw:                 'cth',
  Gazette:                      'cth',
  PrerogativeInstrument:        'cth',
};

function titleUrl(id) {
  return `https://www.legislation.gov.au/Details/${id}`;
}

function feedCode(collection) {
  return `gov.au/legis/cth/${collection.toLowerCase()}`;
}

async function fetchPage(skip) {
  let url = `${API}/Titles?$top=${PAGE_SIZE}&$skip=${skip}&$count=true&$format=json` +
    `&$select=id,name,collection,status,isInForce,makingDate,year,number,seriesType`;

  if (statusArg === 'inforce')  url += `&$filter=isInForce eq true`;
  if (statusArg === 'repealed') url += `&$filter=isInForce eq false`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'AustraliaLegalScraper/1.0' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} at skip=${skip}`);
  // OData content-type includes "odata.metadata=minimal" which can trip up .json()
  return JSON.parse(await resp.text());
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

getDb();

console.log(`\n=== Federal Register of Legislation ingestor ===`);
console.log(`Status filter: ${statusArg}\n`);

// Get total count first
const first = await fetchPage(0);
const total = first['@odata.count'];
const pages = Math.ceil(total / PAGE_SIZE);
console.log(`Total titles: ${total} (${pages} pages of ${PAGE_SIZE})`);

let totalNew = 0, totalFound = 0, page = 0;

// Process first page already fetched
for (const item of first.value) {
  totalFound++;
  const { inserted } = upsertDocument({
    guid:         `frl:${item.id}`,
    feed_code:    feedCode(item.collection),
    type:         'legislation',
    jurisdiction: 'cth',
    title:        item.name,
    url:          titleUrl(item.id),
    pub_date:     item.makingDate,
    description:  `${item.collection} ${item.seriesType || ''} ${item.year || ''} No. ${item.number || ''}`.trim(),
  });
  if (inserted) totalNew++;
}
page++;
console.log(`Page 1/${pages}: ${first.value.length} titles, ${totalNew} new so far`);
logFeedRun('gov.au/legis/cth/all', first.value.length, totalNew);

// Remaining pages
for (let skip = PAGE_SIZE; skip < total; skip += PAGE_SIZE) {
  await delay(DELAY_MS);
  try {
    const data = await fetchPage(skip);
    let pageNew = 0;
    for (const item of data.value) {
      totalFound++;
      const { inserted } = upsertDocument({
        guid:         `frl:${item.id}`,
        feed_code:    feedCode(item.collection),
        type:         'legislation',
        jurisdiction: 'cth',
        title:        item.name,
        url:          titleUrl(item.id),
        pub_date:     item.makingDate,
        description:  `${item.collection} ${item.seriesType || ''} ${item.year || ''} No. ${item.number || ''}`.trim(),
      });
      if (inserted) { totalNew++; pageNew++; }
    }
    page++;
    if (page % 10 === 0 || page === pages) {
      console.log(`Page ${page}/${pages}: ${totalFound} total, ${totalNew} new`);
    }
    logFeedRun('gov.au/legis/cth/all', data.value.length, pageNew);
  } catch (e) {
    console.error(`Error at skip=${skip}: ${e.message}`);
    await delay(3000);
  }
}

console.log(`\nDone. Total: ${totalFound} fetched, ${totalNew} new in DB`);

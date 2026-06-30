/**
 * Victoria Legislation — Elasticsearch ingestor
 * API: https://www.legislation.vic.gov.au/api/tide/elasticsearch/
 *
 * 13,661 documents: Acts, Statutory Rules, Bills — both in-force and repealed.
 * Uses search_after pagination to get past ES's 10k from-limit.
 *
 * Run: node src/legis-vic.js
 */
import fetch from 'node-fetch';
import { getDb, upsertDocument, logFeedRun } from './db.js';

const ES_URL = 'https://www.legislation.vic.gov.au/api/tide/elasticsearch/content-legislation-vic-gov-au__production__sapi_node/_search';
const VIC_BASE = 'https://www.legislation.vic.gov.au';
const PAGE_SIZE = 500;
const DELAY_MS  = 800;

const TYPE_MAP = {
  act_in_force:  'Act (in force)',
  act_as_made:   'Act (as made)',
  sr_in_force:   'Statutory Rule (in force)',
  sr_as_made:    'Statutory Rule (as made)',
  bill:          'Bill',
  bill_act:      'Bill (enacted)',
};

const LEGIS_TYPES = ['act_in_force', 'act_as_made', 'sr_in_force', 'sr_as_made', 'bill', 'bill_act'];

async function fetchPage(searchAfter) {
  const body = {
    query: {
      terms: { type: LEGIS_TYPES },
    },
    size: PAGE_SIZE,
    track_total_hits: true,
    sort: [{ nid: { order: 'asc' } }],
    _source: ['title', 'url', 'type', 'created', 'nid'],
  };
  if (searchAfter) body.search_after = searchAfter;

  const resp = await fetch(ES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AustraliaLegalScraper/1.0',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function first(arr) { return Array.isArray(arr) ? arr[0] : arr; }

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

getDb();
console.log('\n=== Victoria Legislation ingestor ===\n');

let totalNew = 0, totalFound = 0;
let searchAfter = null;
let page = 0;
let total = null;

while (true) {
  const data = await fetchPage(searchAfter);

  if (total === null) {
    total = data.hits.total.value;
    console.log(`Total VIC documents: ${total}`);
  }

  const hits = data.hits.hits;
  if (!hits.length) break;

  let pageNew = 0;
  for (const hit of hits) {
    const src   = hit._source;
    const title = first(src.title) || '';
    const url   = first(src.url) || '';
    const type  = first(src.type) || '';
    const date  = first(src.created) || null;

    totalFound++;
    const { inserted } = upsertDocument({
      guid:         `vic:${hit._id}`,
      feed_code:    'gov.vic/legis',
      type:         'legislation',
      jurisdiction: 'vic',
      title,
      url:          url ? `${VIC_BASE}${url}` : '',
      pub_date:     date,
      description:  TYPE_MAP[type] || type,
    });
    if (inserted) { totalNew++; pageNew++; }
  }

  page++;
  console.log(`Page ${page}: ${hits.length} docs, ${pageNew} new (running total: ${totalFound}/${total})`);
  logFeedRun('gov.vic/legis', hits.length, pageNew);

  if (hits.length < PAGE_SIZE) break;

  // search_after uses the sort values of the last hit
  searchAfter = hits[hits.length - 1].sort;
  await delay(DELAY_MS);
}

console.log(`\nDone. Total: ${totalFound} fetched, ${totalNew} new in DB`);

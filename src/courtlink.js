/**
 * NSW Caselaw + public court registry scraper.
 * Searches caselaw.nsw.gov.au for decisions by party name / matter number.
 * Uses Playwright since the site is JS-heavy.
 */
import { chromium } from 'playwright';

let _browser = null;
let _warmupDone = false;

async function getPage() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  const ctx = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return page;
}

/**
 * Search NSW Caselaw for decisions involving a party name or case citation.
 * Returns array of { title, url, date, court, citation, summary }
 */
export async function searchNSWCaselaw(query, limit = 10) {
  const page = await getPage();
  try {
    const url = `https://caselaw.nsw.gov.au/search/advanced?body=${encodeURIComponent(query)}&_sort=date&_order=desc&_per_page=${limit}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const results = await page.evaluate(() => {
      const items = [];
      // NSW Caselaw search result items
      document.querySelectorAll('.search-results__item, .judgment, article.result').forEach(el => {
        const titleEl = el.querySelector('h3 a, h2 a, .judgment__name a, .result__title a');
        const dateEl  = el.querySelector('.judgment__date, .result__date, time, .date');
        const courtEl = el.querySelector('.judgment__court, .result__court, .court');
        const snipEl  = el.querySelector('.search-results__snippet, .result__snippet, p');
        if (titleEl) {
          items.push({
            title:    titleEl.textContent.trim(),
            url:      titleEl.href || titleEl.getAttribute('href') || '',
            date:     dateEl?.textContent.trim() || '',
            court:    courtEl?.textContent.trim() || 'NSW',
            summary:  snipEl?.textContent.trim().slice(0, 200) || '',
          });
        }
      });
      // Fallback: try anchor links in results
      if (!items.length) {
        document.querySelectorAll('a[href*="/decision/"]').forEach(a => {
          items.push({
            title: a.textContent.trim(),
            url:   a.href || a.getAttribute('href') || '',
            date:  '',
            court: 'NSW',
            summary: '',
          });
        });
      }
      return items;
    });

    return results.slice(0, limit);
  } catch (e) {
    console.warn('[courtlink] NSW Caselaw search error:', e.message);
    return [];
  } finally {
    await page.context().close();
  }
}

/**
 * Get a specific NSW Caselaw decision by URL.
 */
export async function getNSWDecision(url) {
  const page = await getPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    return await page.evaluate(() => {
      const title = document.querySelector('h1.judgment__title, h1')?.textContent.trim() || '';
      const date  = document.querySelector('.judgment__date, time')?.textContent.trim() || '';
      const court = document.querySelector('.judgment__court, .court-name')?.textContent.trim() || '';
      const body  = document.querySelector('.judgment__body, .decision-body, main')?.innerText.trim() || '';
      return { title, date, court, body: body.slice(0, 10000) };
    });
  } catch (e) {
    return null;
  } finally {
    await page.context().close();
  }
}

/**
 * Search AustLII for NSW cases involving a party name.
 * Uses AustLII's public search (already CF-bypassed in our scraper session).
 */
export async function searchAustliiForParty(partyName, jurisdiction = 'nsw') {
  const db_path = `au/cases/${jurisdiction}`;
  // Use our existing AustLII corpus DB first
  return { query: partyName, source: 'austlii', note: 'Search corpus for party name' };
}

export async function closeCourtlinkBrowser() {
  if (_browser) { await _browser.close(); _browser = null; }
}

// Public court listing data sources (no auth required)
export const COURT_RESOURCES = {
  nsw: [
    { name: 'NSW Caselaw',          url: 'https://caselaw.nsw.gov.au',           desc: 'Full text of NSW court decisions' },
    { name: 'NSW Online Registry',  url: 'https://onlineregistry.lawlink.nsw.gov.au', desc: 'File documents, view your case online' },
    { name: 'NCAT eCatalyst',       url: 'https://ncat.nsw.gov.au/ecatalyst',     desc: 'NCAT applications and hearings' },
    { name: 'Federal Court eLodge', url: 'https://www.fedcourt.gov.au/online-services/elodgment', desc: 'Federal Court document lodgment' },
  ],
  vic: [
    { name: 'Victorian Caselaw',    url: 'https://www.austlii.edu.au/au/cases/vic', desc: 'VIC court decisions on AustLII' },
    { name: 'VCAT Online',          url: 'https://www.vcat.vic.gov.au/online-services', desc: 'VCAT applications and case management' },
  ],
  cth: [
    { name: 'FWC Decisions',        url: 'https://www.fwc.gov.au/resources/decisions', desc: 'Fair Work Commission decisions' },
    { name: 'AAT eSystems',         url: 'https://www.aat.gov.au/lodging-and-fees/elodgment', desc: 'Administrative Appeals Tribunal' },
    { name: 'Federal Court',        url: 'https://www.fedcourt.gov.au',             desc: 'Federal Court of Australia' },
  ],
};

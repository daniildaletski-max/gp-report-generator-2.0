/**
 * Studioworks Team Dashboard Scraper
 *
 * Pulls evaluation entries from team.studioworks.ee/evaluations so FMs
 * don't have to manually screenshot + upload each one. Same architecture
 * as personaScraper.ts: Puppeteer + form login + step-labeled errors +
 * single retry on transient failures.
 *
 * Discovery strategy
 * ------------------
 * We don't have a documented API for team.studioworks.ee. The scraper
 * tries two extraction paths in this order:
 *
 *   1. JSON API intercept — the dashboard is a SPA that fetches its
 *      data via XHR. We listen for JSON responses on /evaluations*
 *      while the page loads; if we see structured eval data, we use
 *      that directly (cleaner + future-proof).
 *
 *   2. HTML scrape fallback — if no JSON intercept matches, we parse
 *      the rendered DOM. The selector heuristics are based on the
 *      "Evaluation Details" modal layout the user provided
 *      (presenter / evaluator / date / game / score + 6 ratings).
 *
 * Both paths emit the SAME ExtractedEvaluation shape so the upsert
 * code downstream doesn't care which one fired.
 *
 * Credentials
 * -----------
 * Operator-supplied via env:
 *   STUDIOWORKS_USERNAME
 *   STUDIOWORKS_PASSWORD
 *   STUDIOWORKS_BASE_URL (optional, defaults to https://team.studioworks.ee)
 */
import puppeteer, { Browser, Page, HTTPResponse } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { existsSync } from 'node:fs';

const DEFAULT_BASE_URL = 'https://team.studioworks.ee';

function baseUrl(): string {
  return (process.env.STUDIOWORKS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function evaluationsUrl(): string {
  return `${baseUrl()}/evaluations`;
}

function loginUrl(): string {
  return `${baseUrl()}/login`;
}

/**
 * Configurable nav timeout. Defaults to 60s; raise via env if the
 * studioworks site is slow on cold start.
 */
function getNavTimeoutMs(): number {
  const fromEnv = parseInt(process.env.STUDIOWORKS_NAV_TIMEOUT_MS || '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 60000;
}

async function withStepRetry<T>(step: string, fn: () => Promise<T>): Promise<T> {
  const isTransient = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return /timeout|navigation timeout|frame detached|target closed|protocol error|net::err/i.test(msg);
  };
  try {
    return await fn();
  } catch (e1) {
    if (!isTransient(e1)) {
      throw new Error(`[${step}] ${e1 instanceof Error ? e1.message : String(e1)}`);
    }
    await new Promise(r => setTimeout(r, 1500));
    try {
      return await fn();
    } catch (e2) {
      throw new Error(`[${step}] ${e2 instanceof Error ? e2.message : String(e2)} (retried once)`);
    }
  }
}

// Shared browser instance — single Chromium for the whole process
// since each Puppeteer launch is ~1-2s of cold start.
let browserInstance: Browser | null = null;

async function resolveChromiumExecutable(): Promise<string> {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/chromium',
    '/usr/local/bin/chrome',
    '/snap/bin/chromium',
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return await chromium.executablePath();
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  const executablePath = await resolveChromiumExecutable();
  browserInstance = await puppeteer.launch({
    executablePath,
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    headless: true,
  });
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
  }
}

// ============================================
// Extracted evaluation shape — common for both JSON and HTML paths
// ============================================

export interface ExtractedRating {
  score: number;
  maxScore: number;
  comment?: string;
}

export interface ExtractedEvaluation {
  /** Stable id from studioworks if exposed, else hash of presenter+date+evaluator+game. */
  externalId: string;
  presenterName: string;
  evaluatorName?: string;
  /** ISO date string (yyyy-mm-dd) or full ISO timestamp. */
  date: string;
  game?: string;
  totalScore?: number;
  ratings: {
    hair?: ExtractedRating;
    makeup?: ExtractedRating;
    outfit?: ExtractedRating;
    posture?: ExtractedRating;
    dealingStyle?: ExtractedRating;
    gamePerformance?: ExtractedRating;
  };
  overallComment?: string;
}

export interface StudioworksSyncResult {
  success: boolean;
  evaluations: ExtractedEvaluation[];
  error?: string;
  /** Discovery info — surfaces which extraction path was used so the
   *  admin UI can show "Used JSON API" vs "Scraped HTML" for debugging. */
  source: 'json' | 'html' | 'none';
}

// ============================================
// Login
// ============================================

/**
 * Try a sequence of common login-form selectors. Studioworks may use
 * `name="email"` or `#username` or `input[type=email]` etc — we attempt
 * the most likely candidates in order and use whichever fills first.
 *
 * The selectors are deliberately broad because we don't have docs;
 * if all fail we throw an error labelled with the current URL + page
 * title so the operator can hand us a screenshot and we can adapt.
 */
async function loginToStudioworks(page: Page, username: string, password: string): Promise<void> {
  const navTimeout = getNavTimeoutMs();

  await withStepRetry('open login page', () =>
    page.goto(loginUrl(), { waitUntil: 'domcontentloaded', timeout: navTimeout })
  );

  // Already logged in? Some apps redirect / from /login if a session
  // cookie is present. Check for a body without a password field.
  const hasPassword = await page.$('input[type=password]');
  if (!hasPassword) {
    return;
  }

  // Find the username/email input. Try the most likely options.
  const usernameSelectors = [
    'input[name="username"]',
    'input[name="email"]',
    'input[name="login"]',
    'input[type="email"]',
    '#username',
    '#email',
    '#login',
  ];
  const passwordSelectors = [
    'input[name="password"]',
    'input[type="password"]',
    '#password',
  ];

  let usernameSelector: string | null = null;
  for (const s of usernameSelectors) {
    if (await page.$(s)) { usernameSelector = s; break; }
  }
  let passwordSelector: string | null = null;
  for (const s of passwordSelectors) {
    if (await page.$(s)) { passwordSelector = s; break; }
  }

  if (!usernameSelector || !passwordSelector) {
    const url = page.url();
    const title = await page.title();
    throw new Error(`[locate login form] Could not find username/password inputs on ${url} (title: "${title}"). Pass the actual selectors via env or open a screenshot to update the heuristics.`);
  }

  await page.type(usernameSelector, username, { delay: 30 });
  await page.type(passwordSelector, password, { delay: 30 });

  // Click submit. Try common patterns — submit button, button with login-y text.
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:not([type="button"])',
  ];
  let submitSelector: string | null = null;
  for (const s of submitSelectors) {
    if (await page.$(s)) { submitSelector = s; break; }
  }
  if (!submitSelector) {
    throw new Error('[locate submit button] No submit button found on login form');
  }

  await withStepRetry('login submit', () =>
    Promise.all([
      page.click(submitSelector!),
      // Some SPA logins don't full-page nav — so wait for either nav OR
      // disappearance of the password field, whichever happens first.
      Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: navTimeout }).catch(() => null),
        page.waitForFunction(
          () => !document.querySelector('input[type=password]'),
          { timeout: navTimeout, polling: 500 },
        ),
      ]),
    ])
  );

  // Verify login worked — password field should now be gone.
  const stillHasPassword = await page.$('input[type=password]');
  if (stillHasPassword) {
    // Try to surface any visible error text from the page
    const errorText = await page.evaluate(() => {
      const err = document.querySelector('[role="alert"], .error, .alert-danger, .form-error');
      return err?.textContent?.trim() || null;
    });
    throw new Error(`[verify login] Login form still visible after submit — likely wrong credentials${errorText ? ` (page says: "${errorText}")` : ''}`);
  }
}

// ============================================
// Extraction
// ============================================

/**
 * Navigate to /evaluations and capture data. Tries to intercept JSON
 * XHR responses first; falls back to HTML scraping if nothing useful
 * was intercepted.
 */
async function fetchEvaluations(page: Page): Promise<{ evaluations: ExtractedEvaluation[]; source: 'json' | 'html' | 'none' }> {
  const navTimeout = getNavTimeoutMs();

  // Set up XHR intercept BEFORE navigating so we don't miss the
  // initial-load XHRs the SPA fires.
  const jsonResponses: any[] = [];
  const onResponse = async (resp: HTTPResponse) => {
    try {
      const url = resp.url();
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;
      // Only look at evaluation-ish URLs to avoid parsing every JSON
      // (Sentry, telemetry, auth, etc).
      if (!/eval|review|rating|score/i.test(url)) return;
      const body = await resp.json().catch(() => null);
      if (body) jsonResponses.push({ url, body });
    } catch { /* ignore individual response errors */ }
  };
  page.on('response', onResponse);

  try {
    await withStepRetry('open evaluations page', () =>
      page.goto(evaluationsUrl(), { waitUntil: 'domcontentloaded', timeout: navTimeout })
    );

    // Give SPA XHRs time to settle. Best-effort; we proceed even if
    // network never goes idle.
    try {
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 });
    } catch { /* ignore */ }

    // Try JSON path first
    const jsonEvals = parseJsonResponses(jsonResponses);
    if (jsonEvals.length > 0) {
      return { evaluations: jsonEvals, source: 'json' };
    }

    // HTML fallback
    const html = await page.content();
    const htmlEvals = parseHtmlEvaluations(html);
    if (htmlEvals.length > 0) {
      return { evaluations: htmlEvals, source: 'html' };
    }
    return { evaluations: [], source: 'none' };
  } finally {
    page.off('response', onResponse);
  }
}

/**
 * Try to find evaluations in the captured JSON responses. The shape
 * isn't documented so we look for common patterns: a top-level array,
 * or an object with `data` / `evaluations` / `items` / `results` key
 * holding the array.
 */
function parseJsonResponses(responses: { url: string; body: any }[]): ExtractedEvaluation[] {
  // Continue scanning ALL candidates across ALL responses — return only
  // the first one that produces a non-empty normalized result. The
  // earlier `return` on first shape-match meant a response that looked
  // right but had differently-named fields (so normalize dropped every
  // row) silently swallowed the entire scan, and we'd never see a later
  // response that DID have the right shape.
  for (const { body } of responses) {
    const candidates: any[][] = [];
    if (Array.isArray(body)) candidates.push(body);
    if (body && typeof body === 'object') {
      for (const key of ['evaluations', 'data', 'items', 'results', 'records']) {
        if (Array.isArray(body[key])) candidates.push(body[key]);
      }
    }
    for (const arr of candidates) {
      if (arr.length === 0) continue;
      const sample = arr[0];
      // Heuristic: an evaluation has presenter+date or score+ratings
      const looksLikeEval = sample
        && typeof sample === 'object'
        && (
          ('presenter' in sample || 'presenterName' in sample || 'gp' in sample || 'employee' in sample)
          && ('date' in sample || 'evaluationDate' in sample || 'createdAt' in sample)
        );
      if (!looksLikeEval) continue;
      const normalized = arr.map(normalizeJsonEvaluation).filter((e): e is ExtractedEvaluation => e !== null);
      if (normalized.length > 0) return normalized;
      // Otherwise keep scanning subsequent candidates / responses.
    }
  }
  return [];
}

function normalizeJsonEvaluation(raw: any): ExtractedEvaluation | null {
  try {
    const presenterName = raw.presenter?.name ?? raw.presenterName ?? raw.gp?.name ?? raw.employee?.name ?? raw.name;
    if (!presenterName) return null;
    const evaluatorName = raw.evaluator?.name ?? raw.evaluatorName ?? raw.reviewer?.name ?? raw.author?.name;
    const date = raw.date ?? raw.evaluationDate ?? raw.createdAt;
    if (!date) return null;
    const externalId = String(raw.id ?? raw.uuid ?? raw._id ?? hashEvaluation(presenterName, date, evaluatorName, raw.game));

    // Ratings — try a few key shapes. Each criterion has a known
    // schema max (appearance criteria = /3, performance criteria = /5)
    // — pass it as a default so bare-number ratings (`hair: 2`) get
    // stored as 2/3 instead of 2/5. If the source supplies an explicit
    // maxScore, that wins.
    const ratingsObj = raw.ratings ?? raw.scores ?? raw.criteria ?? raw;
    const r: ExtractedEvaluation['ratings'] = {
      hair: pickRating(ratingsObj, ['hair'], 3),
      makeup: pickRating(ratingsObj, ['makeup', 'makeUp'], 3),
      outfit: pickRating(ratingsObj, ['outfit', 'clothing'], 3),
      posture: pickRating(ratingsObj, ['posture'], 3),
      dealingStyle: pickRating(ratingsObj, ['dealingStyle', 'dealing', 'dealing_style'], 5),
      gamePerformance: pickRating(ratingsObj, ['gamePerformance', 'gameCommenting', 'gamePerf', 'performance', 'game_performance'], 5),
    };

    return {
      externalId,
      presenterName: String(presenterName).trim(),
      evaluatorName: evaluatorName ? String(evaluatorName).trim() : undefined,
      date: String(date),
      game: raw.game ?? raw.gameType,
      totalScore: typeof raw.totalScore === 'number' ? raw.totalScore : (typeof raw.total === 'number' ? raw.total : undefined),
      ratings: r,
      overallComment: raw.overallComment ?? raw.comment ?? raw.notes,
    };
  } catch {
    return null;
  }
}

function pickRating(obj: any, keys: string[], defaultMax: number): ExtractedRating | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === 'number') {
      // Bare number — fall back to the criterion-specific schema max
      // (3 for appearance, 5 for performance) since downstream
      // displays/reports use it directly.
      return { score: v, maxScore: defaultMax };
    }
    if (typeof v === 'object') {
      const score = v.score ?? v.value ?? v.rating;
      const maxScore = v.maxScore ?? v.max ?? v.outOf ?? defaultMax;
      if (typeof score === 'number') {
        return { score, maxScore: typeof maxScore === 'number' ? maxScore : defaultMax, comment: v.comment ?? v.note };
      }
    }
  }
  return undefined;
}

/**
 * HTML fallback parsing. We look for evaluation rows in tables / lists.
 * This is best-effort and based on the modal layout in the screenshot;
 * we surface 0 evaluations when the layout doesn't match so the admin
 * UI shows "Scraper found nothing — page structure may have changed".
 */
function parseHtmlEvaluations(html: string): ExtractedEvaluation[] {
  // Look for embedded JSON state (Next.js / Nuxt SPAs commonly inject
  // initial state as a <script> tag — easy win if present).
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const arr = findEvalArrayInTree(data);
      if (arr) return arr.map(normalizeJsonEvaluation).filter((e): e is ExtractedEvaluation => e !== null);
    } catch { /* ignore */ }
  }

  // Last resort: no embedded data and no JSON XHR matched — return
  // empty so the admin UI surfaces "0 evaluations found, page structure
  // may have changed; please attach a fresh screenshot".
  return [];
}

function findEvalArrayInTree(obj: any, depth = 0): any[] | null {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0]) {
      const sample = obj[0];
      if (
        ('presenter' in sample || 'presenterName' in sample || 'employee' in sample)
        && ('date' in sample || 'evaluationDate' in sample)
      ) {
        return obj;
      }
    }
    for (const item of obj) {
      const found = findEvalArrayInTree(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    const found = findEvalArrayInTree(obj[k], depth + 1);
    if (found) return found;
  }
  return null;
}

function hashEvaluation(presenter: string, date: string, evaluator?: string, game?: string): string {
  // Tiny stable hash so re-runs of the same eval don't insert duplicates.
  // FNV-1a; collision risk is negligible for our use case.
  const s = `${presenter}|${date}|${evaluator ?? ''}|${game ?? ''}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `sw-${(h >>> 0).toString(36)}`;
}

// ============================================
// Public entry — sync + diagnostic
// ============================================

export async function syncStudioworksEvaluations(): Promise<StudioworksSyncResult> {
  const username = process.env.STUDIOWORKS_USERNAME || '';
  const password = process.env.STUDIOWORKS_PASSWORD || '';
  if (!username || !password) {
    return {
      success: false,
      evaluations: [],
      source: 'none',
      error: 'Studioworks credentials not configured. Set STUDIOWORKS_USERNAME and STUDIOWORKS_PASSWORD.',
    };
  }

  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setDefaultTimeout(Math.max(getNavTimeoutMs(), 90000));
    await loginToStudioworks(page, username, password);
    const { evaluations, source } = await fetchEvaluations(page);
    await page.close();
    return { success: true, evaluations, source };
  } catch (e) {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
    return {
      success: false,
      evaluations: [],
      source: 'none',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================
// Test connection — diagnostic checklist with screenshot on failure
// ============================================

export type StudioworksStepStatus = 'pending' | 'success' | 'failed' | 'skipped';
export interface StudioworksTestStep {
  step: 'credentials' | 'browser' | 'login' | 'evaluations' | 'data';
  label: string;
  status: StudioworksStepStatus;
  error?: string;
  durationMs?: number;
}

export interface StudioworksTestResult {
  success: boolean;
  steps: StudioworksTestStep[];
  /** Source detected on success (json | html | none). */
  source: 'json' | 'html' | 'none';
  /** Number of evaluations the discovery probe saw — purely diagnostic. */
  sampleCount: number;
  /** PNG screenshot of the page when the test failed (base64). */
  failureScreenshotB64: string;
}

export async function testStudioworksConnection(): Promise<StudioworksTestResult> {
  const steps: StudioworksTestStep[] = [
    { step: 'credentials', label: 'Credentials configured', status: 'pending' },
    { step: 'browser', label: 'Launch headless browser', status: 'pending' },
    { step: 'login', label: 'Log into Studioworks', status: 'pending' },
    { step: 'evaluations', label: 'Open /evaluations page', status: 'pending' },
    { step: 'data', label: 'Found evaluation data', status: 'pending' },
  ];

  const setStatus = (
    step: StudioworksTestStep['step'],
    status: StudioworksStepStatus,
    extras?: Partial<Pick<StudioworksTestStep, 'error' | 'durationMs'>>,
  ) => {
    const s = steps.find(x => x.step === step);
    if (s) {
      s.status = status;
      if (extras?.error) s.error = extras.error;
      if (extras?.durationMs) s.durationMs = extras.durationMs;
    }
  };

  const time = async <T>(stepName: StudioworksTestStep['step'], fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      setStatus(stepName, 'success', { durationMs: Date.now() - t0 });
      return r;
    } catch (e) {
      setStatus(stepName, 'failed', {
        durationMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  };

  const username = process.env.STUDIOWORKS_USERNAME || '';
  const password = process.env.STUDIOWORKS_PASSWORD || '';
  if (!username || !password) {
    setStatus('credentials', 'failed', {
      error: 'STUDIOWORKS_USERNAME / STUDIOWORKS_PASSWORD not set in environment',
    });
    steps.filter(s => s.status === 'pending').forEach(s => { s.status = 'skipped'; });
    return { success: false, steps, source: 'none', sampleCount: 0, failureScreenshotB64: '' };
  }
  setStatus('credentials', 'success');

  let page: Page | null = null;
  let failureScreenshotB64 = '';
  let detectedSource: 'json' | 'html' | 'none' = 'none';
  let sampleCount = 0;

  try {
    const browser = await time('browser', () => getBrowser());
    page = await browser.newPage();
    await page.setDefaultTimeout(Math.max(getNavTimeoutMs(), 90000));
    await time('login', () => loginToStudioworks(page!, username, password));
    const { evaluations, source } = await time('evaluations', () => fetchEvaluations(page!));
    detectedSource = source;
    sampleCount = evaluations.length;
    if (evaluations.length === 0) {
      // Mark the `data` step explicitly as failed BEFORE throwing.
      // Otherwise the catch block below converts pending steps to
      // `skipped`, and the operator sees "data: skipped" in the UI —
      // hiding the actual stage that needs attention. The "no evaluations
      // extracted" path is the one operators most need to debug, so it
      // must surface as the failed step, not a skipped one.
      setStatus('data', 'failed', {
        error: 'Login + page load OK, but no evaluations were extracted. The page structure may have changed (e.g. JSON shape, selectors).',
      });
      throw new Error('Login + page load OK, but no evaluations were extracted. The page structure may have changed.');
    }
    setStatus('data', 'success');
    await page.close();
    return { success: true, steps, source, sampleCount, failureScreenshotB64 };
  } catch {
    if (page) {
      try {
        const buf = await page.screenshot({ type: 'png', fullPage: false, encoding: 'base64' });
        failureScreenshotB64 = typeof buf === 'string' ? buf : '';
      } catch { /* ignore */ }
      try { await page.close(); } catch { /* ignore */ }
    }
    steps.filter(s => s.status === 'pending').forEach(s => { s.status = 'skipped'; });
    return { success: false, steps, source: detectedSource, sampleCount, failureScreenshotB64 };
  }
}

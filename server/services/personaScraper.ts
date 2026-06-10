/**
 * Persona HR System Scraper
 * Logs into persona.fujitsu.ee and extracts attendance data (sick leaves, missed days, extra shifts)
 * for a given month/year and project ID.
 */
import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { existsSync } from 'node:fs';

const PERSONA_URL = 'https://persona.fujitsu.ee/Persona/Avaleht/Login_EmbInt.aspx?ReturnUrl=%2fPersona';
const SCHEDULE_ENTRY_URL = 'https://persona.fujitsu.ee/Persona/Pages/ErrorPages/ErrorPage.aspx';

/**
 * Navigation timeout in ms.
 *
 * Default 60s — Persona login routinely chains through a v3 reverse-proxy
 * (Fujitsu auth → ADFS → callback → final landing) and a single 30s budget
 * was firing on the proxy round-trip even when the network was healthy.
 *
 * Override via PERSONA_NAV_TIMEOUT_MS for environments where the proxy is
 * slower (or faster) than the median. The Manus deploy image takes ~25-35s
 * on a cold start so 60s gives ample headroom.
 */
function getNavTimeoutMs(): number {
  const fromEnv = parseInt(process.env.PERSONA_NAV_TIMEOUT_MS || '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 60000;
}

/**
 * Run `fn`, label any error with `step`, and retry once on transient
 * Puppeteer failures (TimeoutError, ProtocolError, frame detached, target
 * closed). A second timeout is treated as fatal — at that point either the
 * proxy is genuinely down or the credentials are wrong, neither of which a
 * third retry will fix.
 */
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
    // One retry — short pause to let any pending redirect settle.
    await new Promise(r => setTimeout(r, 1500));
    try {
      return await fn();
    } catch (e2) {
      throw new Error(`[${step}] ${e2 instanceof Error ? e2.message : String(e2)} (retried once)`);
    }
  }
}

export interface PersonaWorkerAttendance {
  name: string;
  workerId: number;
  projectId: number;
  sickLeaves: number;
  missedDays: number;
  extraShifts: number;
  /** Number of late-to-work events in this month. */
  lateToWork: number;
  /** Per-day breakdown — exact dates that fell into each bucket.
   *  Saved alongside the monthly counts so the FM can drill in to
   *  see "which 4 days was she sick?" without re-scraping. */
  dayBreakdown: {
    sick: string[];        // ISO yyyy-mm-dd
    missed: string[];
    extra: string[];
    late: string[];
  };
}

export interface PersonaSyncResult {
  success: boolean;
  workers: PersonaWorkerAttendance[];
  error?: string;
  month: number;
  year: number;
  /** Diagnostic — all distinct shift-type keys parsed from the page,
   *  with the count per bucket. Surfaces in the admin UI so when the
   *  parser misclassifies (e.g. Persona introduces a new variant
   *  suffix) the operator can see "we saw X type but couldn't bucket
   *  it" instead of silently getting 0/0/0/0 for everyone. */
  diagnostics?: {
    allTypes: string[];
    bucketCounts: { sick: number; missed: number; extra: number; late: number; unknown: number };
  };
}

let browserInstance: Browser | null = null;

/**
 * Resolve the Chromium executable path.
 *
 * History:
 *   v1 — hardcoded `/usr/bin/chromium`. Failed: Manus image has no apt chrome.
 *   v2 — fallback list of system paths. Same failure.
 *   v3 — `puppeteer` (full) bundled chromium download. The download succeeded
 *        but the binary couldn't load `libglib-2.0.so.0` and friends — Manus's
 *        minimal image lacks the GUI libs Chrome links against at runtime.
 *   v4 (now) — `@sparticuz/chromium`: a self-contained Chromium build for
 *        serverless / distroless Linux with all dependencies bundled. Same
 *        package AWS Lambda uses; the standard fix for the
 *        "libglib-2.0.so.0: cannot open shared object file" Puppeteer error.
 *        An optional env-var override is preserved for laptops / bare-metal
 *        servers that DO have a system chrome.
 *
 * Resolution order:
 *   1. PUPPETEER_EXECUTABLE_PATH / CHROMIUM_PATH (operator override)
 *   2. Common system paths
 *   3. `chromium.executablePath()` from @sparticuz/chromium (the fallback
 *      that actually works on the deploy image)
 */
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
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  // No env / system binary — use the bundled serverless build.
  return await chromium.executablePath();
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  const executablePath = await resolveChromiumExecutable();
  // `chromium.args` includes the flags @sparticuz/chromium recommends for
  // running in a sandboxed/distroless container (font config, GL flags,
  // shared-memory tuning). Merge them with our domain-specific flags.
  //
  // We pass `env: process.env` explicitly so the LD_LIBRARY_PATH that
  // chromium.executablePath() set during extraction is captured at
  // launch time. Default puppeteer behaviour does inherit env, but
  // some serverless platforms strip env on child process spawn so an
  // explicit pass-through avoids surprises.
  try {
    browserInstance = await puppeteer.launch({
      executablePath,
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      env: { ...(process.env as Record<string, string>) },
      headless: true,
    });
    return browserInstance;
  } catch (err) {
    // Translate cryptic shared-library errors into something the
    // operator can actually act on. Manus / minimal Linux images
    // don't ship libnspr4/libnss3/libgconf etc. that Chromium loads
    // dynamically. Detect that signature and re-throw with a clear
    // remediation message.
    const msg = err instanceof Error ? err.message : String(err);
    if (/shared libraries|cannot open shared object|libnspr|libnss/i.test(msg)) {
      throw new Error(
        `[chromium] Missing system shared libraries. Chromium binary launched but couldn't load its deps.\n\n` +
        `Original error: ${msg}\n\n` +
        `Fix on the deploy host (one of):\n` +
        `  1. Install Chromium runtime libs:\n` +
        `     apt-get install -y libnspr4 libnss3 libgconf-2-4 libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0\n` +
        `  2. OR set PUPPETEER_EXECUTABLE_PATH to a system Chromium with deps already installed.`,
      );
    }
    throw err;
  }
}

async function loginToPersona(page: Page, username: string, password: string): Promise<void> {
  const navTimeout = getNavTimeoutMs();

  await withStepRetry('open login page', () =>
    page.goto(PERSONA_URL, { waitUntil: 'domcontentloaded', timeout: navTimeout })
  );

  const hasLoginForm = await page.$('#UsernameTextBox');
  if (!hasLoginForm) {
    return; // Already logged in
  }

  await page.type('#UsernameTextBox', username);
  await page.type('#PasswordTextBox', password);

  // Click login + wait for the v3-proxy redirect chain to leave the
  // login page. Set up the wait BEFORE the click so the redirect
  // can't fire and complete before we're listening (Promise.all
  // pattern recommended by the Puppeteer docs for click-then-nav).
  await withStepRetry('login redirect', () =>
    Promise.all([
      page.click('#LoginButton'),
      page.waitForFunction(
        () => !window.location.href.includes('Login_EmbInt'),
        { timeout: navTimeout, polling: 500 },
      ),
    ])
  );

  // Persona's login finishes by chaining 2-3 redirects through the v3
  // reverse-proxy; the URL leaves Login_EmbInt almost immediately but
  // the final landing page is still loading. waitForNetworkIdle lets
  // the chain settle before any subsequent goto/postback fires. Best-
  // effort: if it never goes idle (e.g. long-poll connection) we fall
  // through after the timeout — the next step has its own timeout to
  // surface a clean error.
  try {
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 });
  } catch {
    /* network never went idle — proceed; downstream steps will fail loudly if it matters */
  }
}

async function navigateToSchedule(page: Page): Promise<void> {
  const navTimeout = getNavTimeoutMs();

  await withStepRetry('open schedule entry page', () =>
    page.goto(SCHEDULE_ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: navTimeout })
  );

  const hasMenu = await page.$('#ctl00_PersonaMainMenu_Link6');
  if (!hasMenu) {
    throw new Error('[schedule menu] Login appears to have failed — main menu not found');
  }

  // Trigger __doPostBack and wait for the resulting nav. As with login,
  // set up waitForNavigation BEFORE the postback fires so we don't lose
  // the event to a race.
  await withStepRetry('open schedule (Graafik)', () =>
    Promise.all([
      page.evaluate(() => {
        (window as any).__doPostBack('ctl00$PersonaMainMenu$Link6', '');
      }),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: navTimeout }),
    ])
  );

  const url = page.url();
  if (!url.includes('Graafik')) {
    throw new Error(`[schedule menu] Failed to land on schedule page. Current URL: ${url}`);
  }
}

async function selectMonthYear(page: Page, month: number, year: number): Promise<void> {
  // Find year and month selectors by checking various possible IDs
  const yearSelId = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const s of selects) {
      const options = Array.from(s.options).map(o => o.value);
      if (options.includes('2024') || options.includes('2025') || options.includes('2026')) {
        return s.id;
      }
    }
    return null;
  });

  const monthSelId = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const s of selects) {
      const options = Array.from(s.options).map(o => o.value);
      if (options.includes('1') && options.includes('12') && options.length <= 13) {
        return s.id;
      }
    }
    return null;
  });

  if (yearSelId) {
    await page.select(`#${yearSelId}`, year.toString());
    await new Promise(r => setTimeout(r, 1000));
  }

  if (monthSelId) {
    await page.select(`#${monthSelId}`, month.toString());
    await new Promise(r => setTimeout(r, 1000));
  }

  // Wait for data to reload
  await new Promise(r => setTimeout(r, 3000));
}

function parseShiftTypes(html: string): {
  sickIndices: Set<number>;
  missedIndices: Set<number>;
  extraIndices: Set<number>;
  lateIndices: Set<number>;
  /** All discovered shift-type keys, in order. Surfaced via the sync
   *  result so the admin can see exactly what Persona returned and we
   *  can iterate on the matching rules without re-scraping. */
  allTypes: string[];
  /** Counts of each bucket for diagnostics — appears in the test
   *  connection result so the admin can see at a glance whether
   *  the parser actually recognized any types. */
  bucketCounts: { sick: number; missed: number; extra: number; late: number; unknown: number };
} {
  const viewtoopostMatches = html.match(/TgAddViewToopost\(([^;]+)\);/g) || [];
  const toopostMatches = html.match(/TgAddToopost\(([^;]+)\);/g) || [];

  const allTypes: string[] = [];

  for (const t of viewtoopostMatches) {
    const inner = t.replace(/^TgAddViewToopost\(/, '').replace(/\);$/, '');
    const parts = inner.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    allTypes.push(parts[0]);
  }

  for (const t of toopostMatches) {
    const inner = t.replace(/^TgAddToopost\(/, '').replace(/\);$/, '');
    const parts = inner.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    allTypes.push(parts[0]);
  }

  const sickIndices = new Set<number>();
  const missedIndices = new Set<number>();
  const extraIndices = new Set<number>();
  const lateIndices = new Set<number>();

  // PREFIX-based matching — earlier we used exact-match strings like
  // "Haigusleht|1", but Persona's encoding varies between projects /
  // schedule versions. Real-world scrape on Team Nu showed 165 workers
  // matched but every count returned 0/0/0 because the project uses
  // suffixes like "|5" / "|7" we hadn't seen. Matching on the Estonian
  // category prefix is robust to those variations.
  //
  // Reference categories (Estonian -> English):
  //   Haigusleht*    -> sick leave
  //   TooPeatumine*  -> work interruption / missed
  //   VabaPaev*      -> day off / extra shift
  //   Hilinemine*    -> late to work
  // Anything else falls into "unknown" for diagnostic purposes.
  //
  // Matching is case-insensitive on a normalised lowercase key so all
  // diacritic / camel-case variants ("TooPeatumine", "Tööpeatumine",
  // "TööPeatumine", "tööpeatumine") land in the same bucket. The exact
  // raw key is still preserved in `allTypes` for diagnostics.
  allTypes.forEach((rawKey, i) => {
    const key = (rawKey ?? "").trim().toLowerCase();
    if (key.startsWith('haigusleht')) {
      sickIndices.add(i);
    } else if (key.startsWith('toopeatumine') || key.startsWith('tööpeatumine')) {
      missedIndices.add(i);
    } else if (key.startsWith('vabapaev') || key.startsWith('vabapäev')) {
      extraIndices.add(i);
    } else if (key.startsWith('hilinemine') || key.startsWith('hilinen')) {
      lateIndices.add(i);
    }
  });

  const bucketCounts = {
    sick: sickIndices.size,
    missed: missedIndices.size,
    extra: extraIndices.size,
    late: lateIndices.size,
    unknown: allTypes.length - sickIndices.size - missedIndices.size - extraIndices.size - lateIndices.size,
  };

  return { sickIndices, missedIndices, extraIndices, lateIndices, allTypes, bucketCounts };
}

function parseWorkerData(
  html: string,
  month: number,
  year: number,
  projectId: number | null,
  sickIndices: Set<number>,
  missedIndices: Set<number>,
  extraIndices: Set<number>,
  lateIndices: Set<number>,
): PersonaWorkerAttendance[] {
  // Find the script block with TgAddWorker and TgAddTime
  const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || [];
  let workerScript = '';

  for (const s of scriptMatches) {
    if (s.includes('TgAddWorker') && s.includes('TgAddTime')) {
      workerScript = s.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      break;
    }
  }

  if (!workerScript) {
    return [];
  }

  // Split into worker blocks
  const workerBlocks = workerScript.split(/(?=\s*worker = TgAddWorker)/);
  const results: PersonaWorkerAttendance[] = [];

  for (const block of workerBlocks) {
    const workerMatch = block.match(/worker = TgAddWorker\("([^"]+)", (\d+), (\d+)/);
    if (!workerMatch) continue;

    const name = workerMatch[1];
    const workerId = parseInt(workerMatch[2]);
    const workerProjectId = parseInt(workerMatch[3]);

    // Filter by project ID if specified
    if (projectId !== null && workerProjectId !== projectId) {
      continue;
    }

    // Parse time entries for this worker
    const timeEntryMatches = block.match(/TgAddTime\(worker, (\d+), (\d+), (\d+), (\d+)/g) || [];

    // Aggregate per-day breakdown — Set so duplicate slots within
    // the same day count once (Persona sometimes splits one absence
    // into multiple time entries).
    const sickDays = new Set<string>();
    const missedDays = new Set<string>();
    const extraDays = new Set<string>();
    const lateDays = new Set<string>();

    for (const entry of timeEntryMatches) {
      const m = entry.match(/TgAddTime\(worker, (\d+), (\d+), (\d+), (\d+)/);
      if (!m) continue;

      const startTs = parseInt(m[2]);
      const typeIdx = parseInt(m[4]);

      const startDate = new Date(startTs);
      const entryMonth = startDate.getUTCMonth() + 1;
      const entryYear = startDate.getUTCFullYear();
      // ISO yyyy-mm-dd in UTC — same convention used by attendance
      // breakdown elsewhere.
      const dayKey = startDate.toISOString().slice(0, 10);

      if (entryMonth === month && entryYear === year) {
        if (sickIndices.has(typeIdx)) sickDays.add(dayKey);
        else if (missedIndices.has(typeIdx)) missedDays.add(dayKey);
        else if (extraIndices.has(typeIdx)) extraDays.add(dayKey);
        else if (lateIndices.has(typeIdx)) lateDays.add(dayKey);
      }
    }

    results.push({
      name,
      workerId,
      projectId: workerProjectId,
      sickLeaves: sickDays.size,
      missedDays: missedDays.size,
      extraShifts: extraDays.size,
      lateToWork: lateDays.size,
      dayBreakdown: {
        sick: Array.from(sickDays).sort(),
        missed: Array.from(missedDays).sort(),
        extra: Array.from(extraDays).sort(),
        late: Array.from(lateDays).sort(),
      },
    });
  }

  return results;
}

export async function syncPersonaAttendance(
  month: number,
  year: number,
  projectId: number | null = null
): Promise<PersonaSyncResult> {
  const username = process.env.PERSONA_USERNAME || '';
  const password = process.env.PERSONA_PASSWORD || '';

  if (!username || !password) {
    return {
      success: false,
      workers: [],
      error: 'Persona credentials not configured. Set PERSONA_USERNAME and PERSONA_PASSWORD.',
      month,
      year,
    };
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    // Default timeout for any page operation that doesn't take an
    // explicit timeout. Keep it >= getNavTimeoutMs() so a default-bound
    // call never trips before our explicit-timeout calls do.
    await page.setDefaultTimeout(Math.max(getNavTimeoutMs(), 90000));

    // Login to Persona
    await loginToPersona(page, username, password);

    // Navigate to schedule page
    await navigateToSchedule(page);

    // Select target month/year if different from current
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    if (month !== currentMonth || year !== currentYear) {
      await selectMonthYear(page, month, year);
    } else {
      // Still wait for data to fully load
      await new Promise(r => setTimeout(r, 2000));
    }

    // Get page HTML
    const html = await page.content();

    if (!html.includes('TgAddWorker')) {
      await page.close();
      return {
        success: false,
        workers: [],
        error: 'Schedule data not found. The page may not have loaded correctly.',
        month,
        year,
      };
    }

    // Parse shift type indices
    const shiftTypes = parseShiftTypes(html);
    const { sickIndices, missedIndices, extraIndices, lateIndices, allTypes, bucketCounts } = shiftTypes;

    // Parse worker attendance data
    const workers = parseWorkerData(html, month, year, projectId, sickIndices, missedIndices, extraIndices, lateIndices);

    await page.close();

    return {
      success: true,
      workers,
      month,
      year,
      diagnostics: {
        // Cap distinct types to avoid blowing up the UI when Persona
        // returns hundreds of distinct keys.
        allTypes: Array.from(new Set(allTypes)).slice(0, 50),
        bucketCounts,
      },
    };
  } catch (error) {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
    return {
      success: false,
      workers: [],
      error: error instanceof Error ? error.message : String(error),
      month,
      year,
    };
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch { /* ignore */ }
    browserInstance = null;
  }
}

// ============================================
// Diagnostic test connection
// ============================================

export type TestStepStatus = "pending" | "success" | "failed" | "skipped";

export interface TestConnectionStep {
  step: "credentials" | "browser" | "login" | "schedule" | "data";
  label: string;
  status: TestStepStatus;
  /** Error message (only set when status==="failed"). */
  error?: string;
  /** Wall-clock duration of this step in ms. */
  durationMs?: number;
}

export interface TestConnectionResult {
  success: boolean;
  steps: TestConnectionStep[];
  /** PNG screenshot of the last page state, base64-encoded. Captured on
   *  failure so the admin can see what Persona looked like when sync broke
   *  (login form? error page? blank?). Empty string on success.
   */
  failureScreenshotB64: string;
  /** Discovered shift-type keys + bucket counts. Surfaces what Persona
   *  actually returned so we can iterate on the parser when a project
   *  uses unfamiliar variants. Set even on partial failure. */
  parserDiagnostics?: {
    allTypes: string[];
    bucketCounts: { sick: number; missed: number; extra: number; late: number; unknown: number };
  };
}

/**
 * Run the Persona sync flow up through schedule-page navigation, but
 * skip month-year selection and worker parsing. Used by the admin
 * "Test Connection" button so the FM can verify auth + reachability
 * without waiting for a full sync (which can take 30-60s).
 *
 * Returns a per-step status array so the UI can render a checklist
 * showing exactly which step failed. On failure, captures a screenshot
 * so the admin can see the actual page state — invaluable when Persona
 * silently changes a selector or pops up a CAPTCHA.
 */
export async function testPersonaConnection(): Promise<TestConnectionResult> {
  const steps: TestConnectionStep[] = [
    { step: "credentials", label: "Credentials configured", status: "pending" },
    { step: "browser", label: "Launch headless browser", status: "pending" },
    { step: "login", label: "Log into Persona", status: "pending" },
    { step: "schedule", label: "Open schedule page", status: "pending" },
    { step: "data", label: "Schedule data present", status: "pending" },
  ];

  const setStatus = (
    step: TestConnectionStep["step"],
    status: TestStepStatus,
    extras?: Partial<Pick<TestConnectionStep, "error" | "durationMs">>,
  ) => {
    const s = steps.find(x => x.step === step);
    if (s) {
      s.status = status;
      if (extras?.error) s.error = extras.error;
      if (extras?.durationMs) s.durationMs = extras.durationMs;
    }
  };

  const time = async <T>(stepName: TestConnectionStep["step"], fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      setStatus(stepName, "success", { durationMs: Date.now() - t0 });
      return r;
    } catch (e) {
      setStatus(stepName, "failed", {
        durationMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  };

  const username = process.env.PERSONA_USERNAME || '';
  const password = process.env.PERSONA_PASSWORD || '';

  if (!username || !password) {
    setStatus("credentials", "failed", {
      error: "PERSONA_USERNAME / PERSONA_PASSWORD not set in environment",
    });
    // Mark remaining steps as skipped for visual clarity.
    steps.filter(s => s.status === "pending").forEach(s => { s.status = "skipped"; });
    return { success: false, steps, failureScreenshotB64: "" };
  }
  setStatus("credentials", "success");

  let browser: Browser | null = null;
  let page: Page | null = null;
  let failureScreenshotB64 = "";

  try {
    browser = await time("browser", () => getBrowser());
    page = await browser.newPage();
    await page.setDefaultTimeout(Math.max(getNavTimeoutMs(), 90000));

    await time("login", () => loginToPersona(page!, username, password));
    await time("schedule", () => navigateToSchedule(page!));

    const html = await page.content();
    if (!html.includes('TgAddWorker')) {
      throw new Error("Schedule page loaded but contains no worker data (TgAddWorker missing)");
    }

    // Run the parser pass so we can surface discovered shift-types
    // + bucket counts. Lets the admin diagnose "matched 10 GPs but
    // all show 0 sick/missed/extra" without having to do a full sync.
    let parserDiagnostics: TestConnectionResult["parserDiagnostics"];
    try {
      const shiftTypes = parseShiftTypes(html);
      parserDiagnostics = {
        allTypes: Array.from(new Set(shiftTypes.allTypes)).slice(0, 50),
        bucketCounts: shiftTypes.bucketCounts,
      };
    } catch { /* diagnostic-only, never block the test */ }

    setStatus("data", "success");

    await page.close();
    return { success: true, steps, failureScreenshotB64, parserDiagnostics };
  } catch {
    // Capture a screenshot of whatever Persona is showing right now so
    // the admin can SEE what happened. We swallow screenshot errors —
    // the underlying Puppeteer failure is what we report up.
    if (page) {
      try {
        const buf = await page.screenshot({ type: "png", fullPage: false, encoding: "base64" });
        failureScreenshotB64 = typeof buf === "string" ? buf : "";
      } catch {
        /* screenshot failed too — ignore, original error is already in steps */
      }
      try { await page.close(); } catch { /* ignore */ }
    }
    // Skip any still-pending downstream steps so the UI shows them
    // greyed out instead of forever-pending.
    steps.filter(s => s.status === "pending").forEach(s => { s.status = "skipped"; });
    return { success: false, steps, failureScreenshotB64 };
  }
}

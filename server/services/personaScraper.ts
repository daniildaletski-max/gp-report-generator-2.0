/**
 * Persona HR System Scraper
 * Logs into persona.fujitsu.ee and extracts attendance data (sick leaves, missed days, extra shifts)
 * for a given month/year and project ID.
 */
import puppeteer, { Browser, Page } from 'puppeteer-core';

const PERSONA_URL = 'https://persona.fujitsu.ee/Persona/Avaleht/Login_EmbInt.aspx?ReturnUrl=%2fPersona';
const SCHEDULE_ENTRY_URL = 'https://persona.fujitsu.ee/Persona/Pages/ErrorPages/ErrorPage.aspx';

export interface PersonaWorkerAttendance {
  name: string;
  workerId: number;
  projectId: number;
  sickLeaves: number;
  missedDays: number;
  extraShifts: number;
}

export interface PersonaSyncResult {
  success: boolean;
  workers: PersonaWorkerAttendance[];
  error?: string;
  month: number;
  year: number;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  browserInstance = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return browserInstance;
}

async function loginToPersona(page: Page, username: string, password: string): Promise<void> {
  await page.goto(PERSONA_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const hasLoginForm = await page.$('#UsernameTextBox');
  if (!hasLoginForm) {
    return; // Already logged in
  }

  await page.type('#UsernameTextBox', username);
  await page.type('#PasswordTextBox', password);

  // Click login - page may redirect to v3 proxy
  page.click('#LoginButton');

  await page.waitForFunction(
    () => !window.location.href.includes('Login_EmbInt'),
    { timeout: 30000 }
  );
}

async function navigateToSchedule(page: Page): Promise<void> {
  // Navigate to a page that has the main menu
  await page.goto(SCHEDULE_ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const hasMenu = await page.$('#ctl00_PersonaMainMenu_Link6');
  if (!hasMenu) {
    throw new Error('Not logged in or schedule menu not found');
  }

  // Click Schedule menu (Link6)
  await page.evaluate(() => {
    (window as any).__doPostBack('ctl00$PersonaMainMenu$Link6', '');
  });

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });

  const url = page.url();
  if (!url.includes('Graafik')) {
    throw new Error(`Failed to navigate to schedule page. Current URL: ${url}`);
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

  allTypes.forEach((key, i) => {
    // Haigusleht|1 = sick leave, Haigusleht|3 = continuation sick leave
    if (key === 'Haigusleht|1' || key === 'Haigusleht|3') {
      sickIndices.add(i);
    }
    // TooPeatumine|2 = missed day
    if (key === 'TooPeatumine|2') {
      missedIndices.add(i);
    }
    // VabaPaev|4 = extra shift (ExtraS)
    if (key === 'VabaPaev|4') {
      extraIndices.add(i);
    }
  });

  return { sickIndices, missedIndices, extraIndices };
}

function parseWorkerData(
  html: string,
  month: number,
  year: number,
  projectId: number | null,
  sickIndices: Set<number>,
  missedIndices: Set<number>,
  extraIndices: Set<number>
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

    let sickCount = 0;
    let missedCount = 0;
    let extraCount = 0;

    for (const entry of timeEntryMatches) {
      const m = entry.match(/TgAddTime\(worker, (\d+), (\d+), (\d+), (\d+)/);
      if (!m) continue;

      const startTs = parseInt(m[2]);
      const typeIdx = parseInt(m[4]);

      const startDate = new Date(startTs);
      const entryMonth = startDate.getUTCMonth() + 1;
      const entryYear = startDate.getUTCFullYear();

      if (entryMonth === month && entryYear === year) {
        if (sickIndices.has(typeIdx)) {
          sickCount++;
        } else if (missedIndices.has(typeIdx)) {
          missedCount++;
        } else if (extraIndices.has(typeIdx)) {
          extraCount++;
        }
      }
    }

    results.push({
      name,
      workerId,
      projectId: workerProjectId,
      sickLeaves: sickCount,
      missedDays: missedCount,
      extraShifts: extraCount,
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
    await page.setDefaultTimeout(60000);

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
    const { sickIndices, missedIndices, extraIndices } = parseShiftTypes(html);

    // Parse worker attendance data
    const workers = parseWorkerData(html, month, year, projectId, sickIndices, missedIndices, extraIndices);

    await page.close();

    return {
      success: true,
      workers,
      month,
      year,
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

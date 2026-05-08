import { Resend } from "resend";
import { ENV } from "./env";

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  /** Optional HTML body. When provided, Resend renders both text and HTML. */
  html?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  /**
   * Optional idempotency key — when supplied, Resend dedups duplicate
   * sends for the same key. Critical for the cron retry path: if a
   * marker-write fails after a successful send, the next retry day
   * would otherwise re-send the same email; with this key Resend
   * recognises the duplicate and silently no-ops the second call.
   */
  idempotencyKey?: string;
};

// Cache the verified domain to avoid repeated API calls
let cachedFromAddress: string | null = null;
let lastDomainCheck = 0;
const DOMAIN_CHECK_INTERVAL = 5 * 60 * 1000; // Re-check every 5 minutes

/**
 * Determines the best "from" address by checking if a domain is verified in Resend.
 * Falls back to reports@resend.dev if not verified.
 *
 * Exported so the boot-time audit can call this and log which
 * from-address the system will actually use — letting the operator
 * confirm a newly-verified Resend domain has taken effect without
 * sending a real test email.
 *
 * `skipCache` — when `true`, neither READS from the 5-minute cache
 * nor WRITES the resolved value back to it. Used by the boot audit
 * so a transient Resend API failure at startup doesn't pollute the
 * send-time cache with the resend.dev fallback for 5 minutes after
 * (Codex P2 — "Avoid priming the send cache from boot audit").
 */
export async function getFromAddress(opts?: { skipCache?: boolean }): Promise<string> {
  const skipCache = opts?.skipCache === true;
  const now = Date.now();

  // Cached fast-path — only when the caller is happy with cached
  // values (the normal send path is, the boot audit is not).
  if (!skipCache && cachedFromAddress && (now - lastDomainCheck) < DOMAIN_CHECK_INTERVAL) {
    return cachedFromAddress;
  }

  if (!ENV.resendApiKey) {
    return "GP Report Generator <reports@resend.dev>";
  }

  let resolved: string;
  try {
    const resend = new Resend(ENV.resendApiKey);
    const { data } = await resend.domains.list();
    // Accept any status where DKIM + SPF are good enough for sending.
    // Resend's dashboard shows "Partially Verified" when sending records
    // are green but the optional receiving MX is still pending — that
    // domain is fully usable for outbound mail and the API surfaces it
    // as `verified` (or `active` on legacy keys, `partially_verified`
    // on newer ones). Without `partially_verified` here we'd ignore a
    // perfectly good sending domain and silently fall back to
    // resend.dev — which only delivers to the account owner.
    const sendableStatuses = new Set(["verified", "active", "partially_verified"]);
    const verifiedDomain = data?.data?.find((d: any) => sendableStatuses.has(d.status));
    if (verifiedDomain) {
      resolved = `GP Report Generator <reports@${verifiedDomain.name}>`;
      console.log(`[Email] Using verified domain: ${verifiedDomain.name} (status=${verifiedDomain.status})`);
    } else {
      const seenStatuses = data?.data?.map((d: any) => `${d.name}:${d.status}`).join(", ") || "(none)";
      resolved = "GP Report Generator <reports@resend.dev>";
      console.log(`[Email] No verified domain found, using resend.dev fallback. Domains seen: ${seenStatuses}`);
    }
  } catch (err) {
    console.warn("[Email] Failed to check domains, using resend.dev fallback:", err);
    resolved = "GP Report Generator <reports@resend.dev>";
  }

  // Only persist into the 5-minute cache when the caller is the send
  // path. Boot audit calls leave the cache untouched so the first
  // real send re-resolves freshly.
  if (!skipCache) {
    cachedFromAddress = resolved;
    lastDomainCheck = now;
  }
  return resolved;
}

/**
 * Sends an email through Resend API.
 * Returns `true` if the email was sent successfully, `false` otherwise.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[Email] RESEND_API_KEY is not configured. Email will not be sent.");
    return false;
  }

  const resend = new Resend(ENV.resendApiKey);
  const fromAddress = await getFromAddress();

  try {
    // Build attachments array if URL provided
    const attachments: { filename: string; path: string }[] = [];
    if (payload.attachmentUrl && payload.attachmentName) {
      attachments.push({
        filename: payload.attachmentName,
        path: payload.attachmentUrl,
      });
    }

    const { data, error } = await resend.emails.send(
      {
        from: fromAddress,
        to: [payload.to],
        subject: payload.subject,
        text: payload.body,
        html: payload.html,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      // Resend v6 second-arg `RequestOptions`. When the caller passes
      // an idempotency key, Resend will silently no-op a duplicate send
      // for the same key — making retry-day re-runs safe even when an
      // earlier marker-write failed after a successful send.
      payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined,
    );

    if (error) {
      // Distinguish the three failure modes so the operator sees
      // WHY a send failed instead of just "Failed to send":
      //   - validation/domain error  → from-address not verified;
      //                                 silently caps deliveries to
      //                                 the Resend account owner only
      //   - 403 / forbidden          → also a domain-validation thing
      //                                 in practice (free tier)
      //   - everything else          → transient (network, 5xx)
      const errMsg = error.message ?? "";
      const errCode = (error as { name?: string }).name ?? "unknown";
      const isDomainIssue =
        errMsg.includes("verify a domain") ||
        errMsg.includes("validation_error") ||
        errCode === "validation_error" ||
        errCode === "restricted_api_key";
      if (isDomainIssue) {
        console.warn(
          `[Email] Domain restriction rejected the send to ${payload.to} from ${fromAddress}. ` +
          `Resend's free tier without a verified domain only delivers to the email that owns the account; ` +
          `verify a domain at https://resend.com/domains and set the from-address to use it. ` +
          `Original error: ${errMsg}`,
        );
        cachedFromAddress = null;
        lastDomainCheck = 0;
      } else {
        console.warn(`[Email] Failed to send email to ${payload.to}: ${errMsg} (code=${errCode})`);
      }
      return false;
    }

    console.log(`[Email] Successfully sent email to ${payload.to} from ${fromAddress}, id: ${data?.id}`);
    return true;
  } catch (error) {
    console.warn("[Email] Error sending email:", error);
    return false;
  }
}

/**
 * Sends a Team Monthly Overview email with Excel attachment + optional
 * Google Sheets link.
 *
 * The user explicitly asked that "when the FM generates a Team Monthly
 * Overview, it should arrive in their email in Google Sheets format" —
 * when `googleSheetsUrl` is provided, the email leads with the Sheets
 * link and embeds a quick stats summary so the FM can review at a glance
 * before opening the file. The Excel attachment stays for offline use.
 */
export async function sendReportEmail(params: {
  userEmail: string;
  userName: string;
  teamName: string;
  monthName: string;
  year: number;
  excelUrl: string;
  /** Optional Google Sheets URL — when present, the email leads with this. */
  googleSheetsUrl?: string | null;
  /** Optional summary stats embedded in the email so the FM can read at a glance. */
  summary?: {
    avgScore?: number | null;
    evaluations?: number;
    mistakes?: number;
    attitude?: number;
    gpCount?: number;
  };
  /**
   * Stable idempotency key per (report id, period). When the caller
   * passes one, Resend dedups duplicate sends — so a retry-day
   * re-attempt after a successful send + failed marker-write doesn't
   * double-mail the FM.
   */
  idempotencyKey?: string;
  /**
   * Deterministic "generated at" stamp shown in the email footer.
   * The cron retry path passes the report's `createdAt` so the body
   * bytes match the first attempt — required for Resend's idempotency
   * cache to resolve a duplicate send as a cache hit (same key + same
   * body) instead of a 409 (same key + different body).
   */
  generatedAt?: Date;
}): Promise<boolean> {
  const { userEmail, userName, teamName, monthName, year, excelUrl, googleSheetsUrl, summary, idempotencyKey, generatedAt: generatedAtParam } = params;

  const subject = `Team Monthly Report — ${teamName} (${monthName} ${year})`;
  const generatedAt = (generatedAtParam ?? new Date()).toLocaleString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // Plain-text fallback (Resend sends both text and html when both supplied)
  const body = `
Hello ${userName},

Your Team Monthly Overview for ${teamName} — ${monthName} ${year} is ready.

${googleSheetsUrl ? `Open in Google Sheets:\n${googleSheetsUrl}\n\n` : ""}Excel attachment is included; you can also download it from:
${excelUrl}

${summary ? `Quick numbers:
• Game Presenters: ${summary.gpCount ?? 0}
• Evaluations:    ${summary.evaluations ?? 0}
• Mistakes:       ${summary.mistakes ?? 0}
• Attitude score: ${summary.attitude ?? 0}
${typeof summary.avgScore === 'number' ? `• Avg team score: ${summary.avgScore.toFixed(1)} / 22` : ""}

` : ""}Generated: ${generatedAt}

— GP Report Generator
`.trim();

  // Branded HTML — Resend will render this when the recipient supports HTML
  const stats = summary ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:separate; border-spacing:8px 0; margin:16px 0;">
      <tr>
        ${summary.gpCount !== undefined ? `<td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:11px;text-transform:uppercase;color:#92400e;letter-spacing:.04em;">GPs</div><div style="font-size:22px;font-weight:700;color:#0f172a;">${summary.gpCount}</div></td>` : ""}
        ${summary.evaluations !== undefined ? `<td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:11px;text-transform:uppercase;color:#065f46;letter-spacing:.04em;">Evals</div><div style="font-size:22px;font-weight:700;color:#0f172a;">${summary.evaluations}</div></td>` : ""}
        ${summary.mistakes !== undefined ? `<td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:11px;text-transform:uppercase;color:#991b1b;letter-spacing:.04em;">Mistakes</div><div style="font-size:22px;font-weight:700;color:#0f172a;">${summary.mistakes}</div></td>` : ""}
        ${summary.attitude !== undefined ? `<td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:11px;text-transform:uppercase;color:#3730a3;letter-spacing:.04em;">Attitude</div><div style="font-size:22px;font-weight:700;color:#0f172a;">${summary.attitude > 0 ? '+' : ''}${summary.attitude}</div></td>` : ""}
      </tr>
    </table>` : "";

  const primaryHref = googleSheetsUrl || excelUrl;
  const primaryLabel = googleSheetsUrl ? "Open in Google Sheets" : "Download Excel";

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:24px 28px;background:linear-gradient(135deg,#fef3c7,#fff7ed);border-bottom:1px solid #fde68a;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#b45309;font-weight:600;">Team Monthly Overview</div>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#0f172a;">${teamName} — ${monthName} ${year}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 8px;font-size:15px;">Hello ${userName},</p>
          <p style="margin:0 0 16px;font-size:14px;color:#475569;">Your Team Monthly Overview is ready. ${googleSheetsUrl ? "It's available as a live Google Sheet you can edit and share, plus an Excel attachment for offline use." : "The Excel report is attached, plus a direct download link below."}</p>
          ${stats}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">
            <tr><td>
              <a href="${primaryHref}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#ffffff;font-weight:600;padding:12px 22px;border-radius:12px;text-decoration:none;font-size:14px;">${primaryLabel} →</a>
            </td></tr>
          </table>
          ${googleSheetsUrl ? `<p style="margin:0 0 4px;font-size:12px;color:#64748b;">Excel backup: <a href="${excelUrl}" style="color:#b45309;text-decoration:none;">download .xlsx</a></p>` : ""}
          <hr style="margin:24px 0;border:0;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Generated ${generatedAt}<br>This is an automated message from GP Report Generator.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;

  return sendEmail({
    to: userEmail,
    subject,
    body,
    html,
    attachmentUrl: excelUrl,
    attachmentName: `TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${year}.xlsx`,
    idempotencyKey,
  });
}

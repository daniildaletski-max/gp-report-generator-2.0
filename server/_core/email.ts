import { Resend } from "resend";
import { ENV } from "./env";

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
};

// Cache the verified domain to avoid repeated API calls
let cachedFromAddress: string | null = null;
let lastDomainCheck = 0;
const DOMAIN_CHECK_INTERVAL = 5 * 60 * 1000; // Re-check every 5 minutes

/**
 * Determines the best "from" address by checking if gpreportgen.info is verified in Resend.
 * Falls back to reports@resend.dev if not verified.
 */
async function getFromAddress(): Promise<string> {
  const now = Date.now();
  
  // Return cached value if still fresh
  if (cachedFromAddress && (now - lastDomainCheck) < DOMAIN_CHECK_INTERVAL) {
    return cachedFromAddress;
  }

  if (!ENV.resendApiKey) {
    return "GP Report Generator <reports@resend.dev>";
  }

  try {
    const resend = new Resend(ENV.resendApiKey);
    const { data } = await resend.domains.list();
    
    // Look for a verified domain
    const verifiedDomain = data?.data?.find(
      (d: any) => d.status === "verified" || d.status === "active"
    );
    
    if (verifiedDomain) {
      cachedFromAddress = `GP Report Generator <reports@${verifiedDomain.name}>`;
      console.log(`[Email] Using verified domain: ${verifiedDomain.name}`);
    } else {
      cachedFromAddress = "GP Report Generator <reports@resend.dev>";
      console.log("[Email] No verified domain found, using resend.dev fallback");
    }
  } catch (err) {
    console.warn("[Email] Failed to check domains, using resend.dev fallback:", err);
    cachedFromAddress = "GP Report Generator <reports@resend.dev>";
  }

  lastDomainCheck = now;
  return cachedFromAddress;
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

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [payload.to],
      subject: payload.subject,
      text: payload.body,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) {
      console.warn(`[Email] Failed to send email to ${payload.to}: ${error.message}`);
      // If it's a domain validation error, reset cache so next attempt re-checks
      if (error.message?.includes("verify a domain") || error.message?.includes("validation_error")) {
        cachedFromAddress = null;
        lastDomainCheck = 0;
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
 * Sends a report email with Excel attachment to the user.
 */
export async function sendReportEmail(params: {
  userEmail: string;
  userName: string;
  teamName: string;
  monthName: string;
  year: number;
  excelUrl: string;
}): Promise<boolean> {
  const { userEmail, userName, teamName, monthName, year, excelUrl } = params;
  
  const subject = `📊 Team Monthly Report: ${teamName} - ${monthName} ${year}`;
  
  const body = `
Hello ${userName},

Your Team Monthly Overview report has been generated successfully.

📋 Report Details:
• Team: ${teamName}
• Period: ${monthName} ${year}
• Generated: ${new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}

The Excel report is attached to this email. You can also download it directly from the GP Report Generator dashboard.

📥 Direct Download Link:
${excelUrl}

---
This is an automated message from GP Report Generator.
If you have any questions, please contact your administrator.
`.trim();

  return sendEmail({
    to: userEmail,
    subject,
    body,
    attachmentUrl: excelUrl,
    attachmentName: `TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${year}.xlsx`,
  });
}

/**
 * Sends an immediate Team Monthly Overview notification (no attachment).
 */
export async function sendTeamOverviewEmail(params: {
  userEmail: string;
  userName: string;
  teamName: string;
  monthName: string;
  year: number;
  teamOverview?: string | null;
  goalsThisMonth?: string | null;
  fmPerformance?: string | null;
}): Promise<boolean> {
  const {
    userEmail,
    userName,
    teamName,
    monthName,
    year,
    teamOverview,
    goalsThisMonth,
    fmPerformance,
  } = params;

  const subject = `✅ Team Monthly Overview Created: ${teamName} - ${monthName} ${year}`;

  const overviewText = teamOverview?.trim()
    ? teamOverview.trim()
    : "No team overview was provided.";
  const goalsText = goalsThisMonth?.trim()
    ? goalsThisMonth.trim()
    : "No goals were provided.";
  const performanceText = fmPerformance?.trim()
    ? fmPerformance.trim()
    : "No floor manager performance notes were provided.";

  const body = `
Hello ${userName},

Your Team Monthly Overview has been created successfully.

📋 Report Details:
• Team: ${teamName}
• Period: ${monthName} ${year}
• Generated: ${new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}

🧭 Team Overview:
${overviewText}

🎯 Goals This Month:
${goalsText}

🧑‍💼 Floor Manager Performance:
${performanceText}

You can review the full report in the GP Report Generator dashboard.

---
This is an automated message from GP Report Generator.
If you have any questions, please contact your administrator.
`.trim();

  return sendEmail({
    to: userEmail,
    subject,
    body,
  });
}

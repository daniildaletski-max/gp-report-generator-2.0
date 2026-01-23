import { ENV } from "./env";

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
};

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("webdevtoken.v1.WebDevService/SendEmail", normalizedBase).toString();
};

/**
 * Sends an email through the Manus Email Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!ENV.forgeApiUrl) {
    console.warn("[Email] Forge API URL is not configured.");
    return false;
  }

  if (!ENV.forgeApiKey) {
    console.warn("[Email] Forge API key is not configured.");
    return false;
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        attachment_url: payload.attachmentUrl,
        attachment_name: payload.attachmentName,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Email] Failed to send email (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    console.log(`[Email] Successfully sent email to ${payload.to}`);
    return true;
  } catch (error) {
    console.warn("[Email] Error calling email service:", error);
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

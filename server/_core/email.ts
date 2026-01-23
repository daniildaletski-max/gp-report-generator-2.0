import { Resend } from "resend";
import { ENV } from "./env";

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
};

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
      from: "GP Report Generator <reports@resend.dev>",
      to: [payload.to],
      subject: payload.subject,
      text: payload.body,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) {
      console.warn(`[Email] Failed to send email: ${error.message}`);
      return false;
    }

    console.log(`[Email] Successfully sent email to ${payload.to}, id: ${data?.id}`);
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

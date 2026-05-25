// Email body sent when a carrier requests the brief on /partners/brief.
// Kept simple HTML so GHL's email pipeline renders it cleanly in Gmail,
// Outlook, and Apple Mail. Inline a sender sign-off; reply-to is configured
// at the GHL location level, not per-message.

interface CarrierBriefEmailInput {
  firstName: string;
  carrierName: string;
  hasAttachment: boolean;
  fallbackPdfUrl?: string;
}

export function carrierBriefEmail({
  firstName,
  carrierName,
  hasAttachment,
  fallbackPdfUrl,
}: CarrierBriefEmailInput): { subject: string; html: string } {
  const subject = "Your CDLA.jobs carrier brief";

  const attachmentLine = hasAttachment
    ? "The one-page brief is attached to this email."
    : fallbackPdfUrl
      ? `The one-page brief is here: <a href="${escapeHtml(fallbackPdfUrl)}">${escapeHtml(fallbackPdfUrl)}</a>`
      : "I'll follow up shortly with the brief PDF.";

  const greeting = firstName
    ? `Hi ${escapeHtml(firstName)},`
    : "Hi,";

  const carrierMention = carrierName
    ? `for ${escapeHtml(carrierName)}`
    : "for your operation";

  const html = `
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f1419; line-height: 1.55; font-size: 15px; max-width: 600px; margin: 0 auto; padding: 24px;">
    <p>${greeting}</p>

    <p>Thanks for requesting the CDLA.jobs carrier brief. ${attachmentLine}</p>

    <p>Quick context ${carrierMention}: we&rsquo;re not a job board. We pull an API feed of the jobs already on your careers page, AI-prescreen drivers against your hiring criteria, and deliver matches into your ATS (Tenstreet by default, integration configured by us).</p>

    <p>Pricing is built to replace what carriers spend on the job boards, not stack on top of it:</p>

    <ul style="margin: 12px 0; padding-left: 22px;">
      <li><strong>Tier 2 &mdash; $0/month.</strong> Matched leads to your Tenstreet. No per-hire fees, no setup fees.</li>
      <li><strong>Tier 1 &mdash; $2,500/month flat.</strong> 24-hour exclusivity on every match, priority placement, quarterly business review.</li>
    </ul>

    <p>Hit reply if you want a 30-minute call to walk through how it&rsquo;d work ${carrierMention}. I&rsquo;ll show you the matching logic against your stated criteria, what your prequalifications would look like, and answer specific questions.</p>

    <p style="margin-top: 28px;">&mdash; Todd Bryson<br/>CDLA.jobs<br/><a href="https://cdla.jobs/partners">https://cdla.jobs/partners</a></p>
  </body>
</html>
`.trim();

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

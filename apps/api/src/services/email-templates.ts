export type BookingConfirmationEmailInput = {
  customerName: string;
  bookingReference: string;
  apartmentName: string;
  apartmentLocation: string;
  apartmentSummary: string;
  apartmentCoverImageUrl: string | null;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string | null;
  guestCount: number;
  amountPaid: string;
  currency: string;
  cancellationDeadline: string;
  cancellationUrl: string;
  termsUrl: string;
  privacyUrl: string;
  cookieUrl: string;
  supportEmail: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-NG', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(date);
}

function formatMoney(value: string, currency: string) {
  const amount = Number(value);
  try {
    return `${new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
    }).format(amount)} (${currency})`;
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function emailLayout(title: string, content: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F6F1E8;color:#292C29;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F1E8;padding:16px 8px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#FFFFFF;border-radius:16px;overflow:hidden">
      <tr><td style="background:#183C32;padding:24px 28px;color:#FFFFFF">
        <div style="font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#C6A36B">Staywell</div>
        <div style="margin-top:7px;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25">Your Stay, Your Comfort.</div>
      </td></tr>
      <tr><td style="padding:24px 24px 28px">${content}</td></tr>
      <tr><td style="padding:18px 24px;background:#F6F1E8;color:#292C29;font-size:12px;line-height:1.65">
        The Staywell Team
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderBookingConfirmationEmail(
  input: BookingConfirmationEmailInput,
) {
  const image = input.apartmentCoverImageUrl
    ? `<img src="${escapeHtml(input.apartmentCoverImageUrl)}" alt="${escapeHtml(input.apartmentName)}" width="572" style="display:block;width:100%;max-width:572px;height:auto;border:0;border-radius:12px;margin:0 0 18px">`
    : '';
  const checkout = input.checkOutTime
    ? `${formatDate(input.checkOutDate)} · ${escapeHtml(input.checkOutTime)}`
    : `${formatDate(input.checkOutDate)} · Check-out time: please confirm with Staywell`;
  const details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:9px 0;color:#686F69">Booking reference</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(input.bookingReference)}</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Apartment</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(input.apartmentName)}</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Check-in</td><td style="padding:9px 0;text-align:right">${escapeHtml(formatDate(input.checkInDate))} · ${escapeHtml(input.checkInTime)}</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Check-out</td><td style="padding:9px 0;text-align:right">${checkout}</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Guests</td><td style="padding:9px 0;text-align:right">${input.guestCount}</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Amount paid</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(formatMoney(input.amountPaid, input.currency))}</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Payment status</td><td style="padding:9px 0;text-align:right;color:#183C32;font-weight:bold">Paid · verified by Paystack</td></tr>
    <tr><td style="padding:9px 0;color:#686F69">Booking status</td><td style="padding:9px 0;text-align:right;color:#183C32;font-weight:bold">Confirmed</td></tr>
  </table>`;
  const support = input.supportEmail
    ? `<p style="margin:12px 0 0">Need assistance? Email <a href="mailto:${escapeHtml(input.supportEmail)}" style="color:#183C32">${escapeHtml(input.supportEmail)}</a>.</p>`
    : '';
  const html = emailLayout(
    'Your Staywell Apartment Booking Is Confirmed!',
    `${image}<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:#292C29">Your apartment booking is confirmed</h1>
     <p style="margin:0 0 12px;font-size:15px;line-height:1.7">Hello ${escapeHtml(input.customerName)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.7">Thank you for choosing Staywell! Your payment has been successfully verified and your apartment reservation is confirmed. Please keep your booking reference for future communication.</p>
     <div style="margin:18px 0;padding:16px;border-radius:12px;background:#F6F1E8"><h2 style="margin:0 0 6px;font-size:18px;color:#183C32">${escapeHtml(input.apartmentName)}</h2><p style="margin:0;color:#686F69;font-size:13px">${escapeHtml(input.apartmentLocation)}</p><p style="margin:8px 0 0;font-size:14px;line-height:1.65">${escapeHtml(input.apartmentSummary)}</p></div>
     ${details}
     <div style="margin:20px 0;padding:16px;border-left:4px solid #C6A36B;background:#F6F1E8"><p style="margin:0 0 6px;font-weight:bold">Cancellation deadline</p><p style="margin:0;font-size:15px">${escapeHtml(input.cancellationDeadline)}</p><p style="margin:8px 0 0;font-size:13px;line-height:1.65">You may request to unbook your apartment if your request is submitted at least 24 hours before scheduled check-in. Clicking the button does not cancel your booking; you will review the details and explicitly confirm first.</p></div>
     <p style="margin:22px 0;text-align:center"><a href="${escapeHtml(input.cancellationUrl)}" style="display:inline-block;background:#183C32;color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px;font-weight:bold">Unbook Apartment</a></p>
     <p style="margin:0;font-size:14px;line-height:1.7">Thank you for choosing Staywell.<br>The Staywell Team</p>${support}
     <p style="margin:16px 0 0;font-size:12px;line-height:1.7"><a href="${escapeHtml(input.termsUrl)}" style="color:#183C32">Terms &amp; Conditions</a> · <a href="${escapeHtml(input.privacyUrl)}" style="color:#183C32">Privacy Notice</a> · <a href="${escapeHtml(input.cookieUrl)}" style="color:#183C32">Cookie Policy</a></p>`,
  );
  const text = [
    `Hello ${input.customerName},`,
    'Thank you for choosing Staywell! Your payment has been successfully verified and your apartment reservation is confirmed.',
    `Booking reference: ${input.bookingReference}`,
    `Apartment: ${input.apartmentName}${input.apartmentLocation ? `, ${input.apartmentLocation}` : ''}`,
    input.apartmentSummary,
    `Check-in: ${formatDate(input.checkInDate)} at ${input.checkInTime}`,
    `Check-out: ${formatDate(input.checkOutDate)}${input.checkOutTime ? ` at ${input.checkOutTime}` : ' (time to be confirmed with Staywell)'}`,
    `Guests: ${input.guestCount}`,
    `Amount paid: ${formatMoney(input.amountPaid, input.currency)}`,
    'Payment status: Paid and verified by Paystack',
    'Booking status: Confirmed',
    `Cancellation deadline: ${input.cancellationDeadline}`,
    'You may request to unbook your apartment if your request is submitted at least 24 hours before scheduled check-in. Clicking the link does not cancel your booking; you must explicitly confirm.',
    `Unbook Apartment: ${input.cancellationUrl}`,
    `Terms & Conditions: ${input.termsUrl}`,
    `Privacy Notice: ${input.privacyUrl}`,
    `Cookie Policy: ${input.cookieUrl}`,
    ...(input.supportEmail ? [`Staywell support: ${input.supportEmail}`] : []),
    'Thank you for choosing Staywell. The Staywell Team.',
  ].filter(Boolean);
  return {
    subject: 'Your Staywell Apartment Booking Is Confirmed!',
    html,
    text: text.join('\n\n'),
  };
}

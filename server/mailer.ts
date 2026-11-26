import nodemailer from 'nodemailer';
import dns from 'node:dns';

function lookupIPv4(host: string): Promise<string> {
  // Resolving to IPv4 first avoids slow IPv6 lookups on some Windows/restricted networks.
  return new Promise(resolve => dns.lookup(host, { family: 4 }, (err, address) => resolve(err || !address ? host : address)));
}

export function isMailConfigured(): boolean {
  const p = process.env.APP_PASSWORD;
  return !!p && p !== 'MY_APP_PASSWORD' && !p.includes('xxxx');
}

/** Sends the OTP email. Returns false if mail is not configured or sending failed. */
export async function sendOtpEmail(email: string, otp: string): Promise<boolean> {
  if (!isMailConfigured()) return false;

  const smtpServer = process.env.SMTP_SERVER || 'smtp.gmail.com';
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const senderEmail = process.env.EMAIL || process.env.SENDER_EMAIL || '';

  try {
    const transporter = nodemailer.createTransport({
      host: await lookupIPv4(smtpServer),
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: senderEmail, pass: process.env.APP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 15_000,
      socketTimeout: 15_000,
      // Certificate checking stays on; servername makes it work when connecting by IP.
      tls: { servername: smtpServer },
    });

    await transporter.sendMail({
      from: `"MedSafe" <${senderEmail}>`,
      to: email,
      subject: 'Your MedSafe verification code',
      text: `Your MedSafe verification code is ${otp}. It expires in 10 minutes. If you did not request it, ignore this email.`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 12px; background-color: #fafafa;">
          <h2 style="color: #0f766e; margin: 0 0 16px; text-align: center;">MedSafe</h2>
          <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; text-align: center;">
            <p style="color: #27272a; font-size: 14px; text-align: left; margin-top: 0;">Use this code to finish signing in. It is valid for 10 minutes.</p>
            <div style="margin: 24px 0; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0f766e; font-family: monospace;">${otp}</div>
            <p style="color: #71717a; font-size: 11px; margin-bottom: 0;">If you did not request this code, please ignore this email.</p>
          </div>
        </div>`,
    });
    return true;
  } catch (err) {
    console.error('[OTP] Failed to send email:', err);
    return false;
  }
}

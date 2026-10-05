import nodemailer from 'nodemailer';
import prisma from '../database/prisma.ts';
import GoogleWorkspaceService from './googleWorkspaceService.ts';

export interface SendOtpResult {
  sent: boolean;
  method: 'SMTP' | 'GMAIL_API' | 'DEV_PREVIEW';
  error?: string;
}

export class EmailService {
  /**
   * Retrieves active SMTP configuration from environment or database settings
   */
  public static async getSmtpCredentials(): Promise<{ user: string; pass: string } | null> {
    const envUser = process.env.SMTP_USER?.trim();
    const envPass = process.env.SMTP_PASS?.trim();

    if (envUser && envPass) {
      return { user: envUser, pass: envPass.replace(/\s+/g, '') };
    }

    try {
      const [userSetting, passSetting] = await Promise.all([
        prisma.systemSetting.findUnique({ where: { key: 'smtp_email' } }),
        prisma.systemSetting.findUnique({ where: { key: 'smtp_pass' } }),
      ]);

      if (userSetting?.value && passSetting?.value) {
        return {
          user: userSetting.value.trim(),
          pass: passSetting.value.trim().replace(/\s+/g, ''),
        };
      }
    } catch (e: any) {
      console.warn('[EmailService] Error fetching SMTP credentials from DB:', e.message);
    }

    return null;
  }

  /**
   * Generates the styled HTML email template for UPRISE OTP
   */
  public static generateOtpHtml(name: string, otpCode: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; color: #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0 0 8px 0; font-size: 26px; letter-spacing: -0.5px;">🌊 UPRISE Community</h2>
          <p style="margin: 0; color: #64748b; font-size: 14px;">Official Member Verification Gateway</p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155;">Hello <strong>${name}</strong>,</p>
          <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748b;">
            Your verification code for the UPRISE Discord community is below. Enter this 6-digit code in Discord to unlock your <strong>🌟 Community Member</strong> role and claim your <strong>+100 XP</strong> reward:
          </p>

          <div style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 14px 36px; font-size: 34px; font-weight: 700; letter-spacing: 8px; border-radius: 8px; font-family: monospace; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
            ${otpCode}
          </div>

          <p style="margin: 18px 0 0 0; font-size: 12px; color: #94a3b8;">
            ⏱️ This code will expire in <strong>10 minutes</strong>. If you did not request this verification, you can safely ignore this email.
          </p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
          <p style="margin: 0 0 4px 0;">UPRISE Discord Ecosystem • Real-Time Attribution Gateway</p>
          <p style="margin: 0; font-size: 11px; color: #cbd5e1;">Sent automatically from official community mailer</p>
        </div>
      </div>
    `;
  }

  /**
   * Dispatches OTP email. Priority:
   * 1. Official SMTP (Gmail App Password) — completely hands-free & permanent
   * 2. Gmail REST API via OAuth access token
   * 3. Dev preview (when neither credential is provided)
   */
  public static async sendOtp(params: {
    toEmail: string;
    otpCode: string;
    recipientName?: string;
  }): Promise<SendOtpResult> {
    const { toEmail, otpCode, recipientName } = params;
    const name = recipientName || 'Member';

    // 1. Try SMTP with Google App Password
    const smtp = await this.getSmtpCredentials();
    if (smtp) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtp.user,
            pass: smtp.pass,
          },
        });

        await transporter.sendMail({
          from: `"UPRISE Community" <${smtp.user}>`,
          to: toEmail,
          subject: `Your UPRISE Verification Code: ${otpCode}`,
          html: this.generateOtpHtml(name, otpCode),
        });

        console.log(`[EmailService] Sent OTP to ${toEmail} via official SMTP (${smtp.user})`);
        return { sent: true, method: 'SMTP' };
      } catch (err: any) {
        console.error('[EmailService] SMTP delivery failed:', err.message);
        // If SMTP fails, continue to check if OAuth token is available as backup
      }
    }

    // 2. Try Gmail REST API with stored OAuth token
    try {
      const tokenSetting = await prisma.systemSetting.findUnique({
        where: { key: 'google_access_token' },
      });
      if (tokenSetting?.value) {
        await GoogleWorkspaceService.sendOtpEmail(tokenSetting.value, toEmail, otpCode, name);
        console.log(`[EmailService] Sent OTP to ${toEmail} via Gmail API`);
        return { sent: true, method: 'GMAIL_API' };
      }
    } catch (err: any) {
      console.warn('[EmailService] Gmail REST API delivery failed:', err.message);
    }

    // 3. Fallback: Neither credential is configured
    return { sent: false, method: 'DEV_PREVIEW', error: 'No SMTP credentials or Google OAuth token configured.' };
  }
}

export default EmailService;

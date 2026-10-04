/**
 * Google Workspace Service: Google Sheets & Gmail Integration
 * Provides spreadsheet creation, row appending, full synchronization,
 * and email OTP sending via standard Google REST APIs.
 */

export interface VerifiedMemberSheetRow {
  verifiedAt: string;
  fullName: string;
  email: string;
  username: string;
  discordId: string;
  inviterUsername: string;
  inviterDiscordId: string;
  inviteCode: string;
  xpEarned: number;
  status: string;
}

export interface ReferralSheetRow {
  id: string;
  inviterDiscordId: string;
  inviterUsername: string;
  inviteeDiscordId: string;
  inviteeUsername: string;
  inviteCode: string;
  status: string;
  joinedAt: string;
  verifiedAt: string;
}

export interface XpTransactionSheetRow {
  id: string;
  discordId: string;
  username: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export class GoogleWorkspaceService {
  /**
   * Creates a new Google Spreadsheet specifically structured for UPRISE Community
   * with 3 tabs: "Verified Members", "Referrals Ledger", and "XP Transactions".
   */
  public static async createCommunitySpreadsheet(accessToken: string, title?: string): Promise<{ id: string; url: string }> {
    const spreadsheetTitle = title || `UPRISE Community Master Ledger (${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;

    const requestBody = {
      properties: {
        title: spreadsheetTitle,
      },
      sheets: [
        {
          properties: {
            title: 'Verified Members',
            gridProperties: { frozenRowCount: 1 },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Verification Time (UTC)' } },
                    { userEnteredValue: { stringValue: 'Full Name' } },
                    { userEnteredValue: { stringValue: 'Email Address' } },
                    { userEnteredValue: { stringValue: 'Discord Username' } },
                    { userEnteredValue: { stringValue: 'Discord User ID' } },
                    { userEnteredValue: { stringValue: 'Invited By (Username)' } },
                    { userEnteredValue: { stringValue: 'Inviter Discord ID' } },
                    { userEnteredValue: { stringValue: 'Invite Code' } },
                    { userEnteredValue: { stringValue: 'XP Awarded' } },
                    { userEnteredValue: { stringValue: 'Status' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          properties: {
            title: 'Referrals Ledger',
            gridProperties: { frozenRowCount: 1 },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Referral ID' } },
                    { userEnteredValue: { stringValue: 'Inviter Discord ID' } },
                    { userEnteredValue: { stringValue: 'Inviter Username' } },
                    { userEnteredValue: { stringValue: 'Invitee Discord ID' } },
                    { userEnteredValue: { stringValue: 'Invitee Username' } },
                    { userEnteredValue: { stringValue: 'Invite Code' } },
                    { userEnteredValue: { stringValue: 'Status' } },
                    { userEnteredValue: { stringValue: 'Joined Date' } },
                    { userEnteredValue: { stringValue: 'Verified Date' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          properties: {
            title: 'XP Transactions',
            gridProperties: { frozenRowCount: 1 },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Transaction ID' } },
                    { userEnteredValue: { stringValue: 'Discord ID' } },
                    { userEnteredValue: { stringValue: 'Username' } },
                    { userEnteredValue: { stringValue: 'XP Amount' } },
                    { userEnteredValue: { stringValue: 'Reason' } },
                    { userEnteredValue: { stringValue: 'Timestamp' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets creation failed: ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
    };
  }

  /**
   * Appends a newly verified member row to the "Verified Members" tab.
   */
  public static async appendVerifiedMember(
    accessToken: string,
    spreadsheetId: string,
    row: VerifiedMemberSheetRow
  ): Promise<any> {
    const range = encodeURIComponent('Verified Members!A:J');
    const values = [
      [
        row.verifiedAt || new Date().toISOString(),
        row.fullName || 'N/A',
        row.email || 'N/A',
        row.username,
        row.discordId,
        row.inviterUsername || 'Direct / None',
        row.inviterDiscordId || 'N/A',
        row.inviteCode || 'N/A',
        row.xpEarned,
        row.status || 'VERIFIED',
      ],
    ];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn('[GoogleWorkspaceService] Append member row error:', err);
      throw new Error(`Failed to append member to Google Sheet: ${err}`);
    }

    return await res.json();
  }

  /**
   * Synchronizes all existing members, referrals, and transactions from database into Google Sheet tabs
   */
  public static async syncAllData(
    accessToken: string,
    spreadsheetId: string,
    members: VerifiedMemberSheetRow[],
    referrals: ReferralSheetRow[],
    transactions: XpTransactionSheetRow[]
  ): Promise<{ membersCount: number; referralsCount: number; transactionsCount: number }> {
    // 1. Update Verified Members tab
    if (members.length > 0) {
      const memberValues = [
        [
          'Verification Time (UTC)',
          'Full Name',
          'Email Address',
          'Discord Username',
          'Discord User ID',
          'Invited By (Username)',
          'Inviter Discord ID',
          'Invite Code',
          'XP Awarded',
          'Status',
        ],
        ...members.map((m) => [
          m.verifiedAt || new Date().toISOString(),
          m.fullName || '',
          m.email || '',
          m.username,
          m.discordId,
          m.inviterUsername || 'Direct',
          m.inviterDiscordId || '',
          m.inviteCode || '',
          m.xpEarned,
          m.status || 'VERIFIED',
        ]),
      ];

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Verified Members!A1:J') + members.length + 1}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: memberValues }),
        }
      );
    }

    // 2. Update Referrals tab
    if (referrals.length > 0) {
      const referralValues = [
        [
          'Referral ID',
          'Inviter Discord ID',
          'Inviter Username',
          'Invitee Discord ID',
          'Invitee Username',
          'Invite Code',
          'Status',
          'Joined Date',
          'Verified Date',
        ],
        ...referrals.map((r) => [
          r.id,
          r.inviterDiscordId || 'Direct',
          r.inviterUsername || 'Direct / None',
          r.inviteeDiscordId,
          r.inviteeUsername,
          r.inviteCode || '',
          r.status,
          r.joinedAt,
          r.verifiedAt || 'Pending',
        ]),
      ];

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Referrals Ledger!A1:I') + referrals.length + 1}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: referralValues }),
        }
      );
    }

    // 3. Update XP Transactions tab
    if (transactions.length > 0) {
      const txValues = [
        ['Transaction ID', 'Discord ID', 'Username', 'XP Amount', 'Reason', 'Timestamp'],
        ...transactions.map((tx) => [
          tx.id,
          tx.discordId,
          tx.username,
          tx.amount,
          tx.reason,
          tx.createdAt,
        ]),
      ];

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('XP Transactions!A1:F') + transactions.length + 1}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: txValues }),
        }
      );
    }

    return {
      membersCount: members.length,
      referralsCount: referrals.length,
      transactionsCount: transactions.length,
    };
  }

  /**
   * Sends a 6-digit OTP verification code using Gmail API
   */
  public static async sendOtpEmail(
    accessToken: string,
    toEmail: string,
    otpCode: string,
    recipientName?: string
  ): Promise<any> {
    const subject = `Your UPRISE Community Verification Code: ${otpCode}`;
    const name = recipientName || 'Member';

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; color: #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0 0 8px 0; font-size: 24px; letter-spacing: -0.5px;">🌊 UPRISE Community</h2>
          <p style="margin: 0; color: #64748b; font-size: 14px;">Member Verification Gateway</p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155;">Hello <strong>${name}</strong>,</p>
          <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748b;">Enter the verification code below to verify your Discord membership, unlock the <strong>@Community Member</strong> role, and claim your <strong>+100 XP</strong> reward:</p>

          <div style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 14px 32px; font-size: 32px; font-weight: 700; letter-spacing: 8px; border-radius: 8px; font-family: monospace;">
            ${otpCode}
          </div>

          <p style="margin: 16px 0 0 0; font-size: 12px; color: #94a3b8;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
          <p style="margin: 0;">UPRISE Discord Ecosystem · Automated Verification Ledger</p>
        </div>
      </div>
    `;

    const emailLines = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody,
    ];

    const email = emailLines.join('\r\n');
    // Base64url encoding
    const base64Url = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[GoogleWorkspaceService] Send OTP email failed:', err);
      throw new Error(`Gmail API error: ${err}`);
    }

    return await res.json();
  }
}

export default GoogleWorkspaceService;

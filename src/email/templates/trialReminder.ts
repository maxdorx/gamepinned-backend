import { Env } from '../../types';

export async function sendTrialReminderEmail(email: string, licenseKey: string, daysLeft: number, env: Env): Promise<void> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const pricingProMonthly = env.PRICING_PRO_MONTHLY ?? '$1.99/month per PC';
        const pricingElite = env.PRICING_ELITE ?? 'from $699 one-time';
        const urgency = daysLeft <= 1 ? 'Your trial ends today' : daysLeft + ' days left on your trial';
        const accentColor = daysLeft <= 1 ? '#e60012' : '#FF6B35';
        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
            '<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">' + urgency + '. Upgrade before it ends to keep all your games protected.</span>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px">' +
            '<tr><td align="center">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +

            '<tr><td style="background:#0f0f14;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid #e60012">' +
            '<img src="' + siteUrl + '/images/logo.png" alt="GamePinned" style="display:block;width:140px;height:auto;margin-bottom:10px;border:0">' +
            '<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px">Your games. Always installed. Always ready.</p>' +
            '</td></tr>' +

            '<tr><td style="background:#131318;border:1px solid #1e1e28;border-top:0;border-radius:0 0 12px 12px;padding:32px">' +

            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:' + accentColor + ';text-transform:uppercase;letter-spacing:2px">Trial Reminder</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#fff">' + urgency + '.</h1>' +
            '<p style="margin:0 0 24px 0;font-size:15px;color:#8888aa">After it expires, GamePinned keeps working on the free plan (1 game). To keep unlimited protection, upgrade before it ends.</p>' +

            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:16px 24px;margin-bottom:24px">' +
            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#FFB300;letter-spacing:3px">' + licenseKey + '</p>' +
            '</div>' +

            '<div style="background:#0a0a0f;border:1px solid #1e1e28;border-radius:8px;padding:20px 24px;margin-bottom:24px">' +
            '<p style="margin:0 0 14px 0;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px">Upgrade options</p>' +
            '<p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#e5e5e5">Pro: ' + pricingProMonthly + '</p>' +
            '<p style="margin:0 0 12px 0;font-size:13px;color:#666">Unlimited games, all platforms, all features</p>' +
            '<p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#e5e5e5">Elite: ' + pricingElite + '</p>' +
            '<p style="margin:0;font-size:13px;color:#666">No renewal, no expiry. Up to 30 PCs or unlimited.</p>' +
            '</div>' +

            '<div style="text-align:center;margin-bottom:24px">' +
            '<a href="' + siteUrl + '/pricing" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">See Pricing</a>' +
            '</div>' +

            '<p style="margin:0;font-size:13px;color:#555;line-height:1.6">When the trial ends, your card will be charged. To cancel before then, visit your Polar account or email support@example.com.</p>' +

            '</td></tr>' +
            '<tr><td style="padding:20px 0 0 0;text-align:center">' +
            '<p style="margin:0 0 4px 0;font-size:12px;color:#444"><a href="' + siteUrl + '" style="color:#555;text-decoration:none">example.com</a></p>' +
            '<p style="margin:0;font-size:12px;color:#444">Questions: <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '<p style="margin:8px 0 0 0;font-size:11px;color:#333">You received this because you started a GamePinned trial.</p>' +
            '</td></tr>' +

            '</table>' +
            '</td></tr></table>' +
            '</body></html>';

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'GamePinned <support@example.com>',
                to: [email],
                subject: daysLeft <= 1 ? 'Your GamePinned trial ends today' : 'Your GamePinned trial ends in ' + daysLeft + ' days',
                html: html
            })
        });
    } catch (e: any) {
        console.error('[TRIAL] Failed to send reminder email: ' + e.message);
    }
}

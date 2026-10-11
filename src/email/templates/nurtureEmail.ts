import { Env } from '../../types';

export async function sendTrialNurtureEmail(email: string, licenseKey: string, day: number, env: Env): Promise<void> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const pricingProMonthly = env.PRICING_PRO_MONTHLY ?? '$1.99/month per PC';
        const pricingElite = env.PRICING_ELITE ?? 'from $699 one-time';
        let subject: string;
        let preheader: string;
        let headline: string;
        let body: string;
        let ctaHref: string;
        let ctaLabel: string;

        if (day === 7) {
            subject = 'Getting started with GamePinned';
            preheader = 'A few things worth knowing about your trial.';
            headline = 'A few things worth knowing.';
            body =
                '<p style="margin:0 0 16px 0;font-size:15px;color:#8888aa">You started your GamePinned trial a week ago. Here are the most useful features to try before your trial ends.</p>' +
                '<div style="background:#0a0a0f;border:1px solid #1e1e28;border-radius:8px;padding:20px 24px;margin-bottom:24px">' +
                '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#e5e5e5">Steam, Epic Games, and Riot Client</p>' +
                '<p style="margin:0 0 16px 0;font-size:13px;color:#666">Lock games on all three platforms from the same interface. Each platform has its own tab in the sidebar.</p>' +
                '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#e5e5e5">GPU Pinned</p>' +
                '<p style="margin:0 0 16px 0;font-size:13px;color:#666">Save your NVIDIA display and 3D settings as a named profile. GamePinned restores them automatically on every reboot.</p>' +
                '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#e5e5e5">Session Clear</p>' +
                '<p style="margin:0;font-size:13px;color:#666">One click wipes logged-in accounts from Steam, Epic, and Riot so the next user starts fresh.</p>' +
                '</div>';
            ctaHref = siteUrl + '/docs';
            ctaLabel = 'View the Setup Guide';
        } else {
            subject = '10 days left on your GamePinned trial';
            preheader = 'Your trial ends in 10 days. Here is how to keep everything.';
            headline = '10 days left on your trial.';
            body =
                '<p style="margin:0 0 24px 0;font-size:15px;color:#8888aa">Your trial ends in 10 days. When it expires, GamePinned keeps running on the free plan (one game protected). Upgrade to keep all your games locked.</p>' +
                '<div style="background:#0a0a0f;border:1px solid #1e1e28;border-radius:8px;padding:20px 24px;margin-bottom:24px">' +
                '<p style="margin:0 0 14px 0;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px">Plans</p>' +
                '<p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#e5e5e5">Pro: ' + pricingProMonthly + '</p>' +
                '<p style="margin:0 0 14px 0;font-size:13px;color:#666">Unlimited games, all platforms, cancel any time</p>' +
                '<p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#e5e5e5">Elite: ' + pricingElite + '</p>' +
                '<p style="margin:0;font-size:13px;color:#666">Up to 30 PCs or unlimited. No renewal, no expiry.</p>' +
                '</div>' +
                '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:16px 24px;margin-bottom:24px">' +
                '<p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
                '<p style="margin:0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#FFB300;letter-spacing:3px">' + licenseKey + '</p>' +
                '</div>';
            ctaHref = siteUrl + '/pricing';
            ctaLabel = 'See Pricing';
        }

        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
            '<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">' + preheader + '</span>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px">' +
            '<tr><td align="center">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +
            '<tr><td style="background:#0f0f14;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid #e60012">' +
            '<img src="' + siteUrl + '/images/logo.png" alt="GamePinned" style="display:block;width:140px;height:auto;margin-bottom:10px;border:0">' +
            '<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px">Your games. Always installed. Always ready.</p>' +
            '</td></tr>' +
            '<tr><td style="background:#131318;border:1px solid #1e1e28;border-top:0;border-radius:0 0 12px 12px;padding:32px">' +
            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#FFB300;text-transform:uppercase;letter-spacing:2px">Your Trial</p>' +
            '<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#fff">' + headline + '</h1>' +
            body +
            '<div style="text-align:center;margin-bottom:24px">' +
            '<a href="' + ctaHref + '" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">' + ctaLabel + '</a>' +
            '</div>' +
            '</td></tr>' +
            '<tr><td style="padding:20px 0 0 0;text-align:center">' +
            '<p style="margin:0 0 4px 0;font-size:12px;color:#444"><a href="' + siteUrl + '" style="color:#555;text-decoration:none">example.com</a></p>' +
            '<p style="margin:0;font-size:12px;color:#444">Questions: <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '<p style="margin:8px 0 0 0;font-size:11px;color:#333">You received this because you started a GamePinned trial.</p>' +
            '</td></tr>' +
            '</table></td></tr></table>' +
            '</body></html>';

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'GamePinned <support@example.com>', to: [email], subject: subject, html: html })
        });
    } catch (e: any) {
        console.error('[NURTURE] Failed to send day-' + day + ' email: ' + e.message);
    }
}

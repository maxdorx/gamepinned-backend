import { Env } from '../../types';

export async function sendRenewalConfirmationEmail(customerEmail: string, licenseKey: string, expiryDate: string, isTrialConversion: boolean, env: Env): Promise<void> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const expiryFormatted = new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const subject = isTrialConversion
            ? 'Your GamePinned Pro subscription is active'
            : 'Your GamePinned Pro subscription renewed';
        const preheader = isTrialConversion
            ? 'You are now a Pro subscriber. Your key still works.'
            : 'Your subscription renewed. Active until ' + expiryFormatted + '.';
        const heading = isTrialConversion ? 'You\'re now a subscriber.' : 'Subscription renewed.';
        const body = isTrialConversion
            ? 'Your trial just converted to a paid Pro subscription. Your key is the same and keeps working.'
            : 'Your Pro subscription renewed. Nothing has changed.';

        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
            '<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">' + preheader + '</span>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px"><tr><td align="center">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +
            '<tr><td style="background:#0f0f14;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid #e60012">' +
            '<img src="' + siteUrl + '/images/logo.png" alt="GamePinned" style="display:block;width:140px;height:auto;margin-bottom:10px;border:0">' +
            '<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px">Your games. Always installed. Always ready.</p>' +
            '</td></tr>' +
            '<tr><td style="background:#131318;border:1px solid #1e1e28;border-top:0;border-radius:0 0 12px 12px;padding:32px">' +
            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#e60012;text-transform:uppercase;letter-spacing:2px">Pro Subscription</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#fff">' + heading + '</h1>' +
            '<p style="margin:0 0 28px 0;font-size:15px;color:#8888aa">' + body + '</p>' +
            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:20px 24px;margin-bottom:28px">' +
            '<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0 0 16px 0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#e60012;letter-spacing:3px">' + licenseKey + '</p>' +
            '<table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #1e1e28">' +
            '<tr><td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Plan</td>' +
            '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Active Until</td></tr>' +
            '<tr><td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">Pro</td>' +
            '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">' + expiryFormatted + '</td></tr>' +
            '</table></div>' +
            '<p style="margin:0;font-size:13px;color:#555;line-height:1.6">Questions? Email <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '</td></tr>' +
            '<tr><td style="padding:20px 0 0 0;text-align:center">' +
            '<p style="margin:0 0 4px 0;font-size:12px;color:#444"><a href="' + siteUrl + '" style="color:#555;text-decoration:none">example.com</a></p>' +
            '<p style="margin:0;font-size:12px;color:#444">Questions: <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '<p style="margin:8px 0 0 0;font-size:11px;color:#333">You received this because you have a GamePinned Pro subscription.</p>' +
            '</td></tr></table></td></tr></table></body></html>';

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'GamePinned <support@example.com>', to: [customerEmail], subject, html })
        });
        console.log('[EMAIL] Renewal confirmation sent to ' + customerEmail);
    } catch { /* email failure must never affect the main operation */ }
}

export async function sendExpiryWarningEmail(customerEmail: string, licenseKey: string, daysLeft: number, expiryDate: string, env: Env): Promise<void> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const expiryFormatted = new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const urgency = daysLeft <= 1 ? 'today' : 'in ' + daysLeft + ' days';
        const subject = daysLeft <= 1
            ? 'Your GamePinned Pro subscription expires today'
            : 'Your GamePinned Pro subscription expires in ' + daysLeft + ' days';
        const preheader = 'Your key expires ' + urgency + '. Check your billing to stay covered.';

        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
            '<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">' + preheader + '</span>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px"><tr><td align="center">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +
            '<tr><td style="background:#0f0f14;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid #e60012">' +
            '<img src="' + siteUrl + '/images/logo.png" alt="GamePinned" style="display:block;width:140px;height:auto;margin-bottom:10px;border:0">' +
            '<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px">Your games. Always installed. Always ready.</p>' +
            '</td></tr>' +
            '<tr><td style="background:#131318;border:1px solid #1e1e28;border-top:0;border-radius:0 0 12px 12px;padding:32px">' +
            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#FFB300;text-transform:uppercase;letter-spacing:2px">Heads Up</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#fff">Your subscription expires ' + urgency + '.</h1>' +
            '<p style="margin:0 0 28px 0;font-size:15px;color:#8888aa">If auto-renewal is on, nothing to do. If you canceled, you can renew at <a href="' + siteUrl + '/pricing" style="color:#e60012;text-decoration:none">example.com/pricing</a>.</p>' +
            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:20px 24px;margin-bottom:28px">' +
            '<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0 0 16px 0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#555;letter-spacing:3px">' + licenseKey + '</p>' +
            '<table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #1e1e28">' +
            '<tr><td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Status</td>' +
            '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Expires</td></tr>' +
            '<tr><td style="font-size:14px;font-weight:700;color:#FFB300;padding-top:4px">Expiring ' + urgency + '</td>' +
            '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">' + expiryFormatted + '</td></tr>' +
            '</table></div>' +
            '<div style="text-align:center;margin-bottom:28px">' +
            '<a href="' + siteUrl + '/pricing" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Renew Subscription</a>' +
            '</div>' +
            '<p style="margin:0;font-size:13px;color:#555;line-height:1.6">Questions? Email <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '</td></tr>' +
            '<tr><td style="padding:20px 0 0 0;text-align:center">' +
            '<p style="margin:0 0 4px 0;font-size:12px;color:#444"><a href="' + siteUrl + '" style="color:#555;text-decoration:none">example.com</a></p>' +
            '<p style="margin:0;font-size:12px;color:#444">Questions: <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '<p style="margin:8px 0 0 0;font-size:11px;color:#333">You received this because your GamePinned Pro subscription is expiring soon.</p>' +
            '</td></tr></table></td></tr></table></body></html>';

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'GamePinned <support@example.com>', to: [customerEmail], subject, html })
        });
        console.log('[EMAIL] Expiry warning sent to ' + customerEmail);
    } catch { /* email failure must never affect the main operation */ }
}

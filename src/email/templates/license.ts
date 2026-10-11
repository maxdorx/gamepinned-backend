import { Env } from '../../types';

export async function sendLicenseEmail(customerEmail: string, licenseKey: string, tier: string, expiryDate: string | null, env: Env, seats: number = 1): Promise<boolean> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const isPerpetual = tier !== 'SUBSCRIPTION';
        const tierLabel = isPerpetual ? 'Elite License' : 'Pro';
        const expiryFormatted = expiryDate ? new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
        const seatsLabel = seats >= 999 ? 'Unlimited' : seats + ' PC' + (seats > 1 ? 's' : '');
        const preheader = 'Your GamePinned license key is inside. Copy it and activate in the app.';

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

            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#e60012;text-transform:uppercase;letter-spacing:2px">' + tierLabel + '</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#fff">Your license is ready.</h1>' +
            '<p style="margin:0 0 28px 0;font-size:15px;color:#8888aa">Thank you for your purchase. Enter this key in GamePinned to activate your license.</p>' +

            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:20px 24px;margin-bottom:24px">' +
            '<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0 0 16px 0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#e60012;letter-spacing:3px">' + licenseKey + '</p>' +
            '<table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #1e1e28">' +
            '<tr>' +
            '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Type</td>' +
            '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Seats</td>' +
            (expiryFormatted ? '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Active Until</td>' : '') +
            '</tr><tr>' +
            '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">' + (isPerpetual ? 'Elite' : 'Pro') + '</td>' +
            '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">' + seatsLabel + '</td>' +
            (expiryFormatted ? '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">' + expiryFormatted + '</td>' : '') +
            '</tr></table>' +
            '</div>' +

            '<p style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:#e5e5e5;text-transform:uppercase;letter-spacing:1px">How to activate</p>' +
            '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">' +
            '<tr><td style="vertical-align:top;padding:0 12px 14px 0;width:28px"><div style="width:24px;height:24px;background:#e60012;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#fff">1</div></td>' +
            '<td style="vertical-align:top;padding-bottom:14px"><p style="margin:4px 0 0 0;font-size:14px;color:#a1a1aa">Download and install GamePinned from <a href="' + siteUrl + '" style="color:#e60012;text-decoration:none">example.com</a></p></td></tr>' +
            '<tr><td style="vertical-align:top;padding:0 12px 14px 0"><div style="width:24px;height:24px;background:#e60012;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#fff">2</div></td>' +
            '<td style="vertical-align:top;padding-bottom:14px"><p style="margin:4px 0 0 0;font-size:14px;color:#a1a1aa">Open GamePinned and click the <strong style="color:#e5e5e5">License</strong> tab</p></td></tr>' +
            '<tr><td style="vertical-align:top;padding:0 12px 0 0"><div style="width:24px;height:24px;background:#e60012;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#fff">3</div></td>' +
            '<td style="vertical-align:top"><p style="margin:4px 0 0 0;font-size:14px;color:#a1a1aa">Paste your key and click <strong style="color:#e5e5e5">Activate</strong></p></td></tr>' +
            '</table>' +

            '<div style="text-align:center;margin-bottom:28px">' +
            '<a href="' + siteUrl + '" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Download GamePinned</a>' +
            '</div>' +

            '<div style="background:#0a0a0f;border:1px solid #1e1e28;border-radius:8px;padding:16px 24px">' +
            '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px">Need help?</p>' +
            '<p style="margin:0;font-size:13px;color:#8888aa;line-height:1.6">Check the setup guide at <a href="' + siteUrl + '/docs" style="color:#e60012;text-decoration:none">example.com/docs</a> or email <a href="mailto:support@example.com" style="color:#e60012;text-decoration:none">support@example.com</a></p>' +
            '</div>' +

            '</td></tr>' +
            '<tr><td style="padding:20px 0 0 0;text-align:center">' +
            '<p style="margin:0 0 4px 0;font-size:12px;color:#444"><a href="' + siteUrl + '" style="color:#555;text-decoration:none">example.com</a></p>' +
            '<p style="margin:0;font-size:12px;color:#444">Questions: <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '<p style="margin:8px 0 0 0;font-size:11px;color:#333">You received this because you purchased a GamePinned license.</p>' +
            '</td></tr>' +

            '</table></td></tr></table>' +
            '</body></html>';

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + env.RESEND_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'GamePinned <support@example.com>',
                to: [customerEmail],
                subject: isPerpetual ? 'Your GamePinned license key' : 'Your GamePinned subscription is active',
                html: html
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[EMAIL] Resend API error:', error);
            return false;
        }

        console.log('[EMAIL] License sent to ' + customerEmail);
        return true;
    } catch (error: any) {
        console.error('[EMAIL] Failed to send email:', error.message);
        return false;
    }
}

import { Env } from '../../types';

export async function sendTrialKeyEmail(email: string, licenseKey: string, trialDays: number, env: Env): Promise<void> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
            '<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">Your trial key is inside. Paste it into GamePinned to unlock all features.</span>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px">' +
            '<tr><td align="center">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +

            '<tr><td style="background:#0f0f14;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid #e60012">' +
            '<img src="' + siteUrl + '/images/logo.png" alt="GamePinned" style="display:block;width:140px;height:auto;margin-bottom:10px;border:0">' +
            '<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px">Your games. Always installed. Always ready.</p>' +
            '</td></tr>' +

            '<tr><td style="background:#131318;border:1px solid #1e1e28;border-top:0;border-radius:0 0 12px 12px;padding:32px">' +

            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#FFB300;text-transform:uppercase;letter-spacing:2px">' + trialDays + '-Day Trial</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#fff">Your trial is ready.</h1>' +
            '<p style="margin:0 0 28px 0;font-size:15px;color:#8888aa">Enter this key in GamePinned to activate all features on one PC.</p>' +

            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:20px 24px;margin-bottom:28px">' +
            '<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#FFB300;letter-spacing:3px">' + licenseKey + '</p>' +
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

            '<div style="background:#0a0a0f;border:1px solid #1e1e28;border-radius:8px;padding:20px 24px;margin-bottom:24px">' +
            '<p style="margin:0 0 12px 0;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px">What you get for ' + trialDays + ' days</p>' +
            '<p style="margin:0 0 6px 0;font-size:13px;color:#a1a1aa">Unlimited games on Steam, Epic Games, and Riot Client</p>' +
            '<p style="margin:0 0 6px 0;font-size:13px;color:#a1a1aa">NVIDIA profile save and restore (GPU Pinned)</p>' +
            '<p style="margin:0 0 6px 0;font-size:13px;color:#a1a1aa">Auto-update and launch with Windows</p>' +
            '<p style="margin:0;font-size:13px;color:#a1a1aa">Platform session clear for Steam, Epic, and Riot</p>' +
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
                subject: 'Your GamePinned ' + trialDays + '-day trial key',
                html: html
            })
        });
    } catch (e: any) {
        console.error('[TRIAL] Failed to send trial key email: ' + e.message);
    }
}

export async function sendAlreadyTrialedEmail(email: string, licenseKey: string, expiryDate: string | null, isActive: boolean, env: Env): Promise<void> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const expired = !isActive || (expiryDate ? new Date() > new Date(expiryDate) : false);
        const expiryLabel = expiryDate ? expiryDate.split('T')[0] : 'N/A';
        const statusLine = expired
            ? 'Your trial ended on ' + expiryLabel + '. You are now on the free plan (1 game protected).'
            : 'Your trial is active until ' + expiryLabel + '.';
        const bodyNote = expired
            ? 'Each email address can only start one trial. If you want to continue with full protection, upgrade to a paid plan.'
            : 'Your key is still valid. Enter it in GamePinned on the License tab to activate.';

        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
            '<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">You already have a trial on this account. Your existing key is inside.</span>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px">' +
            '<tr><td align="center">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +

            '<tr><td style="background:#0f0f14;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid #e60012">' +
            '<img src="' + siteUrl + '/images/logo.png" alt="GamePinned" style="display:block;width:140px;height:auto;margin-bottom:10px;border:0">' +
            '<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px">Your games. Always installed. Always ready.</p>' +
            '</td></tr>' +

            '<tr><td style="background:#131318;border:1px solid #1e1e28;border-top:0;border-radius:0 0 12px 12px;padding:32px">' +

            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#8888aa;text-transform:uppercase;letter-spacing:2px">Trial Already Used</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#fff">You already have a trial on this account.</h1>' +
            '<p style="margin:0 0 24px 0;font-size:15px;color:#8888aa">' + statusLine + '</p>' +

            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:16px 24px;margin-bottom:24px">' +
            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#FFB300;letter-spacing:3px">' + licenseKey + '</p>' +
            '</div>' +

            '<p style="margin:0 0 24px 0;font-size:14px;color:#8888aa;line-height:1.6">' + bodyNote + '</p>' +

            (expired
                ? '<div style="text-align:center;margin-bottom:24px"><a href="' + siteUrl + '/pricing" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">See Pricing</a></div>'
                : '<div style="text-align:center;margin-bottom:24px"><a href="' + siteUrl + '/docs" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">View Setup Guide</a></div>'
            ) +

            '<p style="margin:0;font-size:13px;color:#555;line-height:1.6">Need help? Reply to this email or contact <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +

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
            body: JSON.stringify({
                from: 'GamePinned <support@example.com>',
                to: [email],
                subject: 'You already have a GamePinned trial',
                html: html
            })
        });
    } catch (e: any) {
        console.error('[TRIAL] Failed to send already-trialed email: ' + e.message);
    }
}

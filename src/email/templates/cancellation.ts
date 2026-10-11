import { Env } from '../../types';

export async function sendCancellationEmail(customerEmail: string, licenseKey: string, tier: string, expiryDate: string | null, env: Env): Promise<boolean> {
    try {
        const siteUrl = env.SITE_URL ?? 'https://example.com';
        const isSubscription = tier === 'SUBSCRIPTION' || tier === 'TRIAL';
        const expiryFormatted = expiryDate ? new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
        const preheader = expiryFormatted
            ? 'Your ' + (isSubscription ? 'subscription' : 'license') + ' is canceled. It stays active until ' + expiryFormatted + '.'
            : 'Your GamePinned ' + (isSubscription ? 'subscription' : 'license') + ' has been canceled and is now inactive.';

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

            '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#8888aa;text-transform:uppercase;letter-spacing:2px">' + (isSubscription ? 'Subscription' : 'License') + ' Canceled</p>' +
            '<h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#fff">Your ' + (isSubscription ? 'subscription' : 'license') + ' has been canceled.</h1>' +
            (expiryFormatted
                ? '<p style="margin:0 0 28px 0;font-size:15px;color:#8888aa">You won\'t be charged again. GamePinned keeps working until <strong style="color:#e5e5e5">' + expiryFormatted + '</strong>.</p>'
                : '<p style="margin:0 0 28px 0;font-size:15px;color:#8888aa">Your license is now inactive and your games are no longer protected.</p>'
            ) +

            '<div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:20px 24px;margin-bottom:28px">' +
            '<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1.5px">Your License Key</p>' +
            '<p style="margin:0 0 16px 0;font-size:26px;font-weight:800;font-family:Courier New,monospace;color:#555;letter-spacing:3px">' + licenseKey + '</p>' +
            '<table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #1e1e28">' +
            '<tr>' +
            '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Status</td>' +
            (expiryFormatted ? '<td style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;padding-top:12px">Active Until</td>' : '') +
            '</tr><tr>' +
            '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">Canceled</td>' +
            (expiryFormatted ? '<td style="font-size:14px;font-weight:700;color:#e5e5e5;padding-top:4px">' + expiryFormatted + '</td>' : '') +
            '</tr></table>' +
            '</div>' +

            '<p style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:#e5e5e5;text-transform:uppercase;letter-spacing:1px">What happens next</p>' +
            '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">' +
            '<tr><td style="vertical-align:top;padding:0 12px 12px 0;width:16px"><div style="width:6px;height:6px;background:#555;border-radius:50%;margin-top:6px"></div></td>' +
            '<td style="vertical-align:top;padding-bottom:12px"><p style="margin:0;font-size:14px;color:#a1a1aa">No further charges will be made</p></td></tr>' +
            (expiryFormatted
                ? '<tr><td style="vertical-align:top;padding:0 12px 12px 0"><div style="width:6px;height:6px;background:#555;border-radius:50%;margin-top:6px"></div></td>' +
                  '<td style="vertical-align:top;padding-bottom:12px"><p style="margin:0;font-size:14px;color:#a1a1aa">GamePinned keeps working until <strong style="color:#e5e5e5">' + expiryFormatted + '</strong></p></td></tr>'
                : ''
            ) +
            '<tr><td style="vertical-align:top;padding:0 12px 0 0"><div style="width:6px;height:6px;background:#555;border-radius:50%;margin-top:6px"></div></td>' +
            '<td style="vertical-align:top"><p style="margin:0;font-size:14px;color:#a1a1aa">You can purchase a new license anytime at <a href="' + siteUrl + '/pricing" style="color:#e60012;text-decoration:none">example.com/pricing</a></p></td></tr>' +
            '</table>' +

            '<div style="text-align:center;margin-bottom:28px">' +
            '<a href="' + siteUrl + '/pricing" style="display:inline-block;background:#e60012;color:#fff;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">See Pricing</a>' +
            '</div>' +

            '<p style="margin:0;font-size:13px;color:#555;line-height:1.6">If this was a mistake, email <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a> and we\'ll sort it out.</p>' +

            '</td></tr>' +
            '<tr><td style="padding:20px 0 0 0;text-align:center">' +
            '<p style="margin:0 0 4px 0;font-size:12px;color:#444"><a href="' + siteUrl + '" style="color:#555;text-decoration:none">example.com</a></p>' +
            '<p style="margin:0;font-size:12px;color:#444">Questions: <a href="mailto:support@example.com" style="color:#FFB300;text-decoration:none">support@example.com</a></p>' +
            '<p style="margin:8px 0 0 0;font-size:11px;color:#333">You received this because you canceled your GamePinned ' + (isSubscription ? 'subscription' : 'license') + '.</p>' +
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
                subject: 'Your GamePinned ' + (isSubscription ? 'subscription' : 'license') + ' has been canceled',
                html: html
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[EMAIL] Resend API error:', error);
            return false;
        }

        console.log('[EMAIL] Cancellation confirmation sent to ' + customerEmail);
        return true;
    } catch (error: any) {
        console.error('[EMAIL] Failed to send cancellation email:', error.message);
        return false;
    }
}

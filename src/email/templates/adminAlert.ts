import { Env } from '../../types';

export async function sendAdminAlert(subject: string, summary: string, rows: [string, string][], env: Env): Promise<void> {
    try {
        const tableRows = rows.map(([label, value]) =>
            '<tr><td style="padding:6px 12px;font-weight:600;color:#a1a1aa;white-space:nowrap">' + label + ':</td>' +
            '<td style="padding:6px 12px;color:#e5e5e5">' + value + '</td></tr>'
        ).join('');

        const html = '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f0f0f;color:#e5e5e5;padding:20px">' +
            '<div style="max-width:600px;margin:0 auto">' +
            '<h2 style="color:#FF4B4B;margin-bottom:8px">GamePinned Admin Alert</h2>' +
            '<p style="color:#a1a1aa;margin-bottom:20px">' + summary + '</p>' +
            '<table style="background:#1a1a1a;border-radius:8px;width:100%;border-collapse:collapse">' +
            tableRows + '</table>' +
            '<p style="color:#666;font-size:12px;margin-top:20px">This alert was sent automatically by GamePinned.</p>' +
            '</div></body></html>';

        if (!env.ADMIN_EMAIL) return;
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'GamePinned Alerts <support@example.com>',
                to: [env.ADMIN_EMAIL],
                subject: '[GamePinned] ' + subject,
                html
            })
        });
    } catch { /* email failure must never affect the main operation */ }
}

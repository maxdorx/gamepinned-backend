import { Env } from '../../types';
import { getClientIP } from '../../lib/ip';
import { checkRateLimit, recordAttempt } from '../../middleware/rateLimit';
import { escapeHtml } from '../../lib/html';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { log } from '../../lib/logger';

export async function handleNewsletter(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const clientIP = getClientIP(request);
    const rateCheck = await checkRateLimit(clientIP, '/api/newsletter', env);
    if (!rateCheck.allowed) return errorResponse(rateCheck.reason || 'Too many requests', 429);

    try {
        const body = await request.json() as any;
        const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

        if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
            await recordAttempt(clientIP, '/api/newsletter', false, env);
            return errorResponse('Invalid email address', 400);
        }

        const safeEmail = escapeHtml(raw);

        const existing = await env.DB.prepare(
            'SELECT id FROM newsletter_subscribers WHERE email = ?'
        ).bind(raw).first<any>();

        if (!existing) {
            await env.DB.prepare(
                'INSERT INTO newsletter_subscribers (email, source) VALUES (?, ?)'
            ).bind(raw, 'blog').run();

            log(env, 'info', 'email', 'newsletter_subscribed', 'New newsletter subscriber: ' + raw, { ip: clientIP, data: { email: raw, source: 'blog' } }, ctx);

            const html =
                '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">' +
                '<h2 style="color:#e60012">You\'re on the list.</h2>' +
                '<p>Thanks for subscribing to the GamePinned blog.</p>' +
                '<p>You\'ll hear from us when we publish new guides on gaming cafe setup, game protection, and Windows administration. No spam, no filler.</p>' +
                '<p style="margin-top:32px;font-size:13px;color:#666">You signed up with <strong>' + safeEmail + '</strong>. ' +
                'If this wasn\'t you, you can ignore this email.</p>' +
                '</div>';

            const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + env.RESEND_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'GamePinned <support@example.com>',
                    to: [raw],
                    subject: 'You\'re subscribed to the GamePinned blog',
                    html,
                }),
            });

            if (emailRes.ok) {
                log(env, 'info', 'email', 'email_sent', 'Newsletter welcome email sent to ' + raw, { data: { to: raw, template: 'newsletter_welcome' } }, ctx);
            } else {
                log(env, 'warn', 'email', 'email_failed', 'Newsletter welcome email failed for ' + raw + ' status=' + emailRes.status, { data: { to: raw, status: emailRes.status } }, ctx);
            }
        } else {
            log(env, 'info', 'email', 'newsletter_duplicate', 'Newsletter subscribe attempt for existing email: ' + raw, { ip: clientIP }, ctx);
        }

        await recordAttempt(clientIP, '/api/newsletter', true, env);
        return jsonResponse({ success: true });

    } catch (err: any) {
        console.error('[ERROR] Newsletter handler failed:', err.message);
        return errorResponse('Internal server error', 500);
    }
}

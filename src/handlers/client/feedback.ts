import { Env } from '../../types';
import { getClientIP } from '../../lib/ip';
import { checkRateLimit, recordAttempt } from '../../middleware/rateLimit';
import { escapeHtml } from '../../lib/html';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { log } from '../../lib/logger';

export async function handleFeedback(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const clientIP = getClientIP(request);
    const rateCheck = await checkRateLimit(clientIP, '/api/feedback', env);
    if (!rateCheck.allowed) return errorResponse(rateCheck.reason || "Too many requests", 429);

    try {
        const { name, email, feedbackType, platformName, subject, description } = await request.json();

        if (!name || !feedbackType || !subject || !description) {
            await recordAttempt(clientIP, '/api/feedback', false, env);
            return errorResponse("Required fields are missing", 400);
        }

        if (feedbackType === "Platform Request" && !platformName) {
            await recordAttempt(clientIP, '/api/feedback', false, env);
            return errorResponse("Platform name is required for platform requests", 400);
        }

        const safeName = escapeHtml(String(name));
        const safeEmail = email ? escapeHtml(String(email)) : null;
        const safeType = escapeHtml(String(feedbackType));
        const safePlatform = platformName ? escapeHtml(String(platformName)) : null;
        const safeSubject = escapeHtml(String(subject));
        const safeDesc = escapeHtml(String(description)).replace(/\n/g, '<br>');

        const emailContent = '<h2>New Feedback Submission</h2>' +
            '<p><strong>Type:</strong> ' + safeType + '</p>' +
            (safePlatform ? '<p><strong>Platform:</strong> ' + safePlatform + '</p>' : '') +
            '<p><strong>Subject:</strong> ' + safeSubject + '</p>' +
            '<p><strong>Name:</strong> ' + safeName + '</p>' +
            (safeEmail ? '<p><strong>Email:</strong> ' + safeEmail + '</p>' : '<p><strong>Email:</strong> Not provided</p>') +
            '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">' +
            '<p><strong>Description:</strong></p>' +
            '<p>' + safeDesc + '</p>';

        if (!env.ADMIN_EMAIL) return errorResponse("Feedback unavailable", 503);

        const emailBody = {
            from: 'GamePinned Support <support@example.com>',
            to: [env.ADMIN_EMAIL],
            replyTo: safeEmail || undefined,
            subject: '[' + safeType + '] ' + safeSubject,
            html: emailContent,
        };

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailBody),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[ERROR] Resend API failed:', error);
            await recordAttempt(clientIP, '/api/feedback', false, env);
            log(env, 'error', 'email', 'feedback_send_failed', 'Feedback email failed to send via Resend', { ip: clientIP, data: { type: feedbackType } }, ctx);
            return errorResponse("Failed to send feedback", 500);
        }

        await recordAttempt(clientIP, '/api/feedback', true, env);
        log(env, 'info', 'email', 'feedback_submitted', 'Feedback received: ' + feedbackType + ' - ' + subject, { ip: clientIP, data: { type: feedbackType, has_email: !!email } }, ctx);

        if (ctx && env.DB) {
            ctx.waitUntil(
                env.DB.prepare(
                    'INSERT INTO feedback_submissions (name, email, feedback_type, platform_name, subject, description) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(
                    String(name),
                    email ? String(email) : null,
                    String(feedbackType),
                    platformName ? String(platformName) : null,
                    String(subject),
                    String(description)
                ).run().catch((e: any) => console.error('[ERROR] Failed to store feedback submission:', e.message))
            );
        }

        return jsonResponse({ success: true });

    } catch (error: any) {
        console.error('[ERROR] Feedback handler failed:', error.message);
        log(env, 'error', 'error', 'feedback_error', 'Feedback handler threw: ' + error.message, { ip: clientIP }, ctx);
        return errorResponse("Internal server error", 500);
    }
}

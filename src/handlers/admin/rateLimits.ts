import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';

export async function getRateLimits(env: Env): Promise<Response> {
    try {
        // Only return suspicious entries: currently blocked IPs, or IPs with 3+ failed attempts.
        // Normal low-volume entries are not security events.
        const rateLimits = await env.DB.prepare(`
            SELECT
                id,
                ip_address,
                endpoint,
                attempts,
                first_attempt,
                last_attempt,
                blocked_until,
                CASE
                    WHEN blocked_until IS NOT NULL AND blocked_until > datetime('now') THEN 1
                    ELSE 0
                END as is_blocked
            FROM rate_limits
            WHERE (blocked_until IS NOT NULL AND blocked_until > datetime('now'))
               OR attempts >= 3
            ORDER BY last_attempt DESC
            LIMIT 100
        `).all();

        return jsonResponse({ rate_limits: rateLimits.results || [] });
    } catch (error: any) {
        console.error("Get rate limits error:", error);
        return errorResponse(error.message || "Internal server error", 500);
    }
}

export async function unblockIP(url: URL, env: Env): Promise<Response> {
    try {
        const id = url.pathname.split("/")[4];
        await env.DB.prepare(
            "UPDATE rate_limits SET blocked_until = NULL, attempts = 0 WHERE id = ?"
        ).bind(id).run();
        return jsonResponse({ status: "success", message: "IP unblocked" });
    } catch (error: any) {
        console.error("Unblock IP error:", error);
        return errorResponse(error.message || "Internal server error", 500);
    }
}

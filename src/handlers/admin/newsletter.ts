import { Env } from '../../types';
import { jsonResponse } from '../../lib/headers';

export async function getNewsletterSubscribers(env: Env): Promise<Response> {
    const rows = await env.DB.prepare(
        "SELECT email, source, subscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC"
    ).all<any>();

    return jsonResponse({ subscribers: rows.results || [] });
}

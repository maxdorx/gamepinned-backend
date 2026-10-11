import { Env } from '../../types';
import { jsonResponse } from '../../lib/headers';

export async function getFeedbackSubmissions(env: Env): Promise<Response> {
    const rows = await env.DB.prepare(
        'SELECT id, name, email, feedback_type, platform_name, subject, description, submitted_at FROM feedback_submissions ORDER BY submitted_at DESC LIMIT 200'
    ).all<any>();

    return jsonResponse({ submissions: rows.results || [] });
}

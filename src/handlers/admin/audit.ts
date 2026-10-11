import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';

export async function logAdminAction(env: Env, action: string, targetId: string | any = '', details?: any): Promise<void> {
    try {
        const resolvedTarget = typeof targetId === 'string' ? targetId : '';
        const resolvedDetails = details !== undefined ? details : (typeof targetId !== 'string' ? targetId : null);
        await env.DB.prepare(
            "INSERT INTO admin_actions (action, target_id, details) VALUES (?, ?, ?)"
        ).bind(action, resolvedTarget, JSON.stringify(resolvedDetails ?? null)).run();
    } catch { /* non-critical: never let audit failure break the actual operation */ }
}

export async function getAuditLog(env: Env): Promise<Response> {
    try {
        const rows = await env.DB.prepare(`
            SELECT id, action, target_id, details, timestamp
            FROM admin_actions
            ORDER BY timestamp DESC
            LIMIT 200
        `).all();
        return jsonResponse({ audit_log: rows.results || [] });
    } catch (error: any) {
        if (error.message && error.message.includes('no such table')) {
            return jsonResponse({ audit_log: [] });
        }
        return errorResponse(error.message || "Internal server error", 500);
    }
}

import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';

export async function getLogs(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const level    = url.searchParams.get('level')    || '';
    const category = url.searchParams.get('category') || '';
    const search   = url.searchParams.get('search')   || '';
    const from     = url.searchParams.get('from')     || '';
    const to       = url.searchParams.get('to')       || '';
    const limit    = Math.min(parseInt(url.searchParams.get('limit')  || '100', 10) || 100, 500);
    const offset   = Math.max(parseInt(url.searchParams.get('offset') || '0',   10) || 0,   0);

    const conditions: string[] = [];
    const bindings: any[]      = [];

    if (level)    { conditions.push("level = ?");    bindings.push(level); }
    if (category) { conditions.push("category = ?"); bindings.push(category); }
    if (from)     { conditions.push("timestamp >= ?"); bindings.push(from); }
    if (to)       { conditions.push("timestamp <= ?"); bindings.push(to + ' 23:59:59'); }
    if (search) {
        conditions.push("(message LIKE ? OR event LIKE ? OR license_key LIKE ? OR ip LIKE ?)");
        const q = '%' + search + '%';
        bindings.push(q, q, q, q);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    try {
        const [rows, countRow] = await Promise.all([
            env.DB.prepare(
                'SELECT id, timestamp, level, category, event, ip, license_key, message, data FROM backend_logs ' + where + ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
            ).bind(...bindings, limit, offset).all<any>(),
            env.DB.prepare(
                'SELECT COUNT(*) as total FROM backend_logs ' + where
            ).bind(...bindings).first<any>(),
        ]);

        return jsonResponse({
            logs: rows.results || [],
            total: countRow?.total ?? 0,
            limit,
            offset,
        });
    } catch (err: any) {
        return errorResponse('Failed to load logs: ' + err.message, 500);
    }
}

export async function getLogStats(env: Env): Promise<Response> {
    try {
        const [total, byLevel, byCategory, recentErrors] = await Promise.all([
            env.DB.prepare("SELECT COUNT(*) as c FROM backend_logs WHERE timestamp >= datetime('now', '-24 hours')").first<any>(),
            env.DB.prepare("SELECT level, COUNT(*) as count FROM backend_logs WHERE timestamp >= datetime('now', '-24 hours') GROUP BY level ORDER BY count DESC").all<any>(),
            env.DB.prepare("SELECT category, COUNT(*) as count FROM backend_logs WHERE timestamp >= datetime('now', '-24 hours') GROUP BY category ORDER BY count DESC").all<any>(),
            env.DB.prepare("SELECT id, timestamp, event, message, license_key FROM backend_logs WHERE level = 'error' ORDER BY timestamp DESC LIMIT 5").all<any>(),
        ]);

        return jsonResponse({
            today: total?.c ?? 0,
            by_level: byLevel.results || [],
            by_category: byCategory.results || [],
            recent_errors: recentErrors.results || [],
        });
    } catch (err: any) {
        return errorResponse('Failed to load log stats: ' + err.message, 500);
    }
}

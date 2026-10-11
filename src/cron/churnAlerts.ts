import { Env } from '../types';
import { sendAdminAlert } from '../email/templates/adminAlert';
import { logAdminAction } from '../handlers/admin/audit';
import { log } from '../lib/logger';

export async function sendChurnAlerts(env: Env, ctx?: ExecutionContext): Promise<void> {
    const churnInactiveDays = parseInt(env.CHURN_INACTIVE_DAYS ?? '7');
    const churnDedupDays = parseInt(env.CHURN_DEDUP_DAYS ?? '7');

    // Only alert once per dedup window
    const recentAlert = await env.DB.prepare(
        "SELECT id FROM admin_actions WHERE action = 'churn_alert' AND timestamp > datetime('now', '-' || ? || ' days') LIMIT 1"
    ).bind(String(churnDedupDays)).first<any>();
    if (recentAlert) return;

    const churnBatch = await env.DB.prepare(
        "SELECT l.license_key, l.customer_info, l.tier, MAX(d.last_seen) as last_seen " +
        "FROM licenses l JOIN devices d ON d.license_id = l.id " +
        "WHERE l.tier IN ('SUBSCRIPTION','PERPETUAL') AND l.is_active=1 " +
        "GROUP BY l.id " +
        "HAVING last_seen < datetime('now', '-' || ? || ' days')"
    ).bind(String(churnInactiveDays)).all<any>();

    const rows = churnBatch.results || [];
    if (rows.length === 0) return;

    const lines: [string, string][] = rows.map((row: any) => {
        const info: any = {};
        try { Object.assign(info, JSON.parse(row.customer_info || '{}')); } catch { }
        const email = info.email || row.license_key;
        const lastSeen = row.last_seen ? row.last_seen.split('T')[0] : 'unknown';
        return [email, row.tier + ', last seen ' + lastSeen] as [string, string];
    });

    await sendAdminAlert(
        'Churn Alert: ' + rows.length + ' inactive paid customer' + (rows.length === 1 ? '' : 's'),
        rows.length + ' paid installation' + (rows.length === 1 ? ' has' : 's have') + ' not been seen in ' + churnInactiveDays + '+ days.',
        lines,
        env
    );
    await logAdminAction(env, 'churn_alert', String(rows.length), { count: rows.length });
    log(env, 'warn', 'system', 'churn_alert_sent', 'Churn alert sent: ' + rows.length + ' inactive paid customer(s)', { data: { count: rows.length } }, ctx);
}

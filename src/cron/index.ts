import { Env } from '../types';
import { sendTrialReminders } from './trialReminders';
import { sendNurtureEmails } from './nurtureEmails';
import { sendChurnAlerts } from './churnAlerts';
import { cleanupExpiredRateLimits } from '../middleware/rateLimit';
import { log } from '../lib/logger';

async function cleanupOldLogs(env: Env): Promise<void> {
    // Keep errors for 90 days, everything else for 30 days
    await env.DB.prepare(
        "DELETE FROM backend_logs WHERE level != 'error' AND timestamp < datetime('now', '-30 days')"
    ).run().catch(() => {});
    await env.DB.prepare(
        "DELETE FROM backend_logs WHERE level = 'error' AND timestamp < datetime('now', '-90 days')"
    ).run().catch(() => {});
}

async function cleanupExpiredDiagnostics(env: Env): Promise<void> {
    const configuredDays = parseInt(env.DIAGNOSTIC_RETENTION_DAYS ?? '30', 10);
    const retentionDays = Number.isFinite(configuredDays)
        ? Math.min(Math.max(configuredDays, 7), 365)
        : 30;

    // Process a bounded batch. A failed R2 deletion leaves the database row in place
    // so the next daily run can retry without orphaning a support report.
    const expired = await env.DB.prepare(
        "SELECT id, r2_key FROM diagnostic_reports WHERE submitted_at < datetime('now', ?) ORDER BY id LIMIT 100"
    ).bind('-' + retentionDays + ' days').all<{ id: number; r2_key: string }>().catch(() => null);

    for (const report of expired?.results ?? []) {
        try {
            await env.UPDATES_BUCKET.delete(report.r2_key);
            await env.DB.prepare("DELETE FROM diagnostic_reports WHERE id = ?").bind(report.id).run();
        } catch {
            // Keep the database row so this report is retried on the next daily run.
        }
    }
}
export async function handleScheduled(_event: any, env: Env, ctx: ExecutionContext): Promise<void> {
    const started = Date.now();
    log(env, 'info', 'cron', 'cron_started', 'Daily cron started', {}, ctx);

    await Promise.all([
        sendTrialReminders(env, ctx),
        sendNurtureEmails(env, ctx),
        sendChurnAlerts(env, ctx),
        cleanupExpiredRateLimits(env),
        cleanupOldLogs(env),
        cleanupExpiredDiagnostics(env),
    ]);

    const ms = Date.now() - started;
    log(env, 'info', 'cron', 'cron_completed', 'Daily cron completed in ' + ms + 'ms', { data: { duration_ms: ms } }, ctx);
}

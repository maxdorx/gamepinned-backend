import { Env } from '../types';
import { sendTrialNurtureEmail } from '../email/templates/nurtureEmail';
import { logAdminAction } from '../handlers/admin/audit';
import { log } from '../lib/logger';

export async function sendNurtureEmails(env: Env, ctx?: ExecutionContext): Promise<void> {
    const day1 = parseInt(env.TRIAL_NURTURE_DAY1 ?? '7');
    const day2 = parseInt(env.TRIAL_NURTURE_DAY2 ?? '20');

    // Wave 1: nurture_count = 0, trial created day1+ days ago, still active
    const wave1Batch = await env.DB.prepare(
        "SELECT id, license_key, email FROM licenses " +
        "WHERE tier='TRIAL' AND is_active=1 AND nurture_count=0 " +
        "AND email != '' AND created_at <= datetime('now', '-' || ? || ' days')"
    ).bind(String(day1)).all<any>();

    for (const row of (wave1Batch.results || [])) {
        try {
            await sendTrialNurtureEmail(row.email, row.license_key, day1, env);
            await env.DB.prepare("UPDATE licenses SET nurture_count=1 WHERE id=?").bind(row.id).run();
            await logAdminAction(env, 'TRIAL_NURTURE_DAY' + day1, 'id=' + row.id + ' email=' + row.email);
            log(env, 'info', 'email', 'email_sent', 'Trial nurture day-' + day1 + ' sent to ' + row.email, { license_key: row.license_key, data: { to: row.email, template: 'trial_nurture_day' + day1 } }, ctx);
        } catch (err: any) {
            console.error('[NURTURE] Day-' + day1 + ' send failed for id=' + row.id + ': ' + err.message);
        }
    }

    // Wave 2: nurture_count = 1, trial created day2+ days ago, still active
    const wave2Batch = await env.DB.prepare(
        "SELECT id, license_key, email FROM licenses " +
        "WHERE tier='TRIAL' AND is_active=1 AND nurture_count=1 " +
        "AND email != '' AND created_at <= datetime('now', '-' || ? || ' days')"
    ).bind(String(day2)).all<any>();

    for (const row of (wave2Batch.results || [])) {
        try {
            await sendTrialNurtureEmail(row.email, row.license_key, day2, env);
            await env.DB.prepare("UPDATE licenses SET nurture_count=2 WHERE id=?").bind(row.id).run();
            await logAdminAction(env, 'TRIAL_NURTURE_DAY' + day2, 'id=' + row.id + ' email=' + row.email);
            log(env, 'info', 'email', 'email_sent', 'Trial nurture day-' + day2 + ' sent to ' + row.email, { license_key: row.license_key, data: { to: row.email, template: 'trial_nurture_day' + day2 } }, ctx);
        } catch (err: any) {
            console.error('[NURTURE] Day-' + day2 + ' send failed for id=' + row.id + ': ' + err.message);
        }
    }
}

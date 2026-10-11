import { Env } from '../types';
import { sendTrialReminderEmail } from '../email/templates/trialReminder';
import { logAdminAction } from '../handlers/admin/audit';
import { log } from '../lib/logger';

export async function sendTrialReminders(env: Env, ctx?: ExecutionContext): Promise<void> {
    const reminder1Days = parseInt(env.TRIAL_REMINDER_1_DAYS ?? '3');
    const reminder2Days = parseInt(env.TRIAL_REMINDER_2_DAYS ?? '1');

    // Reminder 1: N days left, reminder_count = 0
    const firstBatch = await env.DB.prepare(
        "SELECT id, license_key, customer_info, expiry_date FROM licenses " +
        "WHERE tier='TRIAL' AND is_active=1 AND reminder_count=0 " +
        "AND expiry_date BETWEEN datetime('now', '+' || ? || ' day') AND datetime('now', '+' || ? || ' days')"
    ).bind(String(reminder2Days + 1), String(reminder1Days)).all<any>();

    for (const row of (firstBatch.results || [])) {
        try {
            const info = JSON.parse(row.customer_info || '{}');
            if (info.email) {
                await sendTrialReminderEmail(info.email, row.license_key, reminder1Days, env);
                await env.DB.prepare("UPDATE licenses SET reminder_count=1 WHERE id=?").bind(row.id).run();
                await logAdminAction(env, 'TRIAL_REMINDER_1', 'id=' + row.id + ' email=' + info.email);
                log(env, 'info', 'email', 'email_sent', 'Trial ' + reminder1Days + '-day reminder sent to ' + info.email, { license_key: row.license_key, data: { to: info.email, template: 'trial_reminder_' + reminder1Days + 'd', days_left: reminder1Days, expiry_date: row.expiry_date } }, ctx);
            }
        } catch (err: any) {
            console.error('[TRIAL_REMINDER] ' + reminder1Days + '-day send failed for id=' + row.id + ': ' + err.message);
        }
    }

    // Reminder 2: N days left, reminder_count = 1
    const secondBatch = await env.DB.prepare(
        "SELECT id, license_key, customer_info, expiry_date FROM licenses " +
        "WHERE tier='TRIAL' AND is_active=1 AND reminder_count=1 " +
        "AND expiry_date BETWEEN datetime('now') AND datetime('now', '+' || ? || ' day')"
    ).bind(String(reminder2Days)).all<any>();

    for (const row of (secondBatch.results || [])) {
        try {
            const info = JSON.parse(row.customer_info || '{}');
            if (info.email) {
                await sendTrialReminderEmail(info.email, row.license_key, reminder2Days, env);
                await env.DB.prepare("UPDATE licenses SET reminder_count=2 WHERE id=?").bind(row.id).run();
                await logAdminAction(env, 'TRIAL_REMINDER_2', 'id=' + row.id + ' email=' + info.email);
                log(env, 'info', 'email', 'email_sent', 'Trial ' + reminder2Days + '-day reminder sent to ' + info.email, { license_key: row.license_key, data: { to: info.email, template: 'trial_reminder_' + reminder2Days + 'd', days_left: reminder2Days, expiry_date: row.expiry_date } }, ctx);
            }
        } catch (err: any) {
            console.error('[TRIAL_REMINDER] ' + reminder2Days + '-day send failed for id=' + row.id + ': ' + err.message);
        }
    }
}

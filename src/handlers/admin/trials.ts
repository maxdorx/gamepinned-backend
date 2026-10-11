import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { sendTrialKeyEmail } from '../../email/templates/trialKey';
import { logAdminAction } from './audit';

export async function getTrials(env: Env): Promise<Response> {
    const stats = await env.DB.prepare(
        "SELECT " +
        "COUNT(*) as total, " +
        "SUM(CASE WHEN is_active=1 AND expiry_date > datetime('now') THEN 1 ELSE 0 END) as active, " +
        "SUM(CASE WHEN is_active=1 AND expiry_date BETWEEN datetime('now') AND datetime('now', '+7 days') THEN 1 ELSE 0 END) as expiring_7d, " +
        "SUM(CASE WHEN instr(customer_info, '\"converted_at\"') > 0 THEN 1 ELSE 0 END) as converted " +
        "FROM licenses WHERE tier='TRIAL'"
    ).first<any>();

    const trials = await env.DB.prepare(
        "SELECT l.id, l.license_key, l.expiry_date, l.is_active, l.reminder_count, l.customer_info, l.created_at, " +
        "CAST(julianday(l.expiry_date) - julianday('now') AS INTEGER) as days_left, " +
        "CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END as activated " +
        "FROM licenses l LEFT JOIN devices d ON d.license_id = l.id " +
        "WHERE l.tier='TRIAL' ORDER BY l.created_at DESC"
    ).all<any>();

    const total = stats?.total || 0;
    const converted = stats?.converted || 0;
    const convRate = total > 0 ? Math.round((converted / total) * 100) + '%' : '0%';

    const rows = (trials.results || []).map((row: any) => {
        const info = JSON.parse(row.customer_info || '{}');
        return {
            id: row.id,
            license_key: row.license_key,
            email: row.email || info.email || '',
            created_at: row.created_at,
            expiry_date: row.expiry_date,
            days_left: row.days_left,
            is_active: row.is_active === 1,
            activated: row.activated === 1,
            reminder_count: row.reminder_count || 0,
            converted: !!info.converted_at,
            converted_at: info.converted_at || null,
            converted_to_key: info.converted_to_key || null,
            trial_days: info.trial_days || 30
        };
    });

    return jsonResponse({
        stats: {
            total,
            active: stats?.active || 0,
            expiring_7d: stats?.expiring_7d || 0,
            converted,
            conversion_rate: convRate
        },
        trials: rows
    });
}

export async function extendTrial(request: Request, url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[4];
    const { days } = await request.json() as { days: number };
    if (!id || !days || days < 1 || days > 365) return errorResponse('Invalid parameters', 400);

    const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=? AND tier='TRIAL'").bind(id).first<any>();
    if (!license) return errorResponse('Trial not found', 404);

    const newExpiry = new Date(license.expiry_date || new Date());
    newExpiry.setDate(newExpiry.getDate() + days);
    const newExpiryStr = newExpiry.toISOString().split('T')[0];

    await env.DB.prepare("UPDATE licenses SET expiry_date=?, is_active=1 WHERE id=?").bind(newExpiryStr, id).run();
    await logAdminAction(env, 'TRIAL_EXTENDED', 'id=' + id + ' days=' + days + ' new_expiry=' + newExpiryStr);
    return jsonResponse({ status: 'ok', new_expiry: newExpiryStr });
}

export async function revokeTrial(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[4];
    if (!id) return errorResponse('Invalid id', 400);

    const license = await env.DB.prepare("SELECT id FROM licenses WHERE id=? AND tier='TRIAL'").bind(id).first<any>();
    if (!license) return errorResponse('Trial not found', 404);

    await env.DB.prepare("UPDATE licenses SET is_active=0 WHERE id=?").bind(id).run();
    await logAdminAction(env, 'TRIAL_REVOKED', 'id=' + id);
    return jsonResponse({ status: 'ok' });
}

export async function resendTrialKey(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[4];
    if (!id) return errorResponse('Invalid id', 400);

    const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=? AND tier='TRIAL'").bind(id).first<any>();
    if (!license) return errorResponse('Trial not found', 404);

    const info = JSON.parse(license.customer_info || '{}');
    const email = license.email || info.email;
    if (!email) return errorResponse('No email on record for this trial', 400);

    await sendTrialKeyEmail(email, license.license_key, info.trial_days || 30, env);
    await logAdminAction(env, 'TRIAL_KEY_RESENT', 'id=' + id + ' email=' + info.email);
    return jsonResponse({ status: 'ok' });
}

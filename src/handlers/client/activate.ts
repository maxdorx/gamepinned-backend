import { Env } from '../../types';
import { getClientIP } from '../../lib/ip';
import { checkRateLimit, recordAttempt } from '../../middleware/rateLimit';
import { computeHMAC } from '../../lib/crypto';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { logAdminAction } from '../admin/audit';
import { log } from '../../lib/logger';

export function isHardwareMatch(id1: string, id2: string): boolean {
    if (id1 === id2) return true;
    const p1 = id1.split('|');
    const p2 = id2.split('|');
    if (p1.length < 3 || p2.length < 3) return false;
    let matches = 0;
    if (p1[0] === p2[0]) matches++;
    if (p1[1] === p2[1]) matches++;
    if (p1[2] === p2[2]) matches++;
    return matches >= 2;
}

export async function handleActivation(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const clientIP = getClientIP(request);

    const rateLimitCheck = await checkRateLimit(clientIP, '/api/activate', env);
    if (!rateLimitCheck.allowed) {
        return errorResponse(rateLimitCheck.reason || "Too many activation attempts", 429);
    }

    try {
        const { key, hwid } = await request.json() as { key: string; hwid: string };

        if (!key || !hwid) return errorResponse("Key and HWID are required", 400);
        if (key.length > 256 || hwid.length > 512) return errorResponse("Invalid request", 400);

        const license = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ?").bind(key).first<any>();
        if (!license) {
            await recordAttempt(clientIP, '/api/activate', false, env);
            log(env, 'warn', 'license', 'activation_failed', 'Activation failed: key not found', { ip: clientIP, data: { reason: 'key_not_found' } }, ctx);
            return errorResponse("Invalid key", 403);
        }
        if (!license.is_active) {
            await recordAttempt(clientIP, '/api/activate', false, env);
            log(env, 'warn', 'license', 'activation_failed', 'Activation failed: license inactive', { ip: clientIP, license_key: license.license_key, data: { reason: 'license_inactive' } }, ctx);
            return errorResponse("Invalid key", 403);
        }

        if ((license.tier === 'SUBSCRIPTION' || license.tier === 'TRIAL') && license.expiry_date) {
            const expiry = new Date(license.expiry_date);
            if (new Date() > expiry) {
                await recordAttempt(clientIP, '/api/activate', false, env);
                log(env, 'warn', 'license', 'activation_failed', 'Activation failed: license expired', { ip: clientIP, license_key: license.license_key, data: { reason: 'expired', expiry_date: license.expiry_date } }, ctx);
                return errorResponse("Invalid key", 403);
            }
        }

        if (license.tier === 'TRIAL') {
            const priorTrial = await env.DB.prepare(
                "SELECT d.id FROM devices d JOIN licenses l ON d.license_id = l.id WHERE d.hwid_hash = ? AND l.tier = 'TRIAL' LIMIT 1"
            ).bind(hwid).first<any>();
            if (priorTrial) {
                await recordAttempt(clientIP, '/api/activate', false, env);
                log(env, 'warn', 'license', 'activation_trial_hw_reuse', 'Trial activation blocked: hardware already used a trial', { ip: clientIP, license_key: license.license_key, data: { hwid: hwid } }, ctx);
                return errorResponse("Trial already used on this hardware", 403);
            }
        }

        const existingDevice = await env.DB.prepare("SELECT * FROM devices WHERE license_id = ? AND hwid_hash = ?").bind(license.id, hwid).first<any>();

        if (!existingDevice) {
            if (license.tier !== 'TRIAL') {
                const globalDevice = await env.DB.prepare("SELECT id, license_id FROM devices WHERE hwid_hash = ?").bind(hwid).first<any>();
                if (globalDevice) {
                    const globalLicense = await env.DB.prepare("SELECT tier FROM licenses WHERE id = ?").bind(globalDevice.license_id).first<any>();
                    if (!globalLicense || globalLicense.tier !== 'TRIAL') {
                        await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(globalDevice.id).run();
                    }
                }
            }

            const insertResult = await env.DB.prepare(
                "INSERT INTO devices (license_id, hwid_hash) SELECT ?, ? WHERE (SELECT COUNT(*) FROM devices WHERE license_id = ?) < ?"
            ).bind(license.id, hwid, license.id, license.seat_limit).run();

            if (!insertResult.meta.changes || insertResult.meta.changes === 0) {
                log(env, 'warn', 'license', 'activation_seat_exceeded', 'Activation blocked: seat limit reached', { ip: clientIP, license_key: license.license_key, data: { seat_limit: license.seat_limit } }, ctx);
                return errorResponse("Seat limit reached", 403);
            }
        } else {
            await env.DB.prepare("UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?").bind(existingDevice.id).run();
        }

        if (license.tier === 'SUBSCRIPTION' || license.tier === 'PERPETUAL') {
            try {
                const trialDevice = await env.DB.prepare(
                    "SELECT l.id, l.customer_info FROM devices d JOIN licenses l ON d.license_id = l.id WHERE d.hwid_hash = ? AND l.tier = 'TRIAL' LIMIT 1"
                ).bind(hwid).first<any>();
                if (trialDevice) {
                    const info = JSON.parse(trialDevice.customer_info || '{}');
                    if (!info.converted_at) {
                        info.converted_at = new Date().toISOString();
                        info.converted_to_key = license.license_key;
                        await env.DB.prepare("UPDATE licenses SET customer_info = ? WHERE id = ?")
                            .bind(JSON.stringify(info), trialDevice.id).run();
                        await logAdminAction(env, 'TRIAL_CONVERTED', 'trial_id=' + trialDevice.id + ' paid_key=' + license.license_key);
                        console.log('[TRIAL] Conversion recorded: trial_id=' + trialDevice.id + ' -> ' + license.license_key);
                    }
                }
            } catch (convErr: any) {
                console.error('[TRIAL] Conversion tracking error (non-fatal): ' + convErr.message);
            }
        }

        const tier = license.tier.toUpperCase();
        const expiry = license.expiry_date || "NEVER";
        const signature = await computeHMAC(hwid, tier, expiry, env.SIGNING_KEY);
        const base64Blob = btoa(`${hwid}|${tier}|${expiry}|${signature}`);

        await recordAttempt(clientIP, '/api/activate', true, env);
        log(env, 'info', 'license', 'activation_success', 'License activated: ' + license.license_key + ' tier=' + license.tier, { ip: clientIP, license_key: license.license_key, data: { tier: license.tier, hwid: hwid, new_device: !existingDevice } }, ctx);

        return jsonResponse({ status: "success", tier: license.tier, license_blob: base64Blob });

    } catch (err: any) {
        console.error('[ERROR] Activation failed:', err.message);
        log(env, 'error', 'error', 'activation_error', 'Activation handler threw: ' + err.message, { ip: clientIP }, ctx);
        return errorResponse("Internal server error", 500);
    }
}

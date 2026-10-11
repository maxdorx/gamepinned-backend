import { Env } from '../../types';
import { getClientIP } from '../../lib/ip';
import { computeHMAC } from '../../lib/crypto';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { isHardwareMatch } from './activate';
import { sendAdminAlert } from '../../email/templates/adminAlert';
import { sendExpiryWarningEmail } from '../../email/templates/renewal';
import { logAdminAction } from '../admin/audit';
import { log, maskHwid } from '../../lib/logger';
import { parseJsonBody, RequestBodyTooLargeError } from '../../lib/requestBody';

const MAX_SYNC_REQUEST_BYTES = 8 * 1024;

export async function handleSync(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const clientIP = getClientIP(request);

    try {
        // Coarse shared-IP flood guard runs before reading the body or touching D1.
        // The hardware-specific limiter below protects an individual PC without
        // penalizing a site where many PCs share one public IP.
        const ipRateLimit = await env.PUBLIC_SYNC_DIAGNOSTIC_IP_RATE_LIMIT.limit({ key: clientIP });
        if (!ipRateLimit.success) return errorResponse("Too many requests. Try again shortly.", 429);

        const { key, hwid } = await parseJsonBody<{ key: string; hwid: string }>(request, MAX_SYNC_REQUEST_BYTES);
        if (!key || !hwid) return errorResponse("Key and HWID required", 400);
        if (key.length > 256 || hwid.length > 512) return errorResponse("Invalid request", 400);

        const rateLimit = await env.SYNC_HARDWARE_RATE_LIMIT.limit({ key: hwid });
        if (!rateLimit.success) return errorResponse("Too many sync requests. Try again shortly.", 429);

        const license = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ?").bind(key).first<any>();
        if (!license) {
            log(env, 'warn', 'license', 'sync_key_not_found', 'Sync rejected: key not found: ' + key, { ip: clientIP, license_key: key }, ctx);
            return errorResponse("Invalid key", 404);
        }
        if (!license.is_active) {
            log(env, 'warn', 'license', 'sync_key_revoked', 'Sync rejected: license revoked: ' + license.license_key, { ip: clientIP, license_key: license.license_key }, ctx);
            return errorResponse("License revoked", 403);
        }

        if ((license.tier === 'SUBSCRIPTION' || license.tier === 'TRIAL') && license.expiry_date && new Date() > new Date(license.expiry_date)) {
            log(env, 'warn', 'license', 'sync_expired', 'Sync rejected: license expired: ' + license.license_key, { ip: clientIP, license_key: license.license_key, data: { expiry_date: license.expiry_date } }, ctx);
            return errorResponse("Invalid key", 403);
        }

        const devices = await env.DB.prepare("SELECT * FROM devices WHERE license_id = ?").bind(license.id).all<any>();

        let targetDevice = devices.results.find((d: any) => isHardwareMatch(d.hwid_hash, hwid));

        if (targetDevice) {
            const mismatch = targetDevice.hwid_hash !== hwid ? 1 : 0;
            await env.DB.prepare("UPDATE devices SET last_seen = CURRENT_TIMESTAMP, last_reported_hwid = ? WHERE id = ?")
                .bind(hwid, targetDevice.id).run();
            if (mismatch) {
                log(env, 'warn', 'license', 'sync_hwid_mismatch', 'HWID mismatch on sync for ' + license.license_key, { ip: clientIP, license_key: license.license_key, data: { hwid1: maskHwid(targetDevice.hwid_hash), hwid2: maskHwid(hwid) } }, ctx);
            }
        } else {
            if (devices.results.length >= license.seat_limit) {
                log(env, 'warn', 'license', 'sync_seat_limit', 'Sync rejected: seat limit reached for ' + license.license_key + ' (' + devices.results.length + '/' + license.seat_limit + ')', { ip: clientIP, license_key: license.license_key, data: { seats_used: devices.results.length, seat_limit: license.seat_limit } }, ctx);
                return errorResponse("Seat limit reached", 403);
            }
            await env.DB.prepare("INSERT INTO devices (license_id, hwid_hash, last_reported_hwid) VALUES (?, ?, ?)")
                .bind(license.id, hwid, hwid).run();
        }

        const tier = license.tier.toUpperCase();
        const expiry = license.expiry_date || "NEVER";
        const signature = await computeHMAC(hwid, tier, expiry, env.SIGNING_KEY);
        const base64Blob = btoa(`${hwid}|${tier}|${expiry}|${signature}`);

        if (license.tier === 'SUBSCRIPTION' && license.expiry_date) {
            const expiryWarningDays = parseInt(env.EXPIRY_WARNING_DAYS ?? '7');
            const daysLeft = Math.ceil((new Date(license.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft >= 0 && daysLeft <= expiryWarningDays) {
                const recentAlert = await env.DB.prepare(
                    "SELECT id FROM admin_actions WHERE action = 'expiry_alert' AND target_id = ? AND timestamp > datetime('now', '-' || ? || ' days') LIMIT 1"
                ).bind(String(license.id), String(expiryWarningDays)).first();
                if (!recentAlert) {
                    const customerInfo = license.email || license.customer_info || 'N/A';
                    await logAdminAction(env, 'expiry_alert', String(license.id), { license_key: license.license_key, days_left: daysLeft });
                    log(env, 'warn', 'license', 'sync_expiry_warning', 'Expiry warning sent for ' + license.license_key + ' (' + daysLeft + ' days left)', { license_key: license.license_key, data: { days_left: daysLeft, expiry_date: license.expiry_date } }, ctx);
                    let customerEmailForWarning = license.email || '';
                    if (!customerEmailForWarning && license.customer_info) {
                        try { customerEmailForWarning = JSON.parse(license.customer_info).email || ''; } catch { }
                    }
                    const alertPromise = sendAdminAlert(
                        'Subscription Expiring Soon',
                        'A subscription license expires in ' + daysLeft + ' day(s).',
                        [
                            ['License Key', license.license_key],
                            ['Customer', customerInfo],
                            ['Expiry Date', license.expiry_date],
                            ['Days Remaining', String(daysLeft)]
                        ],
                        env
                    ).catch(() => {});
                    const warnPromise = customerEmailForWarning
                        ? sendExpiryWarningEmail(customerEmailForWarning, license.license_key, daysLeft, license.expiry_date, env).catch(() => {})
                        : Promise.resolve();
                    if (ctx) {
                        ctx.waitUntil(alertPromise);
                        ctx.waitUntil(warnPromise);
                    } else {
                        await alertPromise;
                        await warnPromise;
                    }
                }
            }
        }

        log(env, 'info', 'license', 'sync_success', 'License sync: ' + license.license_key + ' tier=' + license.tier, { ip: clientIP, license_key: license.license_key, data: { tier: license.tier, hwid: hwid } }, ctx);
        return jsonResponse({ status: "success", license_blob: base64Blob });
    } catch (err: any) {
        if (err instanceof RequestBodyTooLargeError) return errorResponse("Request is too large", 413);
        if (err instanceof SyntaxError) return errorResponse("Invalid request", 400);
        console.error('[ERROR] Sync failed:', err.message);
        log(env, 'error', 'error', 'sync_error', 'Sync handler threw: ' + err.message, { ip: clientIP }, ctx);
        return errorResponse("Internal server error", 500);
    }
}
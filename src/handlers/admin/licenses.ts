import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { logAdminAction } from './audit';

export async function getLicenses(env: Env): Promise<Response> {
    const licenses = await env.DB.prepare(`
        SELECT l.*,
               COALESCE(l.notes, '') as notes,
               (SELECT COUNT(*) FROM devices WHERE license_id = l.id) as seats_used,
               (SELECT GROUP_CONCAT(hwid_hash) FROM devices WHERE license_id = l.id) as hwids,
               (SELECT MAX(d.last_seen) FROM devices d WHERE d.license_id = l.id) as last_active_date
        FROM licenses l
        ORDER BY l.created_at DESC
    `).all<any>();

    const now = new Date();
    let activeLicenses = 0, expiredLicenses = 0, revokedLicenses = 0, expiringSoon = 0;
    let totalSeatsUsed = 0, totalSeatsAvailable = 0;
    const tierCounts: Record<string, number> = {};

    licenses.results.forEach((l: any) => {
        totalSeatsUsed += l.seats_used || 0;
        totalSeatsAvailable += l.seat_limit || 0;

        const tier = l.tier || 'FREE';
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;

        if (!l.is_active) {
            revokedLicenses++;
            return;
        }

        if (l.expiry_date) {
            const expiryDate = new Date(l.expiry_date);
            const diffMs = expiryDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                expiredLicenses++;
                return;
            } else if (diffDays <= 7) {
                expiringSoon++;
            }
        }

        activeLicenses++;
    });

    const expiringSoonList = licenses.results
        .filter((l: any) => {
            if (!l.is_active || !l.expiry_date) return false;
            const diffDays = Math.ceil((new Date(l.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 30;
        })
        .map((l: any) => {
            const daysLeft = Math.ceil((new Date(l.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const customerEmail = l.email || l.customer_info || '';
            return { license_key: l.license_key, customer: customerEmail, expiry_date: l.expiry_date, days_left: daysLeft };
        })
        .sort((a: any, b: any) => a.days_left - b.days_left);

    const stats = {
        totalKeys: licenses.results.length,
        activeLicenses,
        expiredLicenses,
        revokedLicenses,
        expiringSoon,
        expiringSoonList,
        totalDevices: totalSeatsUsed,
        totalSeatsUsed,
        totalSeatsAvailable,
        tierCounts,
        activeSeats: totalSeatsUsed,
        paidLicenses: (tierCounts['PERPETUAL'] || 0) + (tierCounts['SUBSCRIPTION'] || 0)
    };

    return jsonResponse({ licenses: licenses.results, stats });
}

export async function createLicense(request: Request, env: Env): Promise<Response> {
    const { key, tier, seats, expiry, customer } = await request.json() as any;

    if (tier && !['PERPETUAL', 'SUBSCRIPTION', 'TRIAL'].includes(tier)) {
        return errorResponse("Tier must be PERPETUAL, SUBSCRIPTION, or TRIAL", 400);
    }

    if ((tier === 'SUBSCRIPTION' || tier === 'TRIAL') && !expiry) {
        return errorResponse("Subscription and Trial keys must have an expiry date", 400);
    }

    const genBytes = crypto.getRandomValues(new Uint8Array(6));
    const finalKey = key || 'GP-' + Array.from(genBytes).map(b => b.toString(36).toUpperCase()).join('').substring(0, 8).padEnd(8, '0');

    const emailFromCustomer = typeof customer === 'string' && customer.includes('@') ? customer.toLowerCase().trim() : '';
    await env.DB.prepare("INSERT INTO licenses (license_key, tier, seat_limit, expiry_date, customer_info, email) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(finalKey, tier || 'PERPETUAL', parseInt(seats) || 1, expiry || null, customer || null, emailFromCustomer)
        .run();

    return jsonResponse({ status: "success", key: finalKey });
}

export async function toggleLicense(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split("/")[4];
    const before = await env.DB.prepare("SELECT license_key, is_active FROM licenses WHERE id = ?").bind(id).first<any>();
    await env.DB.prepare("UPDATE licenses SET is_active = 1 - is_active WHERE id = ?").bind(id).run();
    await logAdminAction(env, before?.is_active ? 'revoke_license' : 'restore_license', id, { license_key: before?.license_key });
    return jsonResponse({ status: "success" });
}

export async function updateLicenseSeats(request: Request, url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split("/")[4];
    const { seats } = await request.json() as any;
    const seatLimit = parseInt(seats);
    if (!seatLimit || seatLimit < 1) return errorResponse("Seat limit must be at least 1", 400);
    const before = await env.DB.prepare("SELECT license_key, seat_limit FROM licenses WHERE id = ?").bind(id).first<any>();
    await env.DB.prepare("UPDATE licenses SET seat_limit = ? WHERE id = ?").bind(seatLimit, id).run();
    await logAdminAction(env, 'edit_seats', id, { license_key: before?.license_key, old_seats: before?.seat_limit, new_seats: seatLimit });
    return jsonResponse({ status: "success", seat_limit: seatLimit });
}

export async function updateLicenseTier(request: Request, url: URL, env: Env): Promise<Response> {
    try {
        const id = url.pathname.split("/")[4];
        const { tier, expiry_date } = await request.json() as any;

        if (!['PERPETUAL', 'SUBSCRIPTION'].includes(tier)) {
            return errorResponse("Tier must be PERPETUAL or SUBSCRIPTION", 400);
        }

        if (tier === 'SUBSCRIPTION' && !expiry_date) {
            return errorResponse("SUBSCRIPTION tier requires expiry_date", 400);
        }

        const finalExpiry = tier === 'PERPETUAL' ? null : expiry_date;

        const before = await env.DB.prepare("SELECT license_key, tier, expiry_date FROM licenses WHERE id = ?").bind(id).first<any>();
        await env.DB.prepare(
            "UPDATE licenses SET tier = ?, expiry_date = ? WHERE id = ?"
        ).bind(tier, finalExpiry, id).run();
        await logAdminAction(env, 'edit_tier', id, { license_key: before?.license_key, old_tier: before?.tier, new_tier: tier, old_expiry: before?.expiry_date, new_expiry: finalExpiry });

        return jsonResponse({ status: "success", tier, expiry_date: finalExpiry });
    } catch (error: any) {
        console.error("Update license tier error:", error);
        return errorResponse(error.message || "Internal server error", 500);
    }
}

export async function deleteLicense(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split("/")[4];
    const before = await env.DB.prepare("SELECT license_key, tier, customer_info FROM licenses WHERE id = ?").bind(id).first<any>();
    await env.DB.prepare("DELETE FROM devices WHERE license_id = ?").bind(id).run();

    await env.DB.prepare("DELETE FROM licenses WHERE id = ?").bind(id).run();
    await logAdminAction(env, 'delete_license', id, { license_key: before?.license_key, tier: before?.tier, customer_info: before?.customer_info });
    return jsonResponse({ status: "success" });
}

export async function updateLicenseNotes(request: Request, url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[4];
    const { notes } = await request.json() as any;
    const before = await env.DB.prepare("SELECT license_key FROM licenses WHERE id = ?").bind(id).first<any>();
    await env.DB.prepare("UPDATE licenses SET notes = ? WHERE id = ?").bind(notes || '', id).run();
    await logAdminAction(env, 'edit_notes', id, { license_key: before?.license_key });
    return jsonResponse({ status: 'success' });
}

export async function getExpiringThisMonth(env: Env): Promise<Response> {
    const rows = await env.DB.prepare(
        "SELECT id, license_key, tier, seat_limit, expiry_date, customer_info, is_active " +
        "FROM licenses WHERE tier = 'SUBSCRIPTION' AND is_active = 1 " +
        "AND expiry_date <= date('now', '+30 days') AND expiry_date >= date('now') " +
        "ORDER BY expiry_date ASC"
    ).all<any>();
    return jsonResponse({ expiring: rows.results || [] });
}

export async function getLicenseHealth(env: Env): Promise<Response> {
    const rows = await env.DB.prepare(
        "SELECT l.license_key, MAX(d.last_seen) as latest_seen FROM licenses l LEFT JOIN devices d ON d.license_id = l.id GROUP BY l.id, l.license_key"
    ).all<any>();

    const health: Record<string, string> = {};
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDayMs = 7 * oneDayMs;

    for (const row of (rows.results || [])) {
        if (!row.latest_seen) {
            health[row.license_key] = 'red';
            continue;
        }
        const diffMs = now - new Date(row.latest_seen).getTime();
        if (diffMs <= oneDayMs) {
            health[row.license_key] = 'green';
        } else if (diffMs <= sevenDayMs) {
            health[row.license_key] = 'yellow';
        } else {
            health[row.license_key] = 'red';
        }
    }

    return jsonResponse({ health });
}

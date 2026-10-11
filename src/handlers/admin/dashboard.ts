import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { getLicenses, getLicenseHealth, getExpiringThisMonth } from './licenses';

export async function getDashboard(env: Env): Promise<Response> {
    try {
        // Run all 4 data sources in parallel — licenses is the heavy one, rest are simple queries
        const [licensesResp, healthResp, expiringResp, trialStats] = await Promise.all([
            getLicenses(env),
            getLicenseHealth(env),
            getExpiringThisMonth(env),
            env.DB.prepare(
                "SELECT COUNT(*) as total, " +
                "SUM(CASE WHEN is_active=1 AND expiry_date > datetime('now') THEN 1 ELSE 0 END) as active, " +
                "SUM(CASE WHEN instr(customer_info, '\"converted_at\"') > 0 THEN 1 ELSE 0 END) as converted " +
                "FROM licenses WHERE tier='TRIAL'"
            ).first<any>(),
        ]);

        // Parse the three Response bodies (in-memory JSON.parse, negligible cost)
        const [licensesData, healthData, expiringData] = await Promise.all([
            licensesResp.json() as Promise<any>,
            healthResp.json() as Promise<any>,
            expiringResp.json() as Promise<any>,
        ]);

        const total = trialStats?.total || 0;
        const converted = trialStats?.converted || 0;

        return jsonResponse({
            licenses: licensesData.licenses,
            stats: licensesData.stats,
            trial_stats: {
                active: trialStats?.active || 0,
                converted,
                conversion_rate: total > 0 ? Math.round((converted / total) * 100) + '%' : '0%',
            },
            health: healthData.health || {},
            expiring: expiringData.expiring || [],
        });
    } catch (error: any) {
        console.error('Get dashboard error:', error);
        return errorResponse(error.message || 'Internal server error', 500);
    }
}

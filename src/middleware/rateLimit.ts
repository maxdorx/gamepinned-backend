import { Env } from '../types';
import { log } from '../lib/logger';

type RateLimitEntry = { maxAttempts: number; windowMinutes: number; blockMinutes: number };

// Fallback used when RATE_LIMIT_CONFIG env var is missing or unparseable.
const FALLBACK_RATE_LIMIT_CONFIG: Record<string, RateLimitEntry> = {
    '/admin/login':   { maxAttempts: 5,   windowMinutes: 15, blockMinutes: 30 },
    '/api/admin':     { maxAttempts: 5,   windowMinutes: 15, blockMinutes: 30 },
    '/api/activate':  { maxAttempts: 10,  windowMinutes: 5,  blockMinutes: 15 },
    '/webhook/polar': { maxAttempts: 20,  windowMinutes: 5,  blockMinutes: 15 },
    '/api/feedback':  { maxAttempts: 5,   windowMinutes: 10, blockMinutes: 30 },
    'DEFAULT':        { maxAttempts: 50,  windowMinutes: 5,  blockMinutes: 10 },
};

function getRateLimitConfig(env: Env): Record<string, RateLimitEntry> {
    if (!env.RATE_LIMIT_CONFIG) return FALLBACK_RATE_LIMIT_CONFIG;
    try {
        return JSON.parse(env.RATE_LIMIT_CONFIG) as Record<string, RateLimitEntry>;
    } catch {
        console.error('[RateLimit] Failed to parse RATE_LIMIT_CONFIG env var — using fallback');
        return FALLBACK_RATE_LIMIT_CONFIG;
    }
}

export async function cleanupExpiredRateLimits(env: Env): Promise<void> {
    await env.DB.prepare(
        "DELETE FROM rate_limits WHERE last_attempt < datetime('now', '-1 hour')"
    ).run();
}

export async function checkRateLimit(ip: string, endpoint: string, env: Env, ctx?: ExecutionContext): Promise<{ allowed: boolean; reason?: string }> {
    const now = new Date();

    const record = await env.DB.prepare(
        "SELECT * FROM rate_limits WHERE ip_address = ? AND endpoint = ?"
    ).bind(ip, endpoint).first<any>();

    if (!record) {
        return { allowed: true };
    }

    if (record.blocked_until) {
        const blockedUntil = new Date(record.blocked_until);
        if (now < blockedUntil) {
            return { allowed: false, reason: 'Too many failed attempts. Try again later.' };
        }
    }

    const config = getRateLimitConfig(env);
    const limit = config[endpoint] ?? config['DEFAULT'] ?? FALLBACK_RATE_LIMIT_CONFIG['DEFAULT'];
    const windowStart = new Date(now.getTime() - limit.windowMinutes * 60000);
    const firstAttempt = new Date(record.first_attempt);

    if (firstAttempt > windowStart && record.attempts >= limit.maxAttempts) {
        const blockUntil = new Date(now.getTime() + limit.blockMinutes * 60000);
        await env.DB.prepare(
            "UPDATE rate_limits SET blocked_until = ?, last_attempt = CURRENT_TIMESTAMP WHERE ip_address = ? AND endpoint = ?"
        ).bind(blockUntil.toISOString(), ip, endpoint).run();

        log(env, 'warn', 'rate_limit', 'rate_limit_blocked',
            'IP blocked on ' + endpoint + ' after ' + record.attempts + ' attempts',
            { ip: ip, data: { endpoint, attempts: record.attempts, blocked_until: blockUntil.toISOString() } },
            ctx
        );

        return { allowed: false, reason: 'Too many failed attempts. Try again later.' };
    }

    return { allowed: true };
}

export async function recordAttempt(ip: string, endpoint: string, success: boolean, env: Env): Promise<void> {
    if (success) {
        await env.DB.prepare(
            "DELETE FROM rate_limits WHERE ip_address = ? AND endpoint = ?"
        ).bind(ip, endpoint).run();
        return;
    }

    const existing = await env.DB.prepare(
        "SELECT * FROM rate_limits WHERE ip_address = ? AND endpoint = ?"
    ).bind(ip, endpoint).first<any>();

    if (existing) {
        const firstAttempt = new Date(existing.first_attempt);
        const now = new Date();
        const config = getRateLimitConfig(env);
        const limit = config[endpoint] ?? config['DEFAULT'] ?? FALLBACK_RATE_LIMIT_CONFIG['DEFAULT'];
        const windowStart = new Date(now.getTime() - limit.windowMinutes * 60000);

        if (firstAttempt < windowStart) {
            await env.DB.prepare(
                "UPDATE rate_limits SET attempts = 1, first_attempt = CURRENT_TIMESTAMP, last_attempt = CURRENT_TIMESTAMP WHERE ip_address = ? AND endpoint = ?"
            ).bind(ip, endpoint).run();
        } else {
            await env.DB.prepare(
                "UPDATE rate_limits SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP WHERE ip_address = ? AND endpoint = ?"
            ).bind(ip, endpoint).run();
        }
    } else {
        await env.DB.prepare(
            "INSERT INTO rate_limits (ip_address, endpoint, attempts) VALUES (?, ?, 1)"
        ).bind(ip, endpoint).run();
    }
}

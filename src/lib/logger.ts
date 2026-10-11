import { Env } from '../types';

type LogLevel    = 'info' | 'warn' | 'error';
type LogCategory = 'auth' | 'license' | 'webhook' | 'download' | 'email' | 'rate_limit' | 'cron' | 'error' | 'system';

interface LogOptions {
    ip?:          string;
    license_key?: string;
    data?:        Record<string, any>;
}

// Mask a hardware ID — show only the first 8 chars so logs are useful but not exposing full IDs.
export function maskHwid(hwid: string): string {
    if (!hwid) return '';
    return hwid.substring(0, 8) + '...';
}

/**
 * Fire-and-forget structured logger. Writes to the backend_logs D1 table.
 * NEVER throws. NEVER awaited. A failure here must never affect the caller.
 *
 * Usage:
 *   log(env, 'info', 'license', 'activation_success', 'License activated: GP-XXXX', { ip, license_key: key, data: { tier, seats } });
 */
export function log(
    env:      Env,
    level:    LogLevel,
    category: LogCategory,
    event:    string,
    message:  string,
    opts:     LogOptions = {},
    ctx?:     ExecutionContext
): void {
    // Sanitise data — mask hwid if present, never log HMAC blobs or secrets
    let safeData: Record<string, any> | undefined = opts.data;
    if (safeData) {
        safeData = { ...safeData };
        if (safeData.hwid)  safeData.hwid  = maskHwid(safeData.hwid);
        if (safeData.hwid1) safeData.hwid1 = maskHwid(safeData.hwid1);
        if (safeData.hwid2) safeData.hwid2 = maskHwid(safeData.hwid2);
        // Never log HMAC blobs — they are long base64 strings we never need to read
        delete safeData.license_blob;
        delete safeData.signature;
    }

    const promise = env.DB
        .prepare(
            'INSERT INTO backend_logs (level, category, event, ip, license_key, message, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
            level,
            category,
            event,
            opts.ip          ?? null,
            opts.license_key ?? null,
            message,
            safeData ? JSON.stringify(safeData) : null
        )
        .run()
        .catch(() => {});

    if (ctx) ctx.waitUntil(promise);
}

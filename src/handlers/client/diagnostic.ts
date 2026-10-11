import { Env } from '../../types';
import { getClientIP } from '../../lib/ip';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { log } from '../../lib/logger';
import { parseJsonBody, RequestBodyTooLargeError } from '../../lib/requestBody';

const MAX_DIAGNOSTIC_REQUEST_BYTES = 1536 * 1024;
const HARDWARE_ID_PATTERN = /^(?:[a-f0-9]{64}\|){2}[a-f0-9]{64}$/;
const APP_VERSION_PATTERN = /^[A-Za-z0-9._+-]{1,128}$/;

export async function handleDiagnostic(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const clientIP = getClientIP(request);

    try {
        // Coarse shared-IP flood guard runs before reading the upload or touching
        // R2/D1. The hardware-specific limiter below still permits diagnostics
        // from several PCs at the same site.
        const ipRateLimit = await env.PUBLIC_SYNC_DIAGNOSTIC_IP_RATE_LIMIT.limit({ key: clientIP });
        if (!ipRateLimit.success) return errorResponse("Too many requests. Try again shortly.", 429);

        // The GUI submits at most 500 KB. Extra headroom covers JSON overhead;
        // the streaming limit rejects oversized public requests before D1/R2 work.
        const body = await parseJsonBody<any>(request, MAX_DIAGNOSTIC_REQUEST_BYTES);
        const { hardware_id, raw_license_key, log_content, app_version } = body;

        if (typeof hardware_id !== 'string' || typeof log_content !== 'string' || !hardware_id || !log_content) {
            return errorResponse("Missing required fields", 400);
        }
        if (
            !HARDWARE_ID_PATTERN.test(hardware_id) ||
            (raw_license_key != null && (typeof raw_license_key !== 'string' || raw_license_key.length > 256)) ||
            (app_version != null && (typeof app_version !== 'string' || !APP_VERSION_PATTERN.test(app_version)))
        ) {
            return errorResponse("Invalid diagnostic report", 400);
        }

        const rateLimit = await env.DIAGNOSTIC_HARDWARE_RATE_LIMIT.limit({ key: hardware_id });
        if (!rateLimit.success) return errorResponse("Too many diagnostic uploads. Try again shortly.", 429);

        const maxLength = 1024 * 1024;
        const truncated: string = log_content.length > maxLength
            ? '[truncated - showing last 1MB]' + log_content.substring(log_content.length - maxLength)
            : log_content;

        const timestamp = Date.now();
        const hwPrefix = hardware_id.substring(0, 16).replace(/[^a-zA-Z0-9]/g, '_');
        const r2Key = 'diagnostics/' + hwPrefix + '/' + timestamp + '.log';

        await env.UPDATES_BUCKET.put(r2Key, truncated);

        await env.DB.prepare(
            "INSERT INTO diagnostic_reports (hardware_id, raw_license_key, r2_key, file_size, app_version) VALUES (?, ?, ?, ?, ?)"
        ).bind(
            hardware_id,
            raw_license_key || null,
            r2Key,
            truncated.length,
            app_version || null
        ).run();

        log(env, 'info', 'system', 'diagnostic_submitted', 'Diagnostic uploaded v=' + (app_version || 'unknown') + ' size=' + truncated.length, { ip: clientIP, license_key: raw_license_key || undefined, data: { r2_key: r2Key, file_size: truncated.length, app_version: app_version || null } }, ctx);
        return jsonResponse({ status: 'ok' });

    } catch (error: any) {
        if (error instanceof RequestBodyTooLargeError) return errorResponse("Diagnostic report is too large", 413);
        if (error instanceof SyntaxError) return errorResponse("Invalid diagnostic report", 400);
        console.error('[ERROR] Diagnostic handler failed:', error.message);
        return errorResponse("Internal server error", 500);
    }
}
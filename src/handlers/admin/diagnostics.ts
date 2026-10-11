import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';

// Decrypts an encrypted debug log produced by PinAgent.EncryptDebugLine.
// Format: SESSION_KEY:<base64(RSA-OAEP-SHA256 encrypted AES key)> as header,
// then base64(IV_16_bytes | AES-CBC ciphertext) per line.
// Multiple SESSION_KEY headers are allowed (one per service run within the same day).
async function decryptDebugLog(content: string, privateKeyPem: string): Promise<string> {
    const pemBody = privateKeyPem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s+/g, '');
    const derBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        derBytes.buffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
    );

    const lines = content.split('\n').filter(l => l.trim() !== '');
    let sessionKey: CryptoKey | null = null;
    const decrypted: string[] = [];

    for (const line of lines) {
        if (line.startsWith('SESSION_KEY:')) {
            try {
                const encKeyBytes = Uint8Array.from(atob(line.slice('SESSION_KEY:'.length)), c => c.charCodeAt(0));
                const sessionKeyBytes = await crypto.subtle.decrypt(
                    { name: 'RSA-OAEP' },
                    privateKey,
                    encKeyBytes
                );
                sessionKey = await crypto.subtle.importKey(
                    'raw',
                    sessionKeyBytes,
                    { name: 'AES-CBC' },
                    false,
                    ['decrypt']
                );
            } catch {
                sessionKey = null;
                decrypted.push('[SESSION_KEY: failed to decrypt — wrong private key?]');
            }
        } else if (sessionKey) {
            // Two-stage: first check if the line is base64 at all.
            // GUI plain-text lines contain characters not valid in base64, so atob() throws.
            // Treat those as plain text rather than reporting a decryption failure.
            let rawBytes: Uint8Array;
            try {
                rawBytes = Uint8Array.from(atob(line), c => c.charCodeAt(0));
            } catch {
                decrypted.push(line);
                continue;
            }
            try {
                const iv = rawBytes.slice(0, 16);
                const ciphertext = rawBytes.slice(16);
                const plainBytes = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, sessionKey, ciphertext);
                decrypted.push(new TextDecoder().decode(plainBytes));
            } catch {
                decrypted.push('[line decryption failed]');
            }
        } else {
            decrypted.push(line);
        }
    }

    return decrypted.join('\n');
}

export async function getDiagnosticReports(env: Env): Promise<Response> {
    const reports = await env.DB.prepare(
        "SELECT id, hardware_id, raw_license_key, submitted_at, r2_key, file_size, app_version FROM diagnostic_reports ORDER BY submitted_at DESC LIMIT 100"
    ).all<any>();
    return jsonResponse(reports.results);
}

export async function getDiagnosticContent(url: URL, env: Env): Promise<Response> {
    const parts = url.pathname.split('/');
    const id = parts[4];
    const report = await env.DB.prepare(
        "SELECT r2_key, hardware_id FROM diagnostic_reports WHERE id = ?"
    ).bind(id).first<any>();

    if (!report) return errorResponse("Report not found", 404);

    const r2Object = await env.UPDATES_BUCKET.get(report.r2_key);
    if (!r2Object) return errorResponse("Log file not found in storage", 404);

    const reader = r2Object.body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    let content = new TextDecoder().decode(merged);

    // Decrypt if the log is encrypted and the private key secret is configured
    if (content.includes('SESSION_KEY:') && env.DEBUG_LOG_PRIVATE_KEY) {
        try {
            content = await decryptDebugLog(content, env.DEBUG_LOG_PRIVATE_KEY);
        } catch {
            content = '[Decryption failed — check DEBUG_LOG_PRIVATE_KEY secret]\n\n' + content;
        }
    }

    return jsonResponse({ content });
}

export async function downloadDiagnosticReport(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[4];
    const report = await env.DB.prepare(
        "SELECT r2_key, hardware_id FROM diagnostic_reports WHERE id = ?"
    ).bind(id).first<any>();

    if (!report) return errorResponse("Report not found", 404);

    const r2Object = await env.UPDATES_BUCKET.get(report.r2_key);
    if (!r2Object) return errorResponse("Log file not found in storage", 404);

    const hwShort = (report.hardware_id as string).substring(0, 8);
    return new Response(r2Object.body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': 'attachment; filename="diagnostic_' + hwShort + '.log"',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

export async function deleteDiagnosticReport(url: URL, env: Env): Promise<Response> {
    const parts = url.pathname.split('/');
    const id = parts[4];
    const report = await env.DB.prepare(
        "SELECT r2_key FROM diagnostic_reports WHERE id = ?"
    ).bind(id).first<any>();

    if (!report) return errorResponse("Report not found", 404);

    try { await env.UPDATES_BUCKET.delete(report.r2_key); } catch { /* R2 object may already be gone */ }
    await env.DB.prepare("DELETE FROM diagnostic_reports WHERE id = ?").bind(id).run();

    return jsonResponse({ ok: true });
}

export async function adminSearch(url: URL, env: Env): Promise<Response> {
    const q = url.searchParams.get('q') || '';
    if (!q || q.length < 2) return jsonResponse({ results: [] });

    const pattern = '%' + q + '%';

    const licenseResults = await env.DB.prepare(
        "SELECT id, license_key, tier, is_active, customer_info, expiry_date, email FROM licenses WHERE license_key LIKE ? OR email LIKE ? OR customer_info LIKE ? LIMIT 20"
    ).bind(pattern, pattern, pattern).all<any>();

    const hwResults = await env.DB.prepare(
        "SELECT d.license_id, l.license_key, d.hwid_hash as hardware_id, d.last_seen, l.tier, l.customer_info " +
        "FROM devices d " +
        "LEFT JOIN licenses l ON l.id = d.license_id " +
        "WHERE d.hwid_hash LIKE ? LIMIT 10"
    ).bind(pattern).all<any>();

    return jsonResponse({
        licenses: licenseResults.results || [],
        hardware: hwResults.results || []
    });
}

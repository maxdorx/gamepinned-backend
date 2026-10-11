import { Env } from '../../types';
import { verifyDownloadToken } from '../../lib/crypto';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { log } from '../../lib/logger';

export async function handleVersionCheck(requestUrl: URL, env: Env): Promise<Response> {
    try {
        const latest = await env.DB.prepare(`
            SELECT * FROM updates
            WHERE is_active = 1
            ORDER BY upload_date DESC
            LIMIT 1
        `).first<any>();

        if (!latest) {
            return jsonResponse({
                version: "1.0.0",
                downloadUrl: "",
                releaseNotes: "",
                required: false,
                releaseDate: "",
                fileSize: 0
            });
        }

        let downloadUrl = latest.download_url;
        if (downloadUrl.startsWith('/') || downloadUrl.includes('your-cdn.com')) {
            const filename = downloadUrl.split('/').pop() || `GamePinned-v${latest.version}.exe`;
            downloadUrl = `${requestUrl.origin}/download/${filename}`;
        }

        return jsonResponse({
            version: latest.version,
            downloadUrl: downloadUrl,
            releaseNotes: latest.release_notes || "",
            required: latest.required === 1,
            releaseDate: latest.release_date,
            fileSize: latest.file_size,
            sha256Hash: latest.sha256_hash
        });
    } catch (error) {
        return errorResponse("Failed to check version", 500);
    }
}

export async function handleDownload(url: URL, request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    let filename = url.pathname.split('/').pop();
    if (!filename) return errorResponse("Missing filename", 400);

    if (filename === "latest") {
        const latest = await env.DB.prepare(`
            SELECT * FROM updates
            WHERE is_active = 1
            ORDER BY upload_date DESC
            LIMIT 1
        `).first<any>();

        if (!latest) return errorResponse("No active version found", 404);

        const extractedFilename = latest.download_url.split('/').pop();
        if (!extractedFilename) return errorResponse("Invalid download URL in database", 500);
        filename = extractedFilename;
    } else {
        const token = url.searchParams.get('token');
        if (token) {
            const valid = await verifyDownloadToken(token, filename, env);
            if (!valid) return errorResponse("File not found", 404);
        } else {
            const record = await env.DB.prepare(
                "SELECT is_active FROM updates WHERE download_url = ? LIMIT 1"
            ).bind('/download/' + filename).first<any>();
            if (!record || record.is_active !== 1) return errorResponse("File not found", 404);
        }
    }

    const object = await env.UPDATES_BUCKET.get(filename!);
    if (!object) return errorResponse("File not found", 404);

    try {
        const ua = request.headers.get('User-Agent') || '';
        const srcParam = url.searchParams.get('src');
        const source = srcParam === 'website' ? 'website'
            : srcParam === 'autoupdate' ? 'autoupdate'
            : ua.startsWith('Mozilla') ? 'website'
            : 'autoupdate';
        const country = (request as any).cf?.country || 'XX';
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
        const ipHash = ip !== 'unknown' ? await hashIp(ip) : 'unknown';
        await env.DB.prepare(
            "INSERT INTO download_events (ip_hash, country, version, source, user_agent) VALUES (?, ?, ?, ?, ?)"
        ).bind(ipHash, country, filename, source, ua.substring(0, 150)).run();
        log(env, 'info', 'download', 'download_success', 'File downloaded: ' + filename + ' source=' + source + ' country=' + country + ' ip=' + ip, { ip, data: { filename, source, country } }, ctx);
    } catch (_) { /* never block a download over analytics */ }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="GamePinned.exe"`);
    headers.set("Cache-Control", "public, max-age=31536000");

    return new Response(object.body, { headers });
}

export async function calculateSHA256(file: File): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashIp(ip: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getDownloadAnalytics(env: Env): Promise<Response> {
    try {
        const [total, today, month, countries, sources, versions, daily, recent] = await Promise.all([
            env.DB.prepare("SELECT COUNT(*) as c FROM download_events").first<any>(),
            env.DB.prepare("SELECT COUNT(*) as c FROM download_events WHERE date(timestamp) = date('now')").first<any>(),
            env.DB.prepare("SELECT COUNT(*) as c FROM download_events WHERE timestamp >= date('now', 'start of month')").first<any>(),
            env.DB.prepare(
                "SELECT country, COUNT(*) as count FROM download_events GROUP BY country ORDER BY count DESC LIMIT 10"
            ).all(),
            env.DB.prepare(
                "SELECT source, COUNT(*) as count FROM download_events GROUP BY source ORDER BY count DESC"
            ).all(),
            env.DB.prepare(
                "SELECT version, COUNT(*) as count FROM download_events GROUP BY version ORDER BY count DESC LIMIT 10"
            ).all(),
            env.DB.prepare(
                "SELECT date(timestamp) as date, COUNT(*) as count FROM download_events WHERE timestamp >= date('now', '-' || ? || ' days') GROUP BY date(timestamp) ORDER BY date ASC"
            ).bind(String(parseInt(env.ANALYTICS_LOOKBACK_DAYS ?? '30'))).all(),
            env.DB.prepare(
                "SELECT timestamp, country, version, source FROM download_events ORDER BY timestamp DESC LIMIT 50"
            ).all(),
        ]);

        return jsonResponse({
            total: total?.c ?? 0,
            today: today?.c ?? 0,
            this_month: month?.c ?? 0,
            unique_countries: (countries.results || []).length,
            by_country: countries.results || [],
            by_source: sources.results || [],
            by_version: versions.results || [],
            daily: daily.results || [],
            recent: recent.results || [],
        });
    } catch (err) {
        return errorResponse("Failed to load download analytics", 500);
    }
}

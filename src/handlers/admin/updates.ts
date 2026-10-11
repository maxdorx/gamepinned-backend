import { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { generateDownloadToken } from '../../lib/crypto';
import { calculateSHA256 } from '../client/version';

export async function getUpdates(env: Env): Promise<Response> {
    try {
        const updates = await env.DB.prepare(`
            SELECT * FROM updates
            ORDER BY upload_date DESC
        `).all();
        return jsonResponse({ updates: updates.results });
    } catch (error) {
        return errorResponse("Failed to fetch updates", 500);
    }
}

export async function uploadUpdate(request: Request, env: Env): Promise<Response> {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const version = formData.get('version') as string;
        const required = formData.get('required') === 'true';
        const isDraft = formData.get('is_draft') === 'true';
        const releaseNotes = formData.get('releaseNotes') as string;

        if (!file || !version) {
            return errorResponse("Missing file or version", 400);
        }

        if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version)) {
            return errorResponse("Invalid version format. Expected: X.Y.Z (e.g. 1.0.2)", 400);
        }

        if (!file.name.endsWith('.exe')) {
            return errorResponse("File must be .exe", 400);
        }

        const maxMb = parseInt(env.MAX_UPDATE_FILE_MB ?? '100');
        if (file.size > maxMb * 1024 * 1024) {
            return errorResponse("File too large (max " + maxMb + "MB)", 413);
        }

        const filename = `GamePinned-v${version}.exe`;
        await env.UPDATES_BUCKET.put(filename, await file.arrayBuffer());

        const downloadUrl = `/download/${filename}`;
        const sha256Hash = await calculateSHA256(file);

        await env.DB.prepare(`
            INSERT OR REPLACE INTO updates
            (version, download_url, release_notes, required, file_size, sha256_hash, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            version,
            downloadUrl,
            releaseNotes || "",
            required ? 1 : 0,
            file.size,
            sha256Hash,
            isDraft ? 0 : 1
        ).run();

        return jsonResponse({
            success: true,
            message: `Update ${version} uploaded successfully`,
            version,
            downloadUrl,
            fileSize: file.size
        });
    } catch (error) {
        return errorResponse("Upload failed", 500);
    }
}

export async function generateUpdateDownloadToken(url: URL, env: Env): Promise<Response> {
    const parts = url.pathname.split('/');
    const updateId = parts[parts.length - 2];

    const update = await env.DB.prepare(
        "SELECT download_url FROM updates WHERE id = ?"
    ).bind(updateId).first<any>();

    if (!update) return errorResponse("Update not found", 404);

    const filename = update.download_url.split('/').pop();
    if (!filename) return errorResponse("Invalid update record", 500);

    const token = await generateDownloadToken(filename, env);
    return jsonResponse({ url: '/download/' + filename + '?token=' + token });
}

export async function deleteUpdate(url: URL, env: Env): Promise<Response> {
    try {
        const updateId = url.pathname.split('/').pop();

        const update = await env.DB.prepare("SELECT version FROM updates WHERE id = ?")
            .bind(updateId)
            .first<any>();

        if (update) {
            const filename = `GamePinned-v${update.version}.exe`;
            try {
                await env.UPDATES_BUCKET.delete(filename);
            } catch (r2Error) {
                console.error(`Failed to delete R2 object: ${filename}`, r2Error);
            }

            await env.DB.prepare("DELETE FROM updates WHERE id = ?")
                .bind(updateId)
                .run();
        }

        return jsonResponse({ success: true, message: "Update deleted successfully" });
    } catch (error) {
        return errorResponse("Failed to delete update", 500);
    }
}

export async function activateUpdate(url: URL, env: Env): Promise<Response> {
    try {
        const parts = url.pathname.split('/');
        const updateId = parts[parts.length - 2];
        await env.DB.prepare("UPDATE updates SET is_active = 1 WHERE id = ?")
            .bind(updateId)
            .run();
        return jsonResponse({ success: true, message: "Update activated" });
    } catch (error) {
        return errorResponse("Failed to activate update", 500);
    }
}

export async function deactivateUpdate(url: URL, env: Env): Promise<Response> {
    try {
        const parts = url.pathname.split('/');
        const updateId = parts[parts.length - 2];
        await env.DB.prepare("UPDATE updates SET is_active = 0 WHERE id = ?")
            .bind(updateId)
            .run();
        return jsonResponse({ success: true, message: "Update deactivated" });
    } catch (error) {
        return errorResponse("Failed to deactivate update", 500);
    }
}

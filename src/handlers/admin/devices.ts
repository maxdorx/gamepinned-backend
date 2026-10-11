import { Env } from '../../types';
import { jsonResponse } from '../../lib/headers';
import { logAdminAction } from './audit';

export async function getDevices(url: URL, env: Env): Promise<Response> {
    const licenseId = url.searchParams.get("license_id");
    const devices = await env.DB.prepare("SELECT * FROM devices WHERE license_id = ? ORDER BY last_seen DESC")
        .bind(licenseId)
        .all();
    return jsonResponse(devices.results);
}

export async function deleteDevice(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split("/")[4];
    const before = await env.DB.prepare("SELECT hwid_hash, license_id FROM devices WHERE id = ?").bind(id).first<any>();
    await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(id).run();
    await logAdminAction(env, 'delete_device', id, { hwid_hash: before?.hwid_hash, license_id: before?.license_id });
    return jsonResponse({ status: "success" });
}

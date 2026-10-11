import { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/headers';
import { logAdminAction } from './admin/audit';

const COMPONENT_STATUSES = ['operational', 'degraded_performance', 'partial_outage', 'major_outage', 'maintenance'] as const;
const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;

type ComponentStatus = typeof COMPONENT_STATUSES[number];
type IncidentStatus = typeof INCIDENT_STATUSES[number];

function isComponentStatus(value: unknown): value is ComponentStatus {
    return typeof value === 'string' && COMPONENT_STATUSES.includes(value as ComponentStatus);
}

function isIncidentStatus(value: unknown): value is IncidentStatus {
    return typeof value === 'string' && INCIDENT_STATUSES.includes(value as IncidentStatus);
}

async function requestJson<T>(request: Request): Promise<T | null> {
    try {
        return await request.json() as T;
    } catch {
        return null;
    }
}

function overallStatus(components: any[], incidents: any[]): ComponentStatus {
    const states = [
        ...components.map((component) => component.status),
        ...incidents.filter((incident) => incident.status !== 'resolved').map((incident) => incident.impact),
    ];
    if (states.includes('major_outage')) return 'major_outage';
    if (states.includes('partial_outage')) return 'partial_outage';
    if (states.includes('degraded_performance')) return 'degraded_performance';
    if (states.includes('maintenance')) return 'maintenance';
    return 'operational';
}

function d1UtcDate(value: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function readStatus(env: Env, includeResolved: boolean) {
    const [components, incidents, updates, maintenance] = await Promise.all([
        env.DB.prepare('SELECT id, name, description, status, updated_at FROM status_components ORDER BY display_order ASC').all<any>(),
        env.DB.prepare('SELECT id, title, impact, status, message, affected_components, created_at, updated_at, resolved_at FROM status_incidents ORDER BY updated_at DESC LIMIT 30').all<any>(),
        env.DB.prepare('SELECT incident_id, status, message, created_at FROM status_incident_updates WHERE incident_id IN (SELECT id FROM status_incidents ORDER BY updated_at DESC LIMIT 30) ORDER BY created_at ASC, rowid ASC').all<any>(),
        env.DB.prepare("SELECT id, title, message, starts_at, ends_at, status FROM status_maintenance WHERE status = 'scheduled' AND ends_at >= CURRENT_TIMESTAMP ORDER BY starts_at ASC LIMIT 10").all<any>(),
    ]);

    const updatesByIncident = new Map<string, any[]>();
    for (const update of updates.results || []) {
        const current = updatesByIncident.get(update.incident_id) || [];
        current.push(update);
        updatesByIncident.set(update.incident_id, current);
    }

    const allIncidents = (incidents.results || []).map((incident) => ({
        ...incident,
        updates: updatesByIncident.get(incident.id) || [{ status: incident.status, message: incident.message, created_at: incident.updated_at }],
    }));
    const activeIncidents = allIncidents.filter((incident) => incident.status !== 'resolved');
    const componentRows = components.results || [];

    return {
        overall_status: overallStatus(componentRows, activeIncidents),
        components: componentRows,
        incidents: includeResolved ? allIncidents : activeIncidents,
        incident_history: includeResolved ? [] : allIncidents.filter((incident) => incident.status === 'resolved'),
        maintenance: maintenance.results || [],
        updated_at: new Date().toISOString(),
    };
}

export async function getPublicStatus(env: Env): Promise<Response> {
    try {
        return jsonResponse(await readStatus(env, false), 200, { 'Cache-Control': 'public, max-age=30, s-maxage=30' });
    } catch {
        return jsonResponse({
            overall_status: 'unknown', components: [], incidents: [], incident_history: [], maintenance: [],
            updated_at: new Date().toISOString(), notice: 'Status data is being initialized.',
        }, 200, { 'Cache-Control': 'no-store' });
    }
}

export async function getAdminStatus(env: Env): Promise<Response> {
    try {
        return jsonResponse(await readStatus(env, true), 200, { 'Cache-Control': 'no-store' });
    } catch {
        return errorResponse('Status tables are not initialized. Run schema.sql against D1 first.', 503);
    }
}

export async function getDependencyHealth(env: Env): Promise<Response> {
    try {
        const check = await env.DB.prepare('SELECT 1 AS healthy').first<{ healthy: number }>();
        if (check?.healthy !== 1) throw new Error('D1 health check returned no result');
        return jsonResponse({ status: 'ok', database: 'ok' }, 200, { 'Cache-Control': 'no-store' });
    } catch {
        return jsonResponse({ status: 'error', database: 'unavailable' }, 503, { 'Cache-Control': 'no-store' });
    }
}

export async function updateStatusComponent(request: Request, url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[5];
    const body = await requestJson<{ status?: unknown }>(request);
    if (!id || !body || !isComponentStatus(body.status)) return errorResponse('Invalid component status', 400);

    const result = await env.DB.prepare('UPDATE status_components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.status, id).run();
    if (!result.meta.changes) return errorResponse('Status component not found', 404);
    await logAdminAction(env, 'update_status_component', id, { status: body.status });
    return jsonResponse({ ok: true });
}

export async function createStatusIncident(request: Request, env: Env): Promise<Response> {
    const body = await requestJson<{ title?: unknown; message?: unknown; impact?: unknown; affected_components?: unknown }>(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const impact = isComponentStatus(body?.impact) ? body.impact : 'major_outage';
    const affected = Array.isArray(body?.affected_components) ? [...new Set(body.affected_components.filter((id): id is string => typeof id === 'string'))].slice(0, 8) : [];
    if (!title || !message || title.length > 160 || message.length > 2000) return errorResponse('Title and update message are required', 400);

    if (affected.length) {
        const placeholders = affected.map(() => '?').join(', ');
        const known = await env.DB.prepare('SELECT id FROM status_components WHERE id IN (' + placeholders + ')').bind(...affected).all<{ id: string }>();
        if ((known.results || []).length !== affected.length) return errorResponse('One or more status components are invalid', 400);
    }

    const id = crypto.randomUUID();
    const statements = [
        env.DB.prepare('INSERT INTO status_incidents (id, title, impact, status, message, affected_components) VALUES (?, ?, ?, ?, ?, ?)').bind(id, title, impact, 'investigating', message, JSON.stringify(affected)),
        env.DB.prepare('INSERT INTO status_incident_updates (id, incident_id, status, message) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'investigating', message),
        ...affected.map((componentId) => env.DB.prepare('UPDATE status_components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(impact, componentId)),
    ];
    await env.DB.batch(statements);
    await logAdminAction(env, 'create_status_incident', id, { title, impact, affected_components: affected });
    return jsonResponse({ ok: true, id });
}

export async function updateStatusIncident(request: Request, url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[5];
    const body = await requestJson<{ status?: unknown; message?: unknown }>(request);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!id || !body || !isIncidentStatus(body.status) || !message || message.length > 2000) return errorResponse('Invalid incident update', 400);

    const existing = await env.DB.prepare('SELECT id FROM status_incidents WHERE id = ?').bind(id).first<{ id: string }>();
    if (!existing) return errorResponse('Incident not found', 404);

    const resolvedAt = body.status === 'resolved' ? 'CURRENT_TIMESTAMP' : 'NULL';
    await env.DB.batch([
        env.DB.prepare('UPDATE status_incidents SET status = ?, message = ?, updated_at = CURRENT_TIMESTAMP, resolved_at = ' + resolvedAt + ' WHERE id = ?').bind(body.status, message, id),
        env.DB.prepare('INSERT INTO status_incident_updates (id, incident_id, status, message) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), id, body.status, message),
    ]);
    await logAdminAction(env, 'update_status_incident', id, { status: body.status });
    return jsonResponse({ ok: true });
}

export async function createStatusMaintenance(request: Request, env: Env): Promise<Response> {
    const body = await requestJson<{ title?: unknown; message?: unknown; starts_at?: unknown; ends_at?: unknown }>(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const startsAt = typeof body?.starts_at === 'string' ? d1UtcDate(body.starts_at) : null;
    const endsAt = typeof body?.ends_at === 'string' ? d1UtcDate(body.ends_at) : null;
    if (!title || !message || !startsAt || !endsAt || startsAt >= endsAt || title.length > 160 || message.length > 2000) return errorResponse('Valid title, message, and UTC maintenance times are required', 400);

    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO status_maintenance (id, title, message, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)').bind(id, title, message, startsAt, endsAt).run();
    await logAdminAction(env, 'schedule_status_maintenance', id, { title, starts_at: startsAt, ends_at: endsAt });
    return jsonResponse({ ok: true, id });
}

export async function cancelStatusMaintenance(url: URL, env: Env): Promise<Response> {
    const id = url.pathname.split('/')[5];
    if (!id) return errorResponse('Maintenance item not found', 404);
    const result = await env.DB.prepare("UPDATE status_maintenance SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").bind(id).run();
    if (!result.meta.changes) return errorResponse('Maintenance item not found', 404);
    await logAdminAction(env, 'cancel_status_maintenance', id);
    return jsonResponse({ ok: true });
}
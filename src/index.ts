import { Hono, type Context, type Next } from 'hono';
import { Env } from './types';
import { timingSafeStringEqual } from './lib/crypto';
import { getClientIP } from './lib/ip';
import { secureHeaders, jsonResponse, errorResponse } from './lib/headers';
import { checkRateLimit, recordAttempt } from './middleware/rateLimit';
import { handleActivation } from './handlers/client/activate';
import { handleSync } from './handlers/client/sync';
import { handleVersionCheck, handleDownload, getDownloadAnalytics } from './handlers/client/version';
import { handleFeedback } from './handlers/client/feedback';
import { handleNewsletter } from './handlers/client/newsletter';
import { handleDiagnostic } from './handlers/client/diagnostic';
import { handlePolarWebhook } from './handlers/webhook/polar';
import { getLicenses, createLicense, toggleLicense, updateLicenseSeats, updateLicenseTier, deleteLicense, updateLicenseNotes, getExpiringThisMonth, getLicenseHealth } from './handlers/admin/licenses';
import { getDashboard } from './handlers/admin/dashboard';
import { getDevices, deleteDevice } from './handlers/admin/devices';
import { getTrials, extendTrial, revokeTrial, resendTrialKey } from './handlers/admin/trials';
import { getUpdates, uploadUpdate, generateUpdateDownloadToken, deleteUpdate, activateUpdate, deactivateUpdate } from './handlers/admin/updates';
import { getDiagnosticReports, getDiagnosticContent, downloadDiagnosticReport, deleteDiagnosticReport, adminSearch } from './handlers/admin/diagnostics';
import { getRateLimits, unblockIP } from './handlers/admin/rateLimits';
import { logAdminAction, getAuditLog } from './handlers/admin/audit';
import { getLogs, getLogStats } from './handlers/admin/logs';
import { getNewsletterSubscribers } from './handlers/admin/newsletter';
import { getFeedbackSubmissions } from './handlers/admin/feedback';
import { handleScheduled } from './cron/index';
import { serveAdmin, serveStatusAdmin, LOGIN_PAGE } from './handlers/pages/admin';
import { log } from './lib/logger';
import { getPublicStatus, getAdminStatus, getDependencyHealth, updateStatusComponent, createStatusIncident, updateStatusIncident, createStatusMaintenance, cancelStatusMaintenance } from './handlers/status';

const app = new Hono<{ Bindings: Env }>();

// CORS preflight
app.options('*', (_c) => new Response(null, { status: 204, headers: secureHeaders() }));

// Static assets
app.get('/favicon.ico', (c) => c.env.ASSETS.fetch(new Request('http://dummy/favicon.ico')));
app.get('/logo.apng', (c) => c.env.ASSETS.fetch(new Request('http://dummy/logo.apng')));
app.get('/status-logo-mark.svg', (c) => c.env.ASSETS.fetch(new Request('http://dummy/status-logo-mark.svg')));

// ─── Client routes ────────────────────────────────────────────────────────────

app.get('/', (c) => {
    if (new URL(c.req.url).hostname === 'status.example.com') {
        return c.env.ASSETS.fetch(new Request('http://dummy/status.html'));
    }
    return Response.redirect('https://example.com', 301);
});
app.get('/robots.txt', (c) => {
    if (new URL(c.req.url).hostname === 'status.example.com') {
        return new Response('User-agent: *\nAllow: /\n\nSitemap: https://status.example.com/sitemap.xml\n', {
            headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
        });
    }
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
});

app.get('/sitemap.xml', (c) => {
    if (new URL(c.req.url).hostname !== 'status.example.com') {
        return new Response('Not found', { status: 404 });
    }
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://status.example.com/</loc>
    <changefreq>hourly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`, {
        headers: {
            'Content-Type': 'application/xml; charset=UTF-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
});

app.get('/health', (_c) => jsonResponse({ status: 'ok', service: 'GamePinned Backend' }));
app.get('/health/dependencies', (c) => getDependencyHealth(c.env));

app.post('/activate',       (c) => handleActivation(c.req.raw, c.env, c.executionCtx as ExecutionContext));
app.post('/sync',           (c) => handleSync(c.req.raw, c.env, c.executionCtx as ExecutionContext));
app.get('/version',         (c) => handleVersionCheck(new URL(c.req.url), c.env));
app.get('/download/:file',  (c) => handleDownload(new URL(c.req.url), c.req.raw, c.env, c.executionCtx as ExecutionContext));

app.post('/webhook/polar',  (c) => handlePolarWebhook(c.req.raw, c.env, c.executionCtx as ExecutionContext));

app.post('/api/feedback',   (c) => handleFeedback(c.req.raw, c.env, c.executionCtx as ExecutionContext));
app.post('/api/newsletter', (c) => handleNewsletter(c.req.raw, c.env, c.executionCtx as ExecutionContext));
app.post('/api/diagnostic', (c) => handleDiagnostic(c.req.raw, c.env, c.executionCtx as ExecutionContext));
app.get('/status/api', (c) => getPublicStatus(c.env));
app.get('/status', (c) => c.env.ASSETS.fetch(new Request('http://dummy/status.html')));
app.get('/status-admin.html', () => new Response('Not found', { status: 404 }));


// ─── Admin HTML ───────────────────────────────────────────────────────────────

app.get('/admin/status', (c) => serveStatusAdmin(c.req.raw, c.env));
app.get('/admin', (c) => serveAdmin(c.req.raw, c.env));

app.get('/admin/login', (c) => {
    const error = c.req.query('error') || '';
    return new Response(LOGIN_PAGE(error), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
});

app.post('/admin/login', async (c) => {
    const loginIP = getClientIP(c.req.raw);
    const loginRateCheck = await checkRateLimit(loginIP, '/admin/login', c.env, c.executionCtx as ExecutionContext);
    if (!loginRateCheck.allowed) {
        return new Response(null, {
            status: 302,
            headers: { 'Location': '/admin/login?error=' + encodeURIComponent(loginRateCheck.reason || 'Too many attempts.') }
        });
    }
    const formData = await c.req.raw.formData();
    const token = formData.get('token')?.toString().trim() || '';
    if (await timingSafeStringEqual(token, c.env.ADMIN_TOKEN)) {
        await recordAttempt(loginIP, '/admin/login', true, c.env);
        log(c.env, 'info', 'auth', 'admin_login_success', 'Admin login succeeded', { ip: loginIP }, c.executionCtx as ExecutionContext);
        return new Response(null, {
            status: 302,
            headers: {
                'Location': '/admin',
                'Set-Cookie': 'gp_session=' + token + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400',
            },
        });
    }
    await recordAttempt(loginIP, '/admin/login', false, c.env);
    log(c.env, 'warn', 'auth', 'admin_login_failed', 'Admin login failed: wrong token', { ip: loginIP }, c.executionCtx as ExecutionContext);
    return new Response(null, {
        status: 302,
        headers: { 'Location': '/admin/login?error=' + encodeURIComponent('Invalid admin token. Please try again.') }
    });
});

app.get('/admin/logout', () => new Response(null, {
    status: 302,
    headers: {
        'Location': '/admin',
        'Set-Cookie': 'gp_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
}));

// ─── Admin API ────────────────────────────────────────────────────────────────

const admin = new Hono<{ Bindings: Env }>();

// Auth + rate-limit middleware applied to every /api/admin/* route
admin.use('*', async (c: Context<{ Bindings: Env }>, next: Next) => {
    const clientIP = getClientIP(c.req.raw);

    const rateLimitCheck = await checkRateLimit(clientIP, '/api/admin', c.env, c.executionCtx as ExecutionContext);
    if (!rateLimitCheck.allowed) {
        return errorResponse(rateLimitCheck.reason || 'Too many requests', 429);
    }

    const auth = c.req.header('Authorization');
    const cookie = c.req.header('Cookie') || '';
    const sessionToken = cookie.split(';').map((s: string) => s.trim())
        .find((s: string) => s.startsWith('gp_session='))?.split('=')[1];
    const isAuthenticated =
        (auth ? await timingSafeStringEqual(auth, c.env.ADMIN_TOKEN) : false) ||
        (sessionToken ? await timingSafeStringEqual(sessionToken, c.env.ADMIN_TOKEN) : false);

    if (!isAuthenticated) {
        await recordAttempt(clientIP, '/api/admin', false, c.env);
        return errorResponse('Unauthorized', 401);
    }

    await recordAttempt(clientIP, '/api/admin', true, c.env);
    return next();
});

// Dashboard (aggregate — replaces 4 separate calls)
admin.get('/dashboard',                           (c) => getDashboard(c.env));

// Licenses
admin.get('/licenses',                            (c) => getLicenses(c.env));
admin.post('/licenses',                           (c) => createLicense(c.req.raw, c.env));
admin.post('/licenses/:id/toggle',                (c) => toggleLicense(new URL(c.req.url), c.env));
admin.patch('/licenses/:id/seats',                (c) => updateLicenseSeats(c.req.raw, new URL(c.req.url), c.env));
admin.patch('/licenses/:id/update-tier',          (c) => updateLicenseTier(c.req.raw, new URL(c.req.url), c.env));
admin.put('/licenses/:id/notes',                  (c) => updateLicenseNotes(c.req.raw, new URL(c.req.url), c.env));
admin.delete('/licenses/:id',                     (c) => deleteLicense(new URL(c.req.url), c.env));

// Devices
admin.get('/devices',                             (c) => getDevices(new URL(c.req.url), c.env));
admin.delete('/devices/:id',                      (c) => deleteDevice(new URL(c.req.url), c.env));

// Updates
admin.get('/updates',                             (c) => getUpdates(c.env));
admin.post('/updates',                            (c) => uploadUpdate(c.req.raw, c.env));
admin.post('/updates/:id/activate',               (c) => activateUpdate(new URL(c.req.url), c.env));
admin.post('/updates/:id/deactivate',             (c) => deactivateUpdate(new URL(c.req.url), c.env));
admin.post('/updates/:id/download-token',         (c) => generateUpdateDownloadToken(new URL(c.req.url), c.env));
admin.delete('/updates/:id',                      (c) => deleteUpdate(new URL(c.req.url), c.env));

admin.get('/downloads',                           (c) => getDownloadAnalytics(c.env));
admin.get('/license-health',                      (c) => getLicenseHealth(c.env));

// Security monitor
admin.get('/rate-limits',                         (c) => getRateLimits(c.env));
admin.post('/rate-limits/:id/unblock',            (c) => unblockIP(new URL(c.req.url), c.env));

// Audit & diagnostics
admin.get('/audit-log',                           (c) => getAuditLog(c.env));
admin.get('/logs',                                (c) => getLogs(c.req.raw, c.env));
admin.get('/logs/stats',                          (c) => getLogStats(c.env));
admin.get('/diagnostics',                         (c) => getDiagnosticReports(c.env));
admin.get('/diagnostics/:id/content',             (c) => getDiagnosticContent(new URL(c.req.url), c.env));
admin.get('/diagnostics/:id/download',            (c) => downloadDiagnosticReport(new URL(c.req.url), c.env));
admin.delete('/diagnostics/:id',                  (c) => deleteDiagnosticReport(new URL(c.req.url), c.env));

// Newsletter subscribers
admin.get('/newsletter',                          (c) => getNewsletterSubscribers(c.env));

// Feedback form submissions
admin.get('/feedback',                            (c) => getFeedbackSubmissions(c.env));

// Search & expiry
admin.get('/search',                              (c) => adminSearch(new URL(c.req.url), c.env));
admin.get('/expiring',                            (c) => getExpiringThisMonth(c.env));

// Public status administration
admin.get('/status',                               (c) => getAdminStatus(c.env));
admin.patch('/status/components/:id',              (c) => updateStatusComponent(c.req.raw, new URL(c.req.url), c.env));
admin.post('/status/incidents',                    (c) => createStatusIncident(c.req.raw, c.env));
admin.patch('/status/incidents/:id',               (c) => updateStatusIncident(c.req.raw, new URL(c.req.url), c.env));
admin.post('/status/maintenance',                  (c) => createStatusMaintenance(c.req.raw, c.env));
admin.delete('/status/maintenance/:id',            (c) => cancelStatusMaintenance(new URL(c.req.url), c.env));

// Trials
admin.get('/trials',                              (c) => getTrials(c.env));
admin.post('/trials/:id/extend',                  (c) => extendTrial(c.req.raw, new URL(c.req.url), c.env));
admin.post('/trials/:id/revoke',                  (c) => revokeTrial(new URL(c.req.url), c.env));
admin.post('/trials/:id/resend',                  (c) => resendTrialKey(new URL(c.req.url), c.env));

app.route('/api/admin', admin);

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    fetch: app.fetch,
    async scheduled(event: any, env: Env, ctx: any): Promise<void> {
        await handleScheduled(event, env, ctx);
    },
};
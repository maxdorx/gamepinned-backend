import { Env } from '../../types';
import { timingSafeStringEqual } from '../../lib/crypto';
import { getClientIP } from '../../lib/ip';
import { checkRateLimit, recordAttempt } from '../../middleware/rateLimit';
import { jsonResponse, errorResponse } from '../../lib/headers';
import { sendLicenseEmail } from '../../email/templates/license';
import { sendCancellationEmail } from '../../email/templates/cancellation';
import { sendAdminAlert } from '../../email/templates/adminAlert';
import { sendRenewalConfirmationEmail } from '../../email/templates/renewal';
import { sendTrialKeyEmail, sendAlreadyTrialedEmail } from '../../email/templates/trialKey';
import { logAdminAction } from '../admin/audit';
import { log } from '../../lib/logger';

async function handleTrialOrder(payload: any, clientIP: string, env: Env, ctx: ExecutionContext): Promise<Response> {
    const trialEnabled = (env.TRIAL_ENABLED ?? 'true') === 'true';
    if (!trialEnabled) {
        console.log('[TRIAL] Trial creation is disabled (TRIAL_ENABLED=false)');
        return jsonResponse({ status: 'skipped', reason: 'trials_disabled' });
    }

    const data = payload.data;
    const email: string = (data.customer?.email || data.user_email || data.email || '').toLowerCase().trim();
    const webhookId: string = payload.id || payload.data?.id || '';
    const productName: string = data.product?.name || 'GamePinned Trial';
    const trialDays = parseInt(env.TRIAL_DAYS ?? '30');
    const trialSeats = parseInt(env.TRIAL_SEATS ?? '1');

    // Basic email validation
    if (!email || !email.includes('@') || email.length < 5) {
        console.error('[TRIAL] Invalid email in webhook: ' + email);
        return errorResponse('Invalid customer email', 400);
    }

    // Idempotency: same webhook_id already processed
    if (webhookId) {
        const idempotent = await env.DB.prepare(
            "SELECT license_key FROM licenses WHERE tier='TRIAL' AND instr(customer_info, ?) > 0 LIMIT 1"
        ).bind(webhookId).first<any>();
        if (idempotent) {
            console.log('[TRIAL] Idempotent resend for webhook ' + webhookId);
        log(env, 'info', 'webhook', 'webhook_duplicate', 'Duplicate trial webhook ignored: ' + webhookId, { ip: clientIP, data: { webhook_id: webhookId } }, ctx);
            ctx.waitUntil(sendTrialKeyEmail(email, idempotent.license_key, trialDays, env).catch(e => console.error('[EMAIL] Trial resend failed:', e.message)));
            return jsonResponse({ status: 'ok', reason: 'idempotent_resend' });
        }
    }

    // Email dedup: has this email already received a trial?
    const emailDup = await env.DB.prepare(
        "SELECT license_key, expiry_date, is_active FROM licenses WHERE tier='TRIAL' AND email = ? LIMIT 1"
    ).bind(email).first<any>();
    if (emailDup) {
        console.log('[TRIAL] Email already used for trial: ' + email);
        log(env, 'info', 'webhook', 'trial_duplicate_email', 'Trial duplicate email - resending existing key to ' + email, { ip: clientIP, data: { email } }, ctx);
        ctx.waitUntil(sendAlreadyTrialedEmail(email, emailDup.license_key, emailDup.expiry_date, emailDup.is_active === 1, env).catch(e => console.error('[EMAIL] Already-trialed email failed:', e.message)));
        return jsonResponse({ status: 'ok', reason: 'existing_trial_resent' });
    }

    // Generate license key
    const keyBytes = crypto.getRandomValues(new Uint8Array(6));
    const licenseKey = 'GP-' + Array.from(keyBytes).map((b: number) => b.toString(36).toUpperCase()).join('').substring(0, 8).padEnd(8, '0');

    // Calculate expiry
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + trialDays);
    const expiryStr = expiry.toISOString().split('T')[0];

    // subscription_id stored so renewal order.created events can find this license by subscription_id
    const customerInfo = JSON.stringify({
        email: email,
        product: productName,
        webhook_id: webhookId,
        subscription_id: data.id || '',
        source: 'trial',
        trial_days: trialDays,
        created_at: new Date().toISOString()
    });

    // Insert trial license
    await env.DB.prepare(
        "INSERT INTO licenses (license_key, tier, seat_limit, expiry_date, customer_info, is_active, reminder_count, email, polar_subscription_id) VALUES (?, 'TRIAL', ?, ?, ?, 1, 0, ?, ?)"
    ).bind(licenseKey, trialSeats, expiryStr, customerInfo, email, data.id || '').run();

    // Audit log
    await logAdminAction(env, 'TRIAL_CREATED', 'email=' + email + ' key=' + licenseKey + ' expires=' + expiryStr);
    log(env, 'info', 'webhook', 'trial_created', 'Trial license created: ' + licenseKey + ' for ' + email + ' expires ' + expiryStr, { ip: clientIP, license_key: licenseKey, data: { email, trial_days: trialDays, expiry: expiryStr } }, ctx);

    // Emails fire in background — DB write is done, response returns to Polar immediately
    ctx.waitUntil(Promise.all([
        sendTrialKeyEmail(email, licenseKey, trialDays, env).catch(e => console.error('[EMAIL] Trial key email failed:', e.message)),
        sendAdminAlert('New Trial Started', 'A new ' + trialDays + '-day trial was activated.', [
            ['Email', email],
            ['License Key', licenseKey],
            ['Expires', expiryStr],
            ['Product', productName]
        ], env).catch(e => console.error('[EMAIL] Admin alert failed:', e.message)),
    ]));

    // Record attempt
    await recordAttempt(clientIP, '/webhook/polar', true, env);

    console.log('[TRIAL] Created trial license ' + licenseKey + ' for ' + email + ' expires ' + expiryStr);
    return jsonResponse({ status: 'ok' });
}

async function handleSubscriptionRenewal(payload: any, clientIP: string, env: Env, ctx: ExecutionContext): Promise<Response> {
    const data = payload.data;
    const subscriptionId: string = data.subscription_id || '';
    const orderId: string = payload.id || data.id || '';
    const productName: string = data.product?.name || '';
    const customerEmail: string = (data.customer?.email || data.user_email || data.email || '').toLowerCase().trim();

    if (!subscriptionId) {
        console.error('[RENEWAL] No subscription_id in order.created');
        return errorResponse('Missing subscription_id', 400);
    }

    // Idempotency: has this specific renewal order already been processed?
    if (orderId) {
        const alreadyProcessed = await env.DB.prepare(
            "SELECT id FROM licenses WHERE instr(customer_info, ?) > 0"
        ).bind(orderId).first<any>();
        if (alreadyProcessed) {
            console.log('[RENEWAL] Already processed order ' + orderId);
            await recordAttempt(clientIP, '/webhook/polar', true, env);
            return jsonResponse({ status: 'already_processed' });
        }
    }

    // Find the license linked to this Polar subscription
    const license = await env.DB.prepare(
        "SELECT id, license_key, tier, expiry_date, seat_limit, customer_info, created_at FROM licenses WHERE polar_subscription_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1"
    ).bind(subscriptionId).first<any>();

    // Calculate new expiry from today
    const isYearly = productName.toLowerCase().includes('year') || productName.toLowerCase().includes('annual');
    const daysToAdd = isYearly ? parseInt(env.SUBSCRIPTION_YEARLY_DAYS ?? '365') : parseInt(env.SUBSCRIPTION_MONTHLY_DAYS ?? '30');
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);
    const newExpiryStr = newExpiry.toISOString().split('T')[0];

    if (!license) {
        // No matching license — create a fallback SUBSCRIPTION license
        console.log('[RENEWAL] No license found for subscription ' + subscriptionId + '. Creating fallback license.');
        const seatMatch = productName.match(/(\d+)\s*PC/i);
        const seatLimit = /unlimited/i.test(productName) ? parseInt(env.UNLIMITED_SEATS ?? '999') : (seatMatch ? parseInt(seatMatch[1], 10) : 1);
        const keyBytes = crypto.getRandomValues(new Uint8Array(6));
        const newKey = 'GP-' + Array.from(keyBytes).map((b: number) => b.toString(36).toUpperCase()).join('').substring(0, 8).padEnd(8, '0');
        const fallbackInfo = JSON.stringify({
            email: customerEmail,
            product: productName,
            webhook_id: orderId,
            subscription_id: subscriptionId,
            source: 'polar_renewal_fallback',
            created_at: new Date().toISOString()
        });
        await env.DB.prepare(
            "INSERT INTO licenses (license_key, tier, seat_limit, expiry_date, customer_info, is_active, email, polar_subscription_id) VALUES (?, 'SUBSCRIPTION', ?, ?, ?, 1, ?, ?)"
        ).bind(newKey, seatLimit, newExpiryStr, fallbackInfo, customerEmail, subscriptionId).run();
        await logAdminAction(env, 'SUBSCRIPTION_RENEWED_FALLBACK', 'new_key=' + newKey + ' subscription=' + subscriptionId);
        log(env, 'warn', 'webhook', 'subscription_renewed_fallback', 'Renewal fallback: no license found for subscription ' + subscriptionId + ', created new key ' + newKey, { ip: clientIP, license_key: newKey, data: { subscription_id: subscriptionId, email: customerEmail } }, ctx);
        ctx.waitUntil(sendLicenseEmail(customerEmail, newKey, 'SUBSCRIPTION', newExpiryStr, env, seatLimit).catch(e => console.error('[EMAIL] Fallback license email failed:', e.message)));
        await recordAttempt(clientIP, '/webhook/polar', true, env);
        return jsonResponse({ status: 'ok', action: 'fallback_license_created' });
    }

    // Update customer_info: record this order ID (idempotency for future replays)
    const info = JSON.parse(license.customer_info || '{}');
    info.last_order_id = orderId;
    info.last_renewed_at = new Date().toISOString();

    const minutesSinceCreation = (Date.now() - new Date(license.created_at).getTime()) / 60000;
    const isNewSubscription = minutesSinceCreation < 5;

    if (license.tier === 'TRIAL') {
        // First billing after trial ends. Convert TRIAL to SUBSCRIPTION in-place (same key, same seat_limit)
        info.converted_at = new Date().toISOString();
        await env.DB.prepare(
            "UPDATE licenses SET tier='SUBSCRIPTION', expiry_date=?, customer_info=? WHERE id=?"
        ).bind(newExpiryStr, JSON.stringify(info), license.id).run();
        await logAdminAction(env, 'TRIAL_CONVERTED', 'key=' + license.license_key + ' new_expiry=' + newExpiryStr + ' subscription=' + subscriptionId);
        log(env, 'info', 'webhook', 'trial_converted', 'Trial converted to subscription: ' + license.license_key + ' expires ' + newExpiryStr, { ip: clientIP, license_key: license.license_key, data: { new_expiry: newExpiryStr, subscription_id: subscriptionId } }, ctx);
        console.log('[RENEWAL] Trial converted to subscription: ' + license.license_key + ' expires ' + newExpiryStr);
        const trialConvertEmail = customerEmail || info.email || '';
        ctx.waitUntil(Promise.all([
            sendAdminAlert('Trial Converted to Pro', 'A trial converted to a paid subscription.', [
                ['License Key', license.license_key],
                ['Customer', trialConvertEmail || 'N/A'],
                ['New Expiry', newExpiryStr]
            ], env).catch(e => console.error('[EMAIL] Trial conversion alert failed:', e.message)),
            trialConvertEmail ? sendRenewalConfirmationEmail(trialConvertEmail, license.license_key, newExpiryStr, true, env).catch(e => console.error('[EMAIL] Trial conversion confirmation failed:', e.message)) : Promise.resolve(),
        ]));
    } else {
        // Regular renewal: extend expiry
        await env.DB.prepare(
            "UPDATE licenses SET expiry_date=?, customer_info=? WHERE id=?"
        ).bind(newExpiryStr, JSON.stringify(info), license.id).run();
        await logAdminAction(env, 'SUBSCRIPTION_RENEWED', 'key=' + license.license_key + ' new_expiry=' + newExpiryStr);
        log(env, 'info', 'webhook', 'subscription_renewed', 'Subscription renewed: ' + license.license_key + ' new expiry ' + newExpiryStr, { ip: clientIP, license_key: license.license_key, data: { new_expiry: newExpiryStr, subscription_id: subscriptionId } }, ctx);
        console.log('[RENEWAL] Subscription renewed: ' + license.license_key + ' expires ' + newExpiryStr);
        const renewalEmail = customerEmail || info.email || '';
        if (renewalEmail && !isNewSubscription) ctx.waitUntil(sendRenewalConfirmationEmail(renewalEmail, license.license_key, newExpiryStr, false, env).catch(e => console.error('[EMAIL] Renewal confirmation failed:', e.message)));
    }

    await recordAttempt(clientIP, '/webhook/polar', true, env);
    return jsonResponse({ status: 'ok' });
}

export async function handlePolarWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const clientIP = getClientIP(request);

    const rateLimitCheck = await checkRateLimit(clientIP, '/webhook/polar', env);
    if (!rateLimitCheck.allowed) {
        return errorResponse(rateLimitCheck.reason || "Too many requests", 429);
    }

    try {
        const webhookId = request.headers.get('webhook-id');
        const webhookTimestamp = request.headers.get('webhook-timestamp');
        const webhookSignature = request.headers.get('webhook-signature');

        if (!webhookId || !webhookTimestamp || !webhookSignature) {
            console.error('[SECURITY] Webhook rejected: Missing required headers');
            await recordAttempt(clientIP, '/webhook/polar', false, env);
            return errorResponse("Unauthorized", 401);
        }

        // Reject old timestamps (prevent replay attacks, 5 min tolerance)
        const now = Math.floor(Date.now() / 1000);
        const ts = parseInt(webhookTimestamp, 10);
        if (isNaN(ts) || Math.abs(now - ts) > 300) {
            console.error('[SECURITY] Webhook rejected: Timestamp too old or invalid');
            await recordAttempt(clientIP, '/webhook/polar', false, env);
            return errorResponse("Unauthorized", 401);
        }

        const rawBody = await request.text();

        // Standard Webhooks: signed content = "{webhook-id}.{webhook-timestamp}.{body}"
        const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

        // Secret handling: Polar uses base64-encoded secrets with "whsec_" prefix
        let secretStr = env.POLAR_WEBHOOK_SECRET;
        if (secretStr.startsWith('whsec_')) {
            secretStr = secretStr.substring(6);
        }

        let secretBytes: BufferSource;
        try {
            secretBytes = Uint8Array.from(atob(secretStr), c => c.charCodeAt(0));
        } catch (e) {
            const encoder = new TextEncoder();
            secretBytes = encoder.encode(secretStr);
        }

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signatureBytes = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(signedContent)
        );
        const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

        // Standard Webhooks signature format: "v1,BASE64" (can have multiple space-separated sigs)
        const signatures = webhookSignature.split(' ');
        const sigResults = await Promise.all(signatures.map(async sig => {
            const parts = sig.split(',');
            if (parts.length !== 2 || parts[0] !== 'v1') return false;
            return await timingSafeStringEqual(parts[1], computedSignature);
        }));
        const isValid = sigResults.some(r => r);

        if (!isValid) {
            console.error('[SECURITY] Webhook signature verification failed');
            await recordAttempt(clientIP, '/webhook/polar', false, env);
            log(env, 'warn', 'webhook', 'webhook_sig_invalid', 'Polar webhook signature verification failed', { ip: clientIP }, ctx);
            return errorResponse("Invalid signature", 401);
        }

        const payload = JSON.parse(rawBody);

        if (!payload.data || !payload.type) {
            console.error('[SECURITY] Missing required webhook fields');
            await recordAttempt(clientIP, '/webhook/polar', false, env);
            return errorResponse("Invalid payload", 400);
        }

        const validEvents = [
            'order.created',
            'subscription.created',
            'subscription.canceled',
            'subscription.revoked',
            'order.refunded'
        ];

        // Explicitly ignore checkout events (they fire when checkout is opened, not completed)
        const ignoredEvents = ['checkout.created', 'checkout.updated'];
        if (ignoredEvents.includes(payload.type)) {
            console.log(`[INFO] Ignoring ${payload.type} event`);
            await recordAttempt(clientIP, '/webhook/polar', true, env);
            return jsonResponse({ status: 'ok', message: 'Event ignored' });
        }

        // order.created with subscription_id = renewal billing or trial first charge
        if (payload.type === 'order.created' && payload.data?.subscription_id) {
            return await handleSubscriptionRenewal(payload, clientIP, env, ctx);
        }

        if (!validEvents.includes(payload.type)) {
            console.log(`[INFO] Unknown event type: ${payload.type}`);
            await recordAttempt(clientIP, '/webhook/polar', true, env);
            return jsonResponse({ status: 'ignored', reason: 'Event type not relevant' });
        }

        const data = payload.data;
        const customerEmail = data.customer?.email || data.user_email || data.email;

        if (!customerEmail) {
            console.error('[ERROR] No customer email in webhook');
            return errorResponse("Missing customer email", 400);
        }

        // Handle cancellation/refund events
        const cancellationEvents = ['subscription.canceled', 'subscription.revoked', 'order.refunded'];
        if (cancellationEvents.includes(payload.type)) {
            const subscriptionId = data.id || data.subscription_id || data.order_id;

            if (!subscriptionId) {
                console.error('[ERROR] No subscription/order ID in cancellation webhook');
                await recordAttempt(clientIP, '/webhook/polar', false, env);
                return errorResponse("Missing subscription ID", 400);
            }

            const license = await env.DB.prepare(
                "SELECT * FROM licenses WHERE polar_subscription_id = ? AND is_active = 1 LIMIT 1"
            ).bind(subscriptionId).first<any>();

            if (!license) {
                console.log(`[INFO] No active license found for subscription ${subscriptionId}`);
                return jsonResponse({ status: 'no_license_found' });
            }

            const isSubscriptionCanceled = payload.type === 'subscription.canceled';
            const isRevokedOrRefunded = payload.type === 'subscription.revoked' || payload.type === 'order.refunded';

            if (isSubscriptionCanceled) {
                const existingInfo = JSON.parse(license.customer_info || '{}');
                existingInfo.canceled_at = new Date().toISOString();
                existingInfo.cancellation_reason = payload.type;
                existingInfo.will_cancel_at = license.expiry_date;

                await env.DB.prepare(
                    "UPDATE licenses SET customer_info = ? WHERE id = ?"
                ).bind(JSON.stringify(existingInfo), license.id).run();

                console.log(`[CANCELED] License ${license.license_key} marked as canceled. Active until ${license.expiry_date}`);
                log(env, 'info', 'webhook', 'license_canceled', 'License canceled: ' + license.license_key + ' active until ' + license.expiry_date, { ip: clientIP, license_key: license.license_key, data: { active_until: license.expiry_date } }, ctx);

                ctx.waitUntil(sendCancellationEmail(customerEmail, license.license_key, license.tier, license.expiry_date, env).catch(e => console.error('[EMAIL] Cancellation email failed:', e.message)));

                await recordAttempt(clientIP, '/webhook/polar', true, env);

                return jsonResponse({
                    status: 'canceled',
                    license_key: license.license_key,
                    active_until: license.expiry_date,
                    message: 'License remains active until expiry date'
                });
            }

            if (isRevokedOrRefunded) {
                await env.DB.prepare(
                    "UPDATE licenses SET is_active = 0 WHERE id = ?"
                ).bind(license.id).run();

                const existingInfo = JSON.parse(license.customer_info || '{}');
                existingInfo.revoked_at = new Date().toISOString();
                existingInfo.cancellation_reason = payload.type;

                await env.DB.prepare(
                    "UPDATE licenses SET customer_info = ? WHERE id = ?"
                ).bind(JSON.stringify(existingInfo), license.id).run();

                console.log(`[REVOKED] License ${license.license_key} immediately deactivated (reason: ${payload.type})`);
                log(env, 'warn', 'webhook', 'license_revoked', 'License revoked immediately: ' + license.license_key + ' reason=' + payload.type, { ip: clientIP, license_key: license.license_key, data: { reason: payload.type } }, ctx);

                // No cancellation email here — subscription.canceled already sent it when the user canceled.
                // Sending again on revoked would result in two identical emails.

                await recordAttempt(clientIP, '/webhook/polar', true, env);

                return jsonResponse({
                    status: 'revoked',
                    license_key: license.license_key,
                    message: 'License immediately deactivated'
                });
            }
        }

        // Handle creation events (order.created, subscription.created)
        const productName = data.product?.name || data.product_name;

        // TRIAL detection: product name contains "trial" OR metadata.trial is set
        // Polar stores metadata values as strings, so check both boolean true and string "true"
        const isTruthy = (v: any) => v === true || v === 'true';
        const metadataTrial = isTruthy(data.metadata?.trial) || isTruthy(data.subscription?.metadata?.trial);
        const nameTrial = (productName || '').toLowerCase().includes('trial');
        if (metadataTrial || nameTrial) {
            return await handleTrialOrder(payload, clientIP, env, ctx);
        }

        let tier = 'SUBSCRIPTION';
        let expiryDate: string | null = null;
        let seatLimit = 1;

        // Seat detection priority:
        // 1. metadata.seats (manual/custom deals)
        // 2. data.quantity (Polar seat-based subscription quantity field)
        // 3. Elite product ID matching (Standard=30, Max=200)
        // 4. Product name regex (legacy fallback)
        const metaSeats = data.metadata?.seats || data.subscription?.metadata?.seats;
        const polarQuantity = data.quantity || data.subscription?.quantity;

        if (metaSeats) {
            const parsed = parseInt(metaSeats, 10);
            if (!isNaN(parsed) && parsed > 0) seatLimit = parsed;
        } else if (polarQuantity) {
            const parsed = parseInt(String(polarQuantity), 10);
            if (!isNaN(parsed) && parsed > 0) seatLimit = parsed;
        } else {
            const productId: string = data.product?.id || data.product_id || '';
            if (productId && productId === (env.POLAR_PRODUCT_ELITE_STANDARD ?? '')) {
                seatLimit = parseInt(env.ELITE_STANDARD_SEATS ?? '30');
            } else if (productId && productId === (env.POLAR_PRODUCT_ELITE_MAX ?? '')) {
                seatLimit = parseInt(env.ELITE_MAX_SEATS ?? '200');
            } else if (/unlimited/i.test(productName || '')) {
                seatLimit = parseInt(env.UNLIMITED_SEATS ?? '999');
            } else {
                const seatMatch = productName?.match(/(\d+)\s*PC/i);
                if (seatMatch) {
                    const parsed = parseInt(seatMatch[1], 10);
                    if (!isNaN(parsed) && parsed > 0) seatLimit = parsed;
                }
            }
        }

        if (payload.type === 'subscription.created' || productName?.toLowerCase().includes('month') || productName?.toLowerCase().includes('year')) {
            tier = 'SUBSCRIPTION';
            const isYearly = productName?.toLowerCase().includes('year') || productName?.toLowerCase().includes('annual');
            const daysToAdd = isYearly ? parseInt(env.SUBSCRIPTION_YEARLY_DAYS ?? '365') : parseInt(env.SUBSCRIPTION_MONTHLY_DAYS ?? '30');
            const expiryTimestamp = new Date();
            expiryTimestamp.setDate(expiryTimestamp.getDate() + daysToAdd);
            expiryDate = expiryTimestamp.toISOString().split('T')[0];
        } else {
            tier = 'PERPETUAL';
            expiryDate = null;
        }

        // Idempotency check (prevent duplicate licenses)
        const eventId = payload.id || payload.data?.id || webhookId;
        if (eventId) {
            const existing = await env.DB.prepare(
                "SELECT * FROM licenses WHERE instr(customer_info, ?) > 0"
            ).bind(eventId).first<any>();

            if (existing) {
                console.log(`[IDEMPOTENCY] License already exists for webhook ${eventId}`);
                return jsonResponse({ status: 'already_processed', license_key: existing.license_key });
            }
        }

        // Generate license key with cryptographically secure random
        const keyBytes = crypto.getRandomValues(new Uint8Array(6));
        const licenseKey = 'GP-' + Array.from(keyBytes).map(b => b.toString(36).toUpperCase()).join('').substring(0, 8).padEnd(8, '0');

        // subscription_id stored so renewal order.created events can match this license
        const customerInfo = JSON.stringify({
            email: customerEmail,
            product: productName,
            webhook_id: eventId,
            subscription_id: data.id || '',
            source: 'polar',
            created_at: new Date().toISOString()
        });

        await env.DB.prepare(
            "INSERT INTO licenses (license_key, tier, seat_limit, expiry_date, customer_info, is_active, email, polar_subscription_id, polar_customer_id) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)"
        ).bind(licenseKey, tier, seatLimit, expiryDate, customerInfo, customerEmail, data.id || '', data.customer?.id || '').run();

        console.log(`[SUCCESS] Generated license ${licenseKey} for ${customerEmail}`);
        log(env, 'info', 'webhook', 'license_created', tier + ' license created: ' + licenseKey + ' for ' + customerEmail, { ip: clientIP, license_key: licenseKey, data: { tier, seats: seatLimit, email: customerEmail, expiry: expiryDate } }, ctx);

        // Emails fire in background — license is already in DB, response returns to Polar immediately
        const newLicenseRows: [string, string][] = [
            ['License Key', licenseKey],
            ['Customer', customerEmail],
            ['Tier', tier === 'PERPETUAL' ? 'Elite' : 'Pro'],
            ['Seats', String(seatLimit)]
        ];
        if (expiryDate) newLicenseRows.push(['Expires', expiryDate]);
        ctx.waitUntil(Promise.all([
            sendLicenseEmail(customerEmail, licenseKey, tier, expiryDate, env, seatLimit)
                .then(sent => { if (!sent) console.error('[WARNING] License email failed to send, but license was created'); })
                .catch(e => console.error('[EMAIL] License email failed:', e.message)),
            sendAdminAlert('New ' + (tier === 'PERPETUAL' ? 'Elite' : 'Pro') + ' License', 'A new license was purchased.', newLicenseRows, env)
                .catch(e => console.error('[EMAIL] Admin alert failed:', e.message)),
        ]));

        await recordAttempt(clientIP, '/webhook/polar', true, env);

        return jsonResponse({ status: 'success' });

    } catch (error: any) {
        console.error('[ERROR] Webhook handler failed:', error.message);
        log(env, 'error', 'webhook', 'webhook_error', 'Polar webhook handler threw: ' + error.message, { ip: clientIP }, ctx);
        return errorResponse("Internal server error", 500);
    }
}

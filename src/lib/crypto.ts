import { Env } from '../types';

export async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', crypto.getRandomValues(new Uint8Array(32)),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const [macA, macB] = await Promise.all([
        crypto.subtle.sign('HMAC', key, enc.encode(a)),
        crypto.subtle.sign('HMAC', key, enc.encode(b))
    ]);
    const a32 = new Uint8Array(macA);
    const b32 = new Uint8Array(macB);
    let diff = 0;
    for (let i = 0; i < 32; i++) diff |= a32[i] ^ b32[i];
    return diff === 0;
}

function b64url(buf: ArrayBuffer): string {
    let b = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
    return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generateDownloadToken(filename: string, env: Env): Promise<string> {
    const ttlMs = parseInt(env.DOWNLOAD_TOKEN_TTL_MINUTES ?? '15') * 60 * 1000;
    const payload = JSON.stringify({ f: filename, exp: Date.now() + ttlMs });
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(env.SIGNING_KEY),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const payloadB64 = b64url(enc.encode(payload).buffer as ArrayBuffer);
    const sigB64 = b64url(sig);
    return payloadB64 + '.' + sigB64;
}

export async function verifyDownloadToken(token: string, filename: string, env: Env): Promise<boolean> {
    try {
        const dot = token.lastIndexOf('.');
        if (dot < 0) return false;
        const payloadB64 = token.substring(0, dot);
        const sigB64 = token.substring(dot + 1);

        const pad = (s: string) => s + '='.repeat((4 - s.length % 4) % 4);
        const payload = atob(pad(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

        const data = JSON.parse(payload);
        if (Date.now() > data.exp) return false;
        if (data.f !== filename) return false;

        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(env.SIGNING_KEY),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const expectedSig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));

        return await timingSafeStringEqual(sigB64, expectedSig);
    } catch (_) {
        return false;
    }
}

export async function computeHMAC(hwId: string, type: string, expiry: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(`${hwId}${type}${expiry}`));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

import { Env } from '../../types';
import { timingSafeStringEqual } from '../../lib/crypto';

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const LOGIN_PAGE = (error: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GamePinned | Admin Login</title>
    <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0a0a;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden;
        }
        body::before {
            content: '';
            position: fixed;
            inset: 0;
            background-image:
                linear-gradient(rgba(255,75,75,0.035) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,75,75,0.035) 1px, transparent 1px);
            background-size: 52px 52px;
            pointer-events: none;
        }
        body::after {
            content: '';
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -60%);
            width: 700px;
            height: 700px;
            background: radial-gradient(circle, rgba(255,75,75,0.06) 0%, transparent 65%);
            pointer-events: none;
        }
        .wrap {
            width: 320px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 28px;
            position: relative;
            z-index: 1;
        }
        .logo img {
            width: 120px;
            height: 120px;
        }
        form {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .err {
            display: ${error ? 'flex' : 'none'};
            align-items: center;
            gap: 8px;
            background: rgba(255,75,75,0.08);
            border: 1px solid rgba(255,75,75,0.2);
            border-radius: 10px;
            padding: 10px 13px;
            color: #FF8A80;
            font-size: 0.82rem;
        }
        .err svg { width: 13px; height: 13px; flex-shrink: 0; }
        input[type="password"] {
            width: 100%;
            padding: 13px 16px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.09);
            border-radius: 12px;
            color: #fff;
            font-family: inherit;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.15s, background 0.15s;
            letter-spacing: 0.1em;
            text-align: center;
        }
        input[type="password"]:focus {
            border-color: rgba(255,75,75,0.5);
            background: rgba(255,255,255,0.06);
        }
        input[type="password"]::placeholder { letter-spacing: 0; color: rgba(255,255,255,0.2); font-size: 0.9rem; }
        button {
            width: 100%;
            padding: 13px;
            background: #FF4B4B;
            border: none;
            border-radius: 12px;
            color: #fff;
            font-family: inherit;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
            box-shadow: 0 4px 24px rgba(255,75,75,0.3);
            letter-spacing: 0.01em;
        }
        button:hover { background: #e63c3c; box-shadow: 0 6px 28px rgba(255,75,75,0.4); }
        button:active { transform: translateY(1px); }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="logo">
            <img src="/logo.apng" alt="">
        </div>
        <form method="POST" action="/admin/login">
            <div class="err">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                ${escHtml(error)}
            </div>
            <input type="password" name="token" placeholder="Token" autofocus autocomplete="current-password">
            <button type="submit">Yeah, it's me. Let me in.</button>
        </form>
    </div>
</body>
</html>`;

export async function serveAdmin(request: Request, env: Env): Promise<Response> {
    const sessionToken = request.headers.get('Cookie')?.match(/gp_session=([^;]+)/)?.[1];
    const isAuthenticated = sessionToken ? await timingSafeStringEqual(sessionToken, env.ADMIN_TOKEN) : false;

    if (!isAuthenticated) {
        return new Response(LOGIN_PAGE(''), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    const asset = await env.ASSETS.fetch(new Request('http://dummy/admin.html'));
    return new Response(asset.body, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}

export async function serveStatusAdmin(request: Request, env: Env): Promise<Response> {
    const sessionToken = request.headers.get('Cookie')?.match(/gp_session=([^;]+)/)?.[1];
    const isAuthenticated = sessionToken ? await timingSafeStringEqual(sessionToken, env.ADMIN_TOKEN) : false;

    if (!isAuthenticated) {
        return new Response(null, { status: 302, headers: { 'Location': '/admin/login' } });
    }

    const asset = await env.ASSETS.fetch(new Request('http://dummy/status-admin.html'));
    return new Response(asset.body, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
export function secureHeaders(headers: Headers = new Headers()): Headers {
    headers.set("Content-Type", "application/json");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Allow-Credentials", "false");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-XSS-Protection", "1; mode=block");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline' 'self' https://cdn.jsdelivr.net; style-src 'unsafe-inline' 'self';");
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return headers;
}

export function jsonResponse(data: any, status: number = 200, extraHeaders?: HeadersInit): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: secureHeaders(new Headers(extraHeaders))
    });
}

export function errorResponse(message: string, code: number): Response {
    return jsonResponse({ status: "error", message }, code);
}

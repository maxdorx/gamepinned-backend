export class RequestBodyTooLargeError extends Error {
    constructor() {
        super('Request body is too large');
        this.name = 'RequestBodyTooLargeError';
    }
}

/**
 * Parse JSON while enforcing a byte limit even when Content-Length is absent
 * or inaccurate. Public endpoints use this before touching D1 or R2.
 */
export async function parseJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
    const declaredLength = request.headers.get('Content-Length');
    if (declaredLength !== null) {
        const parsedLength = Number(declaredLength);
        if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
            throw new RequestBodyTooLargeError();
        }
    }

    if (!request.body) throw new SyntaxError('Missing request body');

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new RequestBodyTooLargeError();
        }
        chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTextCapped = exports.fetchPublicUrl = exports.assertPublicHttpUrl = void 0;
const promises_1 = require("dns/promises");
const net_1 = require("net");
/**
 * SSRF guard for user-supplied URLs (calendar sources, grant extraction,
 * webhook registration). Blocks private/reserved address space and
 * link-local metadata hosts, and validates every redirect hop.
 *
 * Local development (ALLOW_LOCAL_ONLY_FUNCTIONS=true) skips the private-range
 * checks so emulator-hosted fixtures on localhost keep working.
 */
const PRIVATE_V4 = [
    /^0\./,
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
];
const isPrivateIp = (ip) => {
    if ((0, net_1.isIP)(ip) === 6) {
        const lower = ip.toLowerCase();
        return (lower === '::' ||
            lower === '::1' ||
            lower.startsWith('fe80:') ||
            lower.startsWith('fc') ||
            lower.startsWith('fd') ||
            lower.startsWith('::ffff:'));
    }
    return PRIVATE_V4.some((re) => re.test(ip));
};
const localOnlyMode = () => process.env.ALLOW_LOCAL_ONLY_FUNCTIONS === 'true';
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost'];
const assertPublicHttpUrl = async (rawUrl, opts) => {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new Error('Invalid URL');
    }
    const allowedProtocols = opts?.httpsOnly ? ['https:'] : ['http:', 'https:'];
    if (!allowedProtocols.includes(url.protocol)) {
        throw new Error(`URL must use ${opts?.httpsOnly ? 'https' : 'http(s)'}`);
    }
    if (localOnlyMode())
        return url;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' ||
        host === 'metadata.google.internal' ||
        BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
        throw new Error('URL host is not allowed');
    }
    if ((0, net_1.isIP)(host)) {
        if (isPrivateIp(host))
            throw new Error('URL host is not allowed');
        return url;
    }
    try {
        const addresses = await (0, promises_1.lookup)(host, { all: true });
        if (addresses.some((a) => isPrivateIp(a.address))) {
            throw new Error('URL host resolves to a private address');
        }
    }
    catch (err) {
        if (err instanceof Error && err.message.includes('private address'))
            throw err;
        // Plain DNS failures fall through — fetch will fail with a clearer error.
    }
    return url;
};
exports.assertPublicHttpUrl = assertPublicHttpUrl;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/**
 * fetch() with SSRF validation on the initial URL and every redirect hop,
 * plus a hard timeout. Callers should also cap how much of the body they read.
 */
const fetchPublicUrl = async (rawUrl, init, opts) => {
    const maxRedirects = opts?.maxRedirects ?? 3;
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const url = await (0, exports.assertPublicHttpUrl)(current, opts);
        const res = await fetch(url.toString(), {
            ...init,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (REDIRECT_STATUSES.has(res.status)) {
            const location = res.headers.get('location');
            if (!location)
                throw new Error(`Redirect (${res.status}) without a Location header`);
            current = new URL(location, url).toString();
            continue;
        }
        return res;
    }
    throw new Error('Too many redirects');
};
exports.fetchPublicUrl = fetchPublicUrl;
/** Read a response body as text, refusing anything over maxBytes. */
const readTextCapped = async (res, maxBytes = 2_000_000) => {
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes)
        throw new Error(`Response too large (${declared} bytes)`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes)
        throw new Error(`Response too large (${buf.byteLength} bytes)`);
    return buf.toString('utf8');
};
exports.readTextCapped = readTextCapped;

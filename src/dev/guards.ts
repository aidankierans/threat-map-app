import { timingSafeEqual } from "node:crypto";
export interface RequestFacts {
    remoteAddress?: string;
    host?: string;
    origin?: string;
    secFetchSite?: string;
    token?: string;
}
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export function isLoopbackAddress(addr: string | undefined): boolean {
    return addr !== undefined && LOOPBACK.has(addr);
}
function hostnameOf(value: string | undefined): string | null {
    if (!value)
        return null;
    try {
        const url = value.includes("://") ? new URL(value) : new URL(`http://${value}`);
        return url.hostname;
    }
    catch {
        return null;
    }
}
function isLocalHostname(value: string | undefined): boolean {
    const name = hostnameOf(value);
    return name !== null && LOCAL_HOSTNAMES.has(name);
}
export function tokensMatch(presented: string | undefined, expected: string): boolean {
    if (!presented)
        return false;
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}
export function rejectReason(facts: RequestFacts, expectedToken: string, options: {
    requireToken?: boolean;
} = {}): string | null {
    if (!isLoopbackAddress(facts.remoteAddress))
        return "not a loopback connection";
    if (!isLocalHostname(facts.host))
        return "host is not local (DNS rebinding?)";
    if (facts.origin !== undefined && !isLocalHostname(facts.origin))
        return "foreign origin";
    if (facts.secFetchSite !== undefined && facts.secFetchSite !== "same-origin") {
        return "cross-site request";
    }
    if ((options.requireToken ?? true) && !tokensMatch(facts.token, expectedToken)) {
        return "missing or wrong editor token";
    }
    return null;
}

/**
 * The rejection matrix for the /__editor endpoints. Every row that must be
 * turned away, is; the one legitimate caller — the same-origin page on a
 * loopback connection presenting the token — gets through.
 */

import { describe, expect, it } from "vitest";
import { isLoopbackAddress, rejectReason, tokensMatch, type RequestFacts } from "./guards.js";

const TOKEN = "e1c1a6a2-24d5-4308-a205-9d3ad9906a9f";

/** A legitimate same-origin fetch from the dev page. */
const good: RequestFacts = {
  remoteAddress: "127.0.0.1",
  host: "localhost:5173",
  origin: "http://localhost:5173",
  secFetchSite: "same-origin",
  token: TOKEN,
};

describe("rejectReason", () => {
  it("admits the legitimate caller", () => {
    expect(rejectReason(good, TOKEN)).toBeNull();
  });

  it("admits curl from the same machine (no browser headers at all)", () => {
    expect(
      rejectReason({ remoteAddress: "::1", host: "localhost:5173", token: TOKEN }, TOKEN),
    ).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(rejectReason({ ...good, token: undefined }, TOKEN)).toMatch(/token/);
  });

  it("rejects a wrong token", () => {
    expect(rejectReason({ ...good, token: "wrong" }, TOKEN)).toMatch(/token/);
  });

  it("can exempt the token handout itself, other guards intact", () => {
    expect(rejectReason({ ...good, token: undefined }, TOKEN, { requireToken: false })).toBeNull();
    expect(
      rejectReason({ ...good, token: undefined, remoteAddress: "10.0.0.9" }, TOKEN, {
        requireToken: false,
      }),
    ).toMatch(/loopback/);
  });

  it("rejects a LAN peer even with the right token", () => {
    expect(rejectReason({ ...good, remoteAddress: "192.168.1.20" }, TOKEN)).toMatch(/loopback/);
    expect(rejectReason({ ...good, remoteAddress: undefined }, TOKEN)).toMatch(/loopback/);
  });

  it("rejects a rebound Host header", () => {
    expect(rejectReason({ ...good, host: "evil.example:5173" }, TOKEN)).toMatch(/host/i);
    expect(rejectReason({ ...good, host: undefined }, TOKEN)).toMatch(/host/i);
  });

  it("rejects a foreign Origin", () => {
    expect(rejectReason({ ...good, origin: "https://evil.example" }, TOKEN)).toMatch(/origin/);
  });

  it("rejects a cross-site fetch", () => {
    expect(rejectReason({ ...good, secFetchSite: "cross-site" }, TOKEN)).toMatch(/cross-site/);
    expect(rejectReason({ ...good, secFetchSite: "same-site" }, TOKEN)).toMatch(/cross-site/);
    expect(rejectReason({ ...good, secFetchSite: "none" }, TOKEN)).toMatch(/cross-site/);
  });

  it("accepts IPv6 and IPv4-mapped loopback, and 127.0.0.1 as Host", () => {
    expect(rejectReason({ ...good, remoteAddress: "::ffff:127.0.0.1" }, TOKEN)).toBeNull();
    expect(
      rejectReason({ ...good, host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" }, TOKEN),
    ).toBeNull();
  });
});

describe("primitives", () => {
  it("isLoopbackAddress covers exactly the loopback forms", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.0.0.2")).toBe(false);
    expect(isLoopbackAddress("0.0.0.0")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it("tokensMatch requires exact equality and tolerates length skew", () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(tokensMatch(TOKEN + "x", TOKEN)).toBe(false);
    expect(tokensMatch(undefined, TOKEN)).toBe(false);
    expect(tokensMatch("", TOKEN)).toBe(false);
  });
});

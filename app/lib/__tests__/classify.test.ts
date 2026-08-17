import { describe, it, expect } from "vitest";
import { extractCfMetadata, classifyNodeError, classifyEdgeError } from "../classify";

describe("extractCfMetadata", () => {
  it("extracts ray and colo from cf-ray header", () => {
    const headers = { "cf-ray": "8a1b2c3d4e5f-IAD" };
    expect(extractCfMetadata(headers)).toEqual({
      ray: "8a1b2c3d4e5f-IAD",
      colo: "IAD",
      mitigated: null,
    });
  });

  it("returns null when cf-ray header is missing", () => {
    expect(extractCfMetadata({})).toEqual({ ray: null, colo: null, mitigated: null });
  });

  it("handles cf-ray with no dash", () => {
    const headers = { "cf-ray": "abc123" };
    expect(extractCfMetadata(headers)).toEqual({
      ray: "abc123",
      colo: null,
      mitigated: null,
    });
  });

  it("extracts cf-mitigated header when present", () => {
    const headers = { "cf-ray": "abc-IAD", "cf-mitigated": "challenge" };
    expect(extractCfMetadata(headers)).toEqual({
      ray: "abc-IAD",
      colo: "IAD",
      mitigated: "challenge",
    });
  });

  it("returns cf-mitigated even without cf-ray", () => {
    const headers = { "cf-mitigated": "managed" };
    expect(extractCfMetadata(headers)).toEqual({
      ray: null,
      colo: null,
      mitigated: "managed",
    });
  });
});

describe("classifyNodeError", () => {
  it("classifies ECONNRESET before response as connect", () => {
    const err = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    const result = classifyNodeError(err, { gotResponse: false, gotSocket: true, gotSecureConnect: false });
    expect(result).toEqual({ code: "ECONNRESET", message: "socket hang up", phase: "connect" });
  });

  it("classifies ECONNRESET after request sent as request", () => {
    const err = Object.assign(new Error("reset"), { code: "ECONNRESET" });
    const result = classifyNodeError(err, { gotResponse: false, gotSocket: true, gotSecureConnect: true });
    expect(result).toEqual({ code: "ECONNRESET", message: "reset", phase: "request" });
  });

  it("classifies ECONNRESET during response as response", () => {
    const err = Object.assign(new Error("reset"), { code: "ECONNRESET" });
    const result = classifyNodeError(err, { gotResponse: true, gotSocket: true, gotSecureConnect: true });
    expect(result).toEqual({ code: "ECONNRESET", message: "reset", phase: "response" });
  });

  it("classifies ENOTFOUND as dns", () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    const result = classifyNodeError(err, { gotResponse: false, gotSocket: false, gotSecureConnect: false });
    expect(result).toEqual({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND", phase: "dns" });
  });

  it("classifies ETIMEDOUT as connect", () => {
    const err = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    const result = classifyNodeError(err, { gotResponse: false, gotSocket: true, gotSecureConnect: false });
    expect(result).toEqual({ code: "ETIMEDOUT", message: "timeout", phase: "connect" });
  });

  it("classifies ERR_TLS_ errors as tls", () => {
    const err = Object.assign(new Error("tls error"), { code: "ERR_TLS_CERT_ALTNAME_INVALID" });
    const result = classifyNodeError(err, { gotResponse: false, gotSocket: true, gotSecureConnect: false });
    expect(result).toEqual({ code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "tls error", phase: "tls" });
  });

  it("classifies unknown errors as unknown", () => {
    const err = new Error("something weird");
    const result = classifyNodeError(err, { gotResponse: false, gotSocket: false, gotSecureConnect: false });
    expect(result).toEqual({ code: "UNKNOWN", message: "something weird", phase: "unknown" });
  });
});

describe("classifyEdgeError", () => {
  it("classifies error with cause.code ECONNRESET", () => {
    const err = Object.assign(new Error("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    const result = classifyEdgeError(err);
    expect(result).toEqual({ code: "ECONNRESET", message: "fetch failed", phase: "connect" });
  });

  it("classifies error with cause.code ETIMEDOUT", () => {
    const err = Object.assign(new Error("fetch failed"), {
      cause: { code: "ETIMEDOUT" },
    });
    const result = classifyEdgeError(err);
    expect(result).toEqual({ code: "ETIMEDOUT", message: "fetch failed", phase: "connect" });
  });

  it("falls back to message matching for fetch failed", () => {
    const err = new Error("fetch failed") as Error & { cause?: { code?: string } };
    const result = classifyEdgeError(err);
    expect(result).toEqual({ code: "FETCH_FAILED", message: "fetch failed", phase: "unknown" });
  });

  it("matches network in message", () => {
    const err = new Error("network error occurred") as Error & { cause?: { code?: string } };
    const result = classifyEdgeError(err);
    expect(result).toEqual({ code: "NETWORK_ERROR", message: "network error occurred", phase: "connect" });
  });

  it("falls back to UNKNOWN", () => {
    const err = new Error("something else") as Error & { cause?: { code?: string } };
    const result = classifyEdgeError(err);
    expect(result).toEqual({ code: "UNKNOWN", message: "something else", phase: "unknown" });
  });
});

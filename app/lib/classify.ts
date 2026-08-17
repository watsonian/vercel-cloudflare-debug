import type { ErrorPhase } from "./types";

interface ClassifiedError {
  code: string;
  message: string;
  phase: ErrorPhase;
}

export function extractCfMetadata(headers: Record<string, string>): {
  ray: string | null;
  colo: string | null;
  mitigated: string | null;
} {
  const ray = headers["cf-ray"] ?? null;
  const mitigated = headers["cf-mitigated"] ?? null;
  if (!ray) return { ray: null, colo: null, mitigated };

  const lastDash = ray.lastIndexOf("-");
  const colo = lastDash !== -1 ? ray.slice(lastDash + 1) : null;

  return { ray, colo, mitigated };
}

interface NodeErrorContext {
  gotResponse: boolean;
  gotSocket: boolean;
  gotSecureConnect: boolean;
}

export function classifyNodeError(
  err: Error & { code?: string },
  ctx: NodeErrorContext
): ClassifiedError {
  const code = err.code ?? "UNKNOWN";
  const message = err.message;

  let phase: ErrorPhase = "unknown";

  if (code === "ENOTFOUND") {
    phase = "dns";
  } else if (code === "ECONNREFUSED") {
    phase = "connect";
  } else if (code === "ECONNRESET") {
    if (ctx.gotResponse) {
      phase = "response";
    } else if (ctx.gotSecureConnect) {
      phase = "request";
    } else {
      phase = "connect";
    }
  } else if (code.startsWith("ERR_TLS_") || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    phase = "tls";
  } else if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    phase = "connect";
  } else if (code === "UND_ERR_BODY_TIMEOUT") {
    phase = "response";
  }

  return { code, message, phase };
}

export function classifyEdgeError(err: Error & { cause?: { code?: string } }): ClassifiedError {
  const message = err.message;
  const causeCode = err.cause?.code;

  if (causeCode === "ECONNRESET") {
    return { code: "ECONNRESET", message, phase: "connect" };
  }
  if (causeCode === "ECONNREFUSED") {
    return { code: "ECONNREFUSED", message, phase: "connect" };
  }
  if (causeCode === "ETIMEDOUT") {
    return { code: "ETIMEDOUT", message, phase: "connect" };
  }

  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("fetch failed")) {
    return { code: "FETCH_FAILED", message, phase: "unknown" };
  }
  if (lower.includes("network")) {
    return { code: "NETWORK_ERROR", message, phase: "connect" };
  }

  return { code: "UNKNOWN", message, phase: "unknown" };
}

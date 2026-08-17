import { hostname } from "node:os";

const EGRESS_IP_URL = "https://checkip.amazonaws.com";
const EGRESS_IP_TIMEOUT = 3000;

async function fetchEgressIp(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EGRESS_IP_TIMEOUT);
    const res = await fetch(EGRESS_IP_URL, { signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    return text.trim();
  } catch {
    return null;
  }
}

export async function getVercelMeta(
  requestHeaders: Headers,
  options: { egressIp: boolean }
) {
  return {
    region: process.env.VERCEL_REGION ?? null,
    requestId: requestHeaders.get("x-vercel-id") ?? null,
    hostname: hostname(),
    egressIp: options.egressIp ? await fetchEgressIp() : null,
  };
}

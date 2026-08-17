import { createHmac } from "node:crypto";

const COOKIE_NAME = "probe-auth";
const HMAC_MESSAGE = "probe-authenticated";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function computeToken(password: string): string {
  return createHmac("sha256", password).update(HMAC_MESSAGE).digest("hex");
}

export function isValidToken(token: string): boolean {
  const password = process.env.PROBE_PASSWORD;
  if (!password) return true;
  return token === computeToken(password);
}

export function makeSetCookieHeader(): string {
  const password = process.env.PROBE_PASSWORD!;
  const token = computeToken(password);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function makeClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME };

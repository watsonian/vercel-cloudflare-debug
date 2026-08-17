import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { makeSetCookieHeader, makeClearCookieHeader } from "@/app/lib/auth";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  const password = process.env.PROBE_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "PROBE_PASSWORD not configured" }, { status: 500 });
  }

  const body = await request.json();
  const input = typeof body.password === "string" ? body.password : "";
  if (!constantTimeEqual(input, password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", makeSetCookieHeader());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", makeClearCookieHeader());
  return res;
}

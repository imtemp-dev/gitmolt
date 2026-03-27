import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const rateLimit = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/v1")) {
    return NextResponse.next();
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();

  let entry = rateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimit.set(ip, entry);
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return NextResponse.json(
      { ok: false, error: "Rate limited. Try again later." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/v1/:path*",
};

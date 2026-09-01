import { NextResponse } from "next/server";

// Simple in-memory rate limiter (resets on deploy)
const requests = new Map<string, number[]>();

function isRateLimited(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const window = requests.get(ip) || [];
  const recent = window.filter((t) => now - t < windowMs);
  requests.set(ip, recent);
  if (recent.length >= limit) return true;
  recent.push(now);
  return false;
}

function rateLimit(request: Request, limit: number, windowMs: number): Response | null {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(ip, limit, windowMs)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }
  return null;
}

export const rateLimiters = {
  connect: (request: Request) => rateLimit(request, 10, 60000), // 10/min
  write: (request: Request) => rateLimit(request, 30, 60000),   // 30/min
  status: (request: Request) => rateLimit(request, 60, 60000),  // 60/min
};

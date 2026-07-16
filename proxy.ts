import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (!verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    response.cookies.set(SESSION_COOKIE, signSession(randomUUID()), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "margin_reader_session";
const DEMO_SESSION = "00000000-0000-4000-8000-000000000001";

function secret() { return process.env.SESSION_SECRET ?? "margin-reader-development-secret-change-me"; }
export function signSession(id: string) { return `${id}.${createHmac("sha256", secret()).update(id).digest("base64url")}`; }
export function verifySession(value?: string) {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;
  const expected = createHmac("sha256", secret()).update(id).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
export async function getSessionId() { return verifySession((await cookies()).get(SESSION_COOKIE)?.value) ?? DEMO_SESSION; }

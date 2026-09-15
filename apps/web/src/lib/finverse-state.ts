import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@finance-app/db";

export const FINVERSE_CALLBACK_PATH = "/finverse-oauth-callback";
export const FINVERSE_STATE_COOKIE = "finverse-link-state";
export const FINVERSE_RESPONSE_COOKIE = "finverse-link-response";
export const finverseCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: FINVERSE_CALLBACK_PATH, maxAge: 600 };
const hash = (state: string) => createHash("sha256").update(state).digest("hex");

// Hashing first fixes both digests at the same 64-byte length so
// timingSafeEqual never throws on a length mismatch, and comparing the
// digests (not the raw values) in constant time closes the byte-by-byte
// short-circuit a plain !== leaves open on this CSRF cookie-binding check.
function statesMatch(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}

export async function createFinverseState(userId: string): Promise<string> {
  const state = randomUUID();
  await prisma.oAuthLinkAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  await prisma.oAuthLinkAttempt.create({ data: { userId, stateHash: hash(state), expiresAt: new Date(Date.now() + 600_000) } });
  (await cookies()).set(FINVERSE_STATE_COOKIE, state, finverseCookieOptions);
  return state;
}

export async function consumeFinverseState(userId: string, state: string): Promise<void> {
  const jar = await cookies();
  const expected = jar.get(FINVERSE_STATE_COOKIE)?.value;
  if (!state || !expected || !statesMatch(state, expected)) throw new Error("Invalid Finverse state");
  const consumed = await prisma.oAuthLinkAttempt.deleteMany({
    where: { stateHash: hash(state), userId, expiresAt: { gt: new Date() } },
  });
  if (consumed.count !== 1) throw new Error("Expired or already used Finverse state");
  jar.set(FINVERSE_STATE_COOKIE, "", { ...finverseCookieOptions, maxAge: 0 });
}

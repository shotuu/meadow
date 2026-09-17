import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { linkFinverseConnection } from "@finance-app/finverse-sync";
import { requireUserId } from "@/lib/session";
import { consumeFinverseState, FINVERSE_CALLBACK_PATH, FINVERSE_RESPONSE_COOKIE, finverseCookieOptions } from "@/lib/finverse-state";
import { revalidateHomeSurfaces } from "@/lib/revalidate";

function baseUrl(): string {
  if (!process.env.AUTH_URL) throw new Error("AUTH_URL must be set");
  return process.env.AUTH_URL;
}

/** Relay form_post to a same-site GET so Lax session/state cookies are available. */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const code = form.get("code"), state = form.get("state");
  if (typeof code !== "string" || !code || code.length > 2048 || typeof state !== "string" || state.length > 128 || !state) {
    return NextResponse.redirect(new URL("/accounts?finverse=error", baseUrl()), 303);
  }
  const response = NextResponse.redirect(new URL(FINVERSE_CALLBACK_PATH, baseUrl()), 303);
  response.cookies.set(FINVERSE_RESPONSE_COOKIE, JSON.stringify({ code, state }), { ...finverseCookieOptions, maxAge: 60 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(): Promise<Response> {
  const userId = await requireUserId();
  const jar = await cookies();
  const payload = jar.get(FINVERSE_RESPONSE_COOKIE)?.value;
  jar.set(FINVERSE_RESPONSE_COOKIE, "", { ...finverseCookieOptions, maxAge: 0 });
  let result = "error";
  try {
    const { code, state } = JSON.parse(payload ?? "{}");
    if (typeof code !== "string" || !code || typeof state !== "string") throw new Error("Missing callback response");
    await consumeFinverseState(userId, state);
    await linkFinverseConnection(userId, code, new URL(FINVERSE_CALLBACK_PATH, baseUrl()).toString());
    for (const path of ["/accounts", "/transactions"]) revalidatePath(path);
    revalidateHomeSurfaces();
    result = "success";
  } catch {
    // Provider errors may contain tokens; keep the callback log free of response payloads.
    console.error("[finverse-oauth-callback] linking failed");
  }
  const response = NextResponse.redirect(new URL(`/accounts?finverse=${result}`, baseUrl()), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

import { NextResponse } from "next/server";
import { completeFinverseLink } from "../accounts/finverse-actions";

/**
 * Finverse Link's response_mode "form_post" means the browser comes back
 * here via a POSTed form (code/state as form fields), not a query string
 * -- unlike Plaid's OAuth callback, which is a page component reading
 * searchParams. completeFinverseLink re-derives the authenticated user
 * itself (requireUserId), so this route doesn't need its own auth check.
 */
export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const code = formData.get("code");
  const url = new URL(request.url);

  if (typeof code !== "string" || !code) {
    return NextResponse.redirect(new URL("/accounts?finverse=error", url), 303);
  }

  try {
    await completeFinverseLink(code);
    return NextResponse.redirect(new URL("/accounts?finverse=success", url), 303);
  } catch (err) {
    console.error("[finverse-oauth-callback] linking failed", err);
    return NextResponse.redirect(new URL("/accounts?finverse=error", url), 303);
  }
}

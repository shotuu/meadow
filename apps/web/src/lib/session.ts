import "server-only";
import { redirect } from "next/navigation";
import { auth } from "../../auth";

/**
 * The single source of truth for "who is making this request" inside a
 * server action / route handler / server component data-fetch. Proxy
 * redirects unauthenticated *page views*, but per Next.js 16's own guidance
 * a routing change can silently drop Proxy coverage — so every mutation and
 * query must independently re-check this and scope by the returned id.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  return session.user.id;
}

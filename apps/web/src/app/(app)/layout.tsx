import { redirect } from "next/navigation";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { DesktopNav, MobileTabbar } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();

  const categoryCount = await prisma.category.count({ where: { userId } });
  if (categoryCount === 0) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DesktopNav />
      {/* pb-20 clears MobileTabbar's own height; the env() term adds back
          the safe-area inset MobileTabbar now reserves for itself (see
          app-nav.tsx), so page content's last row is never tucked behind
          the home-indicator-clearance padding on notched devices. */}
      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      <MobileTabbar />
    </div>
  );
}

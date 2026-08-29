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
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <MobileTabbar />
    </div>
  );
}

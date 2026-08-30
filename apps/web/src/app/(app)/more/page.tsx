import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { MORE_NAV_ITEMS } from "@/lib/nav-items";

export default async function MorePage() {
  await requireUserId();

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">More</h1>
      <Card>
        <CardContent className="divide-y p-0">
          {MORE_NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground" />
                {label}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

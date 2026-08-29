import type { LucideIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Alert className="flex flex-col items-center gap-2 border-dashed py-8 text-center [&>svg]:static [&>svg]:mb-1 [&>svg]:size-6!">
      <Icon className="text-muted-foreground" />
      <AlertTitle className="text-base">{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {action && <div className="mt-2">{action}</div>}
    </Alert>
  );
}

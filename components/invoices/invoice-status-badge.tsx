import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";

type Props = {
  status: InvoiceStatus;
  className?: string;
};

function resolveVariant(status: InvoiceStatus) {
  switch (status) {
    case "PAID":
      return "secondary" as const;
    case "OVERDUE":
      return "destructive" as const;
    case "SENT":
      return "outline" as const;
    default:
      return "default" as const;
  }
}

export function InvoiceStatusBadge({ status, className }: Props) {
  return (
    <Badge
      variant={resolveVariant(status)}
      className={cn(
        status === "PAID" && "border-cyan/30 bg-cyan/10 text-cyan",
        status === "SENT" && "border-blue/30 text-blue",
        status === "DRAFT" && "bg-white/10 text-white",
        className
      )}
    >
      {status}
    </Badge>
  );
}

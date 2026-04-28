type StatusBadgeProps = {
  status: "ok" | "warning" | "error";
  label?: string;
};

const STATUS_CLASSES = {
  ok: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  warning: "bg-yellow-400/10 text-yellow-200 ring-yellow-400/20",
  error: "bg-red-400/10 text-red-300 ring-red-400/20",
} satisfies Record<StatusBadgeProps["status"], string>;

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ${STATUS_CLASSES[status]}`}
    >
      {label ?? status}
    </span>
  );
}

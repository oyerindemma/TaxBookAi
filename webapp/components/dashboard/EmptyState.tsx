"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  actionHref?: string;
};

export default function EmptyState({
  title,
  description,
  actionText,
  onAction,
  actionHref,
}: EmptyStateProps) {
  const actionClassName =
    "mt-5 inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#06111f] transition-all duration-200 hover:bg-cyan-300 hover:shadow-lg hover:shadow-cyan-950/30";

  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-[#0B0F1A] px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-gray-800 bg-white/[0.03] text-gray-400">
        <Inbox className="size-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">{description}</p>

      {actionText && actionHref ? (
        <Link href={actionHref} className={actionClassName}>
          {actionText}
        </Link>
      ) : actionText ? (
        <button type="button" onClick={onAction} className={actionClassName}>
          {actionText}
        </button>
      ) : null}
    </div>
  );
}

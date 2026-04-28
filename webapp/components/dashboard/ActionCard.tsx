"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

type ActionCardProps = {
  title: string;
  description: string;
  buttonText: string;
  onClick?: () => void;
  href?: string;
  meta?: string;
  primary?: boolean;
};

export default function ActionCard({
  title,
  description,
  buttonText,
  onClick,
  href,
  meta,
  primary = false,
}: ActionCardProps) {
  const buttonClassName =
    "mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200";
  const actionClassName = primary
    ? `${buttonClassName} bg-white text-[#0B0F1A] hover:bg-gray-100`
    : `${buttonClassName} bg-[#0B0F1A]/80 text-white ring-1 ring-white/20 hover:bg-[#0B0F1A]`;

  return (
    <div className="group flex min-h-[210px] flex-col justify-between rounded-2xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 p-6 text-white shadow-lg shadow-blue-950/20 transition duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-950/30">
      <div>
        {meta ? <div className="mb-3 text-xs font-semibold uppercase text-cyan-50">{meta}</div> : null}
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-blue-50">{description}</p>
      </div>

      {href ? (
        <Link href={href} className={actionClassName}>
          {buttonText}
          <ArrowRight className="ml-2 size-4" />
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={actionClassName}>
          {buttonText}
          <ArrowRight className="ml-2 size-4" />
        </button>
      )}
    </div>
  );
}

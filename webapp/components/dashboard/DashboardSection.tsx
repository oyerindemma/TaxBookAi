import type { ReactNode } from "react";

type DashboardSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function DashboardSection({
  title,
  subtitle,
  children,
}: DashboardSectionProps) {
  return (
    <section className="mb-10">
      <div className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {subtitle ? <p className="text-sm leading-6 text-gray-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

"use client";

import RecalculateTaxButton from "./RecalculateTaxButton";

type DashboardClientProps = {
  userId: number;
  transactionCount: number;
  isSetupComplete: boolean;
};

export default function DashboardClient({
  userId,
  transactionCount,
  isSetupComplete,
}: DashboardClientProps) {
  return (
    <RecalculateTaxButton
      userId={userId}
      transactionCount={transactionCount}
      isSetupComplete={isSetupComplete}
    />
  );
}

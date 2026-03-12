"use client";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { useRole } from "@/hooks/use-role";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Logs() {
  const { role } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (role === "user") router.replace("/");
  }, [role, router]);

  if (role === "user") return null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-beac-bleue">Journaux d'audit</h1>
      <AuditLogTable />
    </div>
  );
}

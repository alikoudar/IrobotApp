"use client";

import { ConfigEditor } from "@/components/config/config-editor";
import { useRole } from "@/hooks/use-role";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Config() {
  const { role } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (role !== "admin") router.replace("/");
  }, [role, router]);

  if (role !== "admin") return null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-xl font-bold text-beac-bleue">Configuration</h1>
      <ConfigEditor />
    </div>
  );
}

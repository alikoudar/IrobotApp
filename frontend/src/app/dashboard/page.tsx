"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { useRole } from "@/hooks/use-role";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { role } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (role === "user") router.replace("/");
  }, [role, router]);

  if (role === "user") return null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-beac-bleue">Tableau de bord</h1>

      {role === "admin" ? (
        <Tabs defaultValue="admin">
          <TabsList>
            <TabsTrigger value="admin">Administration</TabsTrigger>
            <TabsTrigger value="manager">Gestion documentaire</TabsTrigger>
          </TabsList>
          <TabsContent value="admin" className="mt-4">
            <AdminDashboard />
          </TabsContent>
          <TabsContent value="manager" className="mt-4">
            <ManagerDashboard />
          </TabsContent>
        </Tabs>
      ) : (
        <ManagerDashboard />
      )}
    </div>
  );
}

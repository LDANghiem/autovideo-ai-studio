"use client";

import { ReactNode } from "react";
import Sidebar from "@/app/dashboard/Sidebar";
import { ToastProvider } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>

      <Toaster></Toaster>
    </ToastProvider>
  );
}

// Server component wrapper — forces dynamic rendering for all dashboard routes
// This prevents Next.js from attempting to statically pre-render dashboard pages
export const dynamic = "force-dynamic";

import DashboardClientLayout from "./layout-client";
import { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
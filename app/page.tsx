import { DashboardShell } from "@/components/dashboard-shell";
import { hasSupabaseAuth } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <DashboardShell authEnabled={hasSupabaseAuth()} />;
}

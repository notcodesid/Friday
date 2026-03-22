import { Dashboard } from "@/components/dashboard";
import { hasSupabaseAuth } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <Dashboard authEnabled={hasSupabaseAuth()} />;
}

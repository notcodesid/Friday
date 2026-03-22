import { hasSupabase } from "@/lib/env";
import { LocalRunStore } from "@/lib/storage/local-store";
import { SupabaseRunStore } from "@/lib/storage/supabase-store";

export function getRunStore() {
  if (hasSupabase()) {
    return new SupabaseRunStore();
  }

  return new LocalRunStore();
}

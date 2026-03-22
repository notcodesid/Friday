const DEFAULT_SITE_URL = "https://www.tryproven.fun/";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function trimValue(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const env = {
  anthropicApiKey: trimValue(process.env.ANTHROPIC_API_KEY),
  model: trimValue(process.env.AI_MODEL) ?? DEFAULT_MODEL,
  defaultSiteUrl:
    trimValue(process.env.NEXT_PUBLIC_DEFAULT_SITE_URL) ?? DEFAULT_SITE_URL,
  supabaseProjectId: trimValue(process.env.SUPABASE_PROJECT_ID),
  supabaseUrl:
    trimValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    trimValue(process.env.SUPABASE_URL) ??
    (trimValue(process.env.SUPABASE_PROJECT_ID)
      ? `https://${trimValue(process.env.SUPABASE_PROJECT_ID)}.supabase.co`
      : undefined),
  supabaseAnonKey:
    trimValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    trimValue(process.env.SUPABASE_ANON_KEY),
  supabaseServiceRoleKey:
    trimValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    trimValue(process.env.SUPABASE_SECRET_KEY),
};

export function hasAI() {
  return Boolean(env.anthropicApiKey);
}

export function hasSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function hasSupabaseAuth() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

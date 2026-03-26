const DEFAULT_SITE_URL = "https://www.tryproven.fun/";
const DEFAULT_MODEL = "gemini-2.0-flash";

function trimValue(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseApiKeys(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((k) => trimValue(k))
    .filter((k): k is string => Boolean(k));
}

function getGeminiKeys(): string[] {
  const singleKey = trimValue(process.env.GEMINI_API_KEY);
  const multiKeys = parseApiKeys(process.env.GEMINI_API_KEYS);
  
  if (multiKeys.length > 0) return multiKeys;
  if (singleKey) return [singleKey];
  return [];
}

export const env = {
  anthropicApiKey: trimValue(process.env.ANTHROPIC_API_KEY),
  geminiApiKeys: getGeminiKeys(),
  geminiApiKey: trimValue(process.env.GEMINI_API_KEY),
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
  solanaCluster:
    trimValue(process.env.NEXT_PUBLIC_SOLANA_CLUSTER) ??
    trimValue(process.env.SOLANA_CLUSTER),
  solanaRpcUrl:
    trimValue(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) ??
    trimValue(process.env.SOLANA_RPC_URL),
  solanaMerchantWallet:
    trimValue(process.env.NEXT_PUBLIC_SOLANA_MERCHANT_WALLET) ??
    trimValue(process.env.SOLANA_MERCHANT_WALLET),
};

export function hasAI() {
  return Boolean(env.anthropicApiKey) || env.geminiApiKeys.length > 0;
}

export function hasGemini() {
  return env.geminiApiKeys.length > 0;
}

export function hasSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function hasSupabaseAuth() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasSolanaMerchantWallet() {
  return Boolean(env.solanaMerchantWallet);
}

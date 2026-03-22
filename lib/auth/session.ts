import { createClient, type User } from "@supabase/supabase-js";

import { env, hasSupabaseAuth } from "@/lib/env";

type AuthResult =
  | {
      ok: true;
      authEnforced: boolean;
      user: User | null;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

let authClient:
  | ReturnType<typeof createClient>
  | null = null;

function getAuthClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase auth is not configured.");
  }

  if (!authClient) {
    authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return authClient;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function requireSession(request: Request): Promise<AuthResult> {
  if (!hasSupabaseAuth()) {
    return {
      ok: true,
      authEnforced: false,
      user: null,
    };
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      ok: false,
      error: "Authentication required.",
      status: 401,
    };
  }

  const { data, error } = await getAuthClient().auth.getUser(accessToken);
  if (error || !data.user) {
    return {
      ok: false,
      error: "Your session is invalid or has expired.",
      status: 401,
    };
  }

  return {
    ok: true,
    authEnforced: true,
    user: data.user,
  };
}

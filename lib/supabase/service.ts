import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let serviceClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use sparingly for admin tasks (storage uploads, signed URLs,
 * cross-user reads). NEVER import into client components.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const env = getEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return serviceClient;
}

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createServerSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing Supabase server environment variables");
    throw new Error("Missing Supabase server environment variables");
  }

  return createServerClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    cookies: {
      get(name: string) {
        return undefined;
      },
      set(name: string, value: string, options: CookieOptions) {},
      remove(name: string, options: CookieOptions) {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

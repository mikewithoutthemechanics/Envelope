import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function validateEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }
}

export const supabase = createBrowserClient(supabaseUrl!, supabaseAnonKey!);

export function createBrowserSupabaseClient() {
  validateEnv();
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}

// Alias for backward compatibility
export const createClient = createBrowserSupabaseClient;

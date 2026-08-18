import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

export async function createNiboSyncSupabaseClient() {
  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const syncEmail = process.env["SUPABASE_SYNC_EMAIL"];
  const syncPassword = process.env["SUPABASE_SYNC_PASSWORD"];
  const useServiceRole = process.env["NIBO_SUPABASE_USE_SERVICE_ROLE"] === "true";
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url) throw new Error("SUPABASE_URL nao configurado.");

  if (useServiceRole) {
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurado.");
    return createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  if (!publishableKey) throw new Error("SUPABASE_PUBLISHABLE_KEY nao configurado.");
  if (!syncEmail || !syncPassword) {
    throw new Error(
      "SUPABASE_SYNC_EMAIL e SUPABASE_SYNC_PASSWORD sao obrigatorios para sync com RLS.",
    );
  }

  const supabase = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: syncEmail,
    password: syncPassword,
  });
  if (error) throw error;

  return supabase;
}

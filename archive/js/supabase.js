// Supabase client (browser, no build step). Uses ESM CDN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const SUPABASE_URL = "https://rejcqfftouzztfnzsyaq.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlamNxZmZ0b3V6enRmbnpzeWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTQyNDYsImV4cCI6MjA5MTkzMDI0Nn0.blEDnSFRGDIXiHm3cUg2eyCQPWH3qIMzbG8HTH4s-EM";
export const ADMIN_EMAIL = "7withak@gmail.com";
export const IMAGE_BUCKET = "log-images";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}
export async function isAdmin() {
  const u = await currentUser();
  return !!u && u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

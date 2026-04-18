// Supabase client — shared by all pages.
// These values are PUBLIC by design (anon key + project URL).
// Real protection lives in the SQL RLS policies + the secret admin URL.
const SUPABASE_URL = "https://rejcqfftouzztfnzsyaq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlamNxZmZ0b3V6enRmbnpzeWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTQyNDYsImV4cCI6MjA5MTkzMDI0Nn0.blEDnSFRGDIXiHm3cUg2eyCQPWH3qIMzbG8HTH4s-EM";

// supabase-js v2 is loaded via CDN <script> tag in each page (window.supabase).
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.SUPABASE_URL = SUPABASE_URL;

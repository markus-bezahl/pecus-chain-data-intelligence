import { createClient } from '@supabase/supabase-js'

// In a real app, these should be in a .env file
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log("Supabase Config Debug:");
console.log("- URL:", supabaseUrl);
console.log("- Key Length:", supabaseAnonKey ? supabaseAnonKey.length : "MISSING");
if (supabaseAnonKey && supabaseAnonKey.length > 10) {
    console.log("- Key Start:", supabaseAnonKey.substring(0, 10) + "...");
}

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Key missing! Check .env file.")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

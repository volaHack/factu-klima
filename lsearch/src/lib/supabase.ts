import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Or service role key for admin

// Service role key allows bypassing RLS, which is better for server-side operations
// Since we don't have it yet, we'll try with ANON key, but User might need to check RLS policies
export const supabase = createClient(supabaseUrl, supabaseKey);

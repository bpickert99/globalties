import { createClient } from '@supabase/supabase-js'

// Publishable key: safe to ship in the browser; row level security guards the data.
// PKCE puts auth redirects in ?code= rather than the #fragment, which the HashRouter owns.
export const supabase = createClient('https://qdbadahhgytdscdbljov.supabase.co', 'sb_publishable_JEIF9Vc-Ij3BSkOnLtFh5A_pRT4WBK0', {
  auth: { flowType: 'pkce' },
})

// Unwraps a Supabase response, throwing on error so failures surface loudly.
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

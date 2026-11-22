import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  url && key && !url.includes("YOUR_PROJECT") && !key.includes("YOUR_SUPABASE")
);

// Supabase Auth currently treats a rate-limited refresh (HTTP 429) as a rejected
// credential in some SDK versions. A 429/408/409 is transient, not proof that
// the user's refresh token is invalid. Throwing makes auth-js use its retry
// path and preserve the stored session while it backs off.
const authSafeFetch = async (input, init) => {
  const response = await fetch(input, init);
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url || "";

  const isRefreshRequest =
    requestUrl.includes("/auth/v1/token") &&
    requestUrl.includes("grant_type=refresh_token");

  if (isRefreshRequest && [408, 429, 409].includes(response.status)) {
    throw new TypeError(`Temporary Supabase token refresh response: ${response.status}`);
  }

  return response;
};

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      global: { fetch: authSafeFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

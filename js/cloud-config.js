// Accounts & sync backend (Supabase). Leave blank to run without accounts:
// the app works fully offline and the account page explains that sign-in
// isn't set up yet. See docs/ACCOUNTS.md for the 5-minute setup.
//
// The anon key is designed to be public; Row Level Security in
// supabase/schema.sql is what keeps each user's data private.

export const CLOUD = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // OAuth providers you've enabled in Supabase → Authentication → Providers.
  oauthProviders: [], // e.g. ['google']
  ...(globalThis.__IC_CLOUD_CONFIG__ || {}), // test/dev override
};

export const isCloudConfigured = () => Boolean(CLOUD.supabaseUrl && CLOUD.supabaseAnonKey);

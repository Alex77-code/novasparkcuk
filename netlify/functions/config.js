const { json } = require('./_nova');

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return json(200, { configured: false, reason: 'SUPABASE_NOT_CONNECTED' });
  }
  return json(200, {
    configured: true,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    ownerEmail: process.env.NOVA_OWNER_EMAIL || null
  });
};

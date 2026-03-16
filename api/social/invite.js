import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const supabaseAdmin = getSupabaseAdmin();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { phoneHash } = req.body;
  if (!phoneHash) {
    return res.status(400).json({ error: 'phoneHash required' });
  }

  try {
    const { error: insertErr } = await supabaseAdmin
      .from('contact_invites')
      .insert({
        inviter_user_id: user.id,
        phone_hash: phoneHash,
      });

    if (insertErr && insertErr.code !== '23505') {
      throw insertErr;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[invite] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

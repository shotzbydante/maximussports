import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return handleTrackReferral(req, res);
  }
  if (req.method === 'GET') {
    return handleGetReferralStats(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleTrackReferral(req, res) {
  const { referrerId, referralCode } = req.body;
  if (!referrerId || !referralCode) {
    return res.status(400).json({ error: 'referrerId and referralCode required' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('referral_tracking')
      .insert({
        referrer_id: referrerId,
        referral_code: referralCode,
        status: 'pending',
      });

    if (error && error.code !== '23505') throw error;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[referral] track error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGetReferralStats(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { data: referrals, error } = await supabaseAdmin
      .from('referral_tracking')
      .select('id, referral_code, status, invite_sent_at, signup_at')
      .eq('referrer_id', user.id)
      .order('invite_sent_at', { ascending: false });

    if (error) throw error;

    const stats = {
      totalInvites: referrals?.length || 0,
      signups: referrals?.filter(r => r.status === 'signed_up' || r.status === 'completed').length || 0,
      completed: referrals?.filter(r => r.status === 'completed').length || 0,
    };

    return res.status(200).json({ stats, referrals: referrals || [] });
  } catch (err) {
    console.error('[referral] stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

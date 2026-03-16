import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { getSubject, renderHTML, renderText } from '../../src/emails/templates/inviteEmail.js';
import { isTournamentWeek } from '../../src/emails/tournamentWindow.js';

const supabaseAdmin = getSupabaseAdmin();

/**
 * Attempt to load recent model signals for the invite email.
 * Non-critical — returns empty array on failure.
 */
async function loadModelSignals() {
  try {
    const { getJson } = await import('../_globalCache.js');
    const cached = await getJson('picks:latest:v1');
    if (Array.isArray(cached) && cached.length > 0) {
      return cached.slice(0, 5);
    }
  } catch { /* signals are optional */ }
  return [];
}

/**
 * Build tournament meta context for the invite email.
 * Returns tournament-specific narrative content when in the tournament window.
 */
function buildTournamentMeta() {
  if (!isTournamentWeek()) return {};
  return {
    storylines: [
      'Top seeds under the microscope \u2014 model confidence vs. consensus',
      'Early-round upset alerts from the Upset Radar',
      'Matchups where the model sees a different outcome than the market',
    ],
    edgeBullets: [
      'Strong favorite signals on top seeds entering the tournament',
      'Multiple volatile 8 vs 9 matchups that are statistical coin flips',
      'Classic 5 vs 12 upset opportunities with elevated model volatility',
    ],
  };
}

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

  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const inviterName = profile?.display_name
      || user.user_metadata?.display_name
      || user.user_metadata?.full_name
      || null;
    const inviterFirstName = inviterName ? inviterName.split(' ')[0] : null;
    const inviterEmail = user.email;

    const inviteLink = `https://maximussports.ai/join?ref=${user.id}`;

    const [modelSignals] = await Promise.allSettled([loadModelSignals()]);

    const templateData = {
      inviterName: inviterFirstName,
      inviteLink,
      modelSignals: modelSignals.status === 'fulfilled' ? modelSignals.value : [],
      tournamentMeta: buildTournamentMeta(),
    };

    const subject = getSubject(templateData);
    const html = renderHTML(templateData);
    const text = renderText(templateData);

    await sendEmail({
      to: email,
      subject,
      html,
      text,
      replyTo: inviterEmail || undefined,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-invite-email] error:', err);
    return res.status(500).json({ error: 'Failed to send invite email' });
  }
}

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { getSubject, renderHTML, renderText } from '../../src/emails/templates/inviteEmail.js';

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
    const templateData = { inviterName: inviterFirstName, inviteLink };

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

/**
 * Diagnostic: test autopost import chain one by one.
 */
export default async function handler(req, res) {
  const results = [];

  const imports = [
    ['supabaseAdmin', () => import('../../api/_lib/supabaseAdmin.js')],
    ['teams', () => import('../../src/sports/mlb/teams.js')],
    ['seasonModel', () => import('../../src/data/mlb/seasonModel.js')],
    ['buildMlbDailyHeadline', () => import('../../src/features/mlb/contentStudio/buildMlbDailyHeadline.js')],
    ['buildMlbCaption', () => import('../../src/features/mlb/contentStudio/buildMlbCaption.js')],
    ['mlbDailyHelpers', () => import('../../src/components/dashboard/slides/mlbDailyHelpers.js')],
    ['mlbBrowserRenderer', () => import('../../api/_lib/mlbBrowserRenderer.js')],
    ['mlbSlideRenderer', () => import('../../api/_lib/mlbSlideRenderer.js')],
  ];

  for (const [name, loader] of imports) {
    try {
      await loader();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e.message, code: e.code });
    }
  }

  return res.status(200).json({ results });
}

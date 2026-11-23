import {
  NflSlateHeroSlide,
  NflSlateBoardSlide,
  NflTitleRaceSlide,
  NflPicksCoverSlide,
  NflPickSlide,
  NflGameSlide,
  NflReceiptsSlide,
  NflTeamSlide,
  NflReviewSlide,
  NflExplainerSlide,
  NflDailyHitsSlide,
  NflDailyTonightSlide,
  NflDailyAheadSlide,
} from './NflSlides';

/** Template id → ordered slide components. `pickCount` sizes the picks carousel. */
export function getNflSlides(template, { pickCount = 0 } = {}) {
  switch (template) {
    case 'nfl-daily':
      return [NflDailyHitsSlide, NflDailyTonightSlide, NflDailyAheadSlide];
    case 'nfl-slate':
      return [NflSlateHeroSlide, NflSlateBoardSlide, NflTitleRaceSlide];
    case 'nfl-picks':
      return [NflPicksCoverSlide, ...Array.from({ length: Math.min(Math.max(pickCount, 0), 4) }, () => NflPickSlide)];
    case 'nfl-game':
      return [NflGameSlide];
    case 'nfl-receipts':
      return [NflReceiptsSlide];
    case 'nfl-team':
      return [NflTeamSlide];
    case 'nfl-review':
      return [NflReviewSlide];
    case 'nfl-explain':
      return [NflExplainerSlide];
    default:
      return null;
  }
}

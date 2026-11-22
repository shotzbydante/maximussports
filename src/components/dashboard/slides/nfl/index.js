import {
  NflSlateHeroSlide,
  NflSlateBoardSlide,
  NflTitleRaceSlide,
  NflPicksCoverSlide,
  NflPickSlide,
  NflGameSlide,
  NflReceiptsSlide,
} from './NflSlides';

/** Template id → ordered slide components. `pickCount` sizes the picks carousel. */
export function getNflSlides(template, { pickCount = 0 } = {}) {
  switch (template) {
    case 'nfl-slate':
      return [NflSlateHeroSlide, NflSlateBoardSlide, NflTitleRaceSlide];
    case 'nfl-picks':
      return [NflPicksCoverSlide, ...Array.from({ length: Math.min(Math.max(pickCount, 0), 4) }, () => NflPickSlide)];
    case 'nfl-game':
      return [NflGameSlide];
    case 'nfl-receipts':
      return [NflReceiptsSlide];
    default:
      return null;
  }
}

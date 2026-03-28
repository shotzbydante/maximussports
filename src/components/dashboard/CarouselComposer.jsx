import { useEffect } from 'react';

// Daily Briefing slides
import DailyBriefingHeroSlide from './slides/DailyBriefingHeroSlide';
import DailyBriefingSlide1 from './slides/DailyBriefingSlide1';
import DailyBriefingSlide2 from './slides/DailyBriefingSlide2';
import DailyBriefingSlide3 from './slides/DailyBriefingSlide3';
import DailyBriefingSlide4 from './slides/DailyBriefingSlide4';
import DailyBriefingSlide5 from './slides/DailyBriefingSlide5';

// Team Intel slides
import TeamIntelSlide1 from './slides/TeamIntelSlide1';
import TeamIntelSlide2 from './slides/TeamIntelSlide2';
import TeamIntelSlide3 from './slides/TeamIntelSlide3';
import TeamIntelSlide4 from './slides/TeamIntelSlide4';

// Game Preview slides
import GamePreviewSlide1 from './slides/GamePreviewSlide1';
import GamePreviewSlide2 from './slides/GamePreviewSlide2';
import GamePreviewSlide3 from './slides/GamePreviewSlide3';
import GameInsights5GamesSlide from './slides/GameInsights5GamesSlide';

// Tournament / March Madness slides
import TournamentInsightsSlide from './slides/TournamentInsightsSlide';
import UpsetRadarSlide from './slides/UpsetRadarSlide';

// Odds Insights slides (legacy)
import OddsInsightsSlide1 from './slides/OddsInsightsSlide1';
import OddsInsightsSlide2 from './slides/OddsInsightsSlide2';
import OddsInsightsSlide3 from './slides/OddsInsightsSlide3';
import OddsInsightsSlide4 from './slides/OddsInsightsSlide4';

// Maximus's Picks slides (1080×1080)
import MaxPicksHeroSlide from './slides/MaxPicksHeroSlide';
import MaxPicksPickemsSlide from './slides/MaxPicksPickemsSlide';
import MaxPicksATSSlide from './slides/MaxPicksATSSlide';
import MaxPicksValueSlide from './slides/MaxPicksValueSlide';
import MaxPicksTotalsSlide from './slides/MaxPicksTotalsSlide';
import MaxPicksUpsetsSlide from './slides/MaxPicksUpsetsSlide';

// Conference Intel slide
import ConferenceIntelSlide from './slides/ConferenceIntelSlide';

// MLB universal single slide
import MlbSingleSlide from './slides/MlbSingleSlide';

import styles from './CarouselComposer.module.css';

/**
 * Template → artboard dimensions. All templates default to 1080×1350 (IG 4:5)
 * except Maximus's Picks which uses 1080×1080 (IG square).
 */
const TEMPLATE_DIMENSIONS = {
  picks: { width: 1080, height: 1080 },
};
const DEFAULT_DIMENSIONS = { width: 1080, height: 1350 };

export function getTemplateDimensions(template) {
  return TEMPLATE_DIMENSIONS[template] || DEFAULT_DIMENSIONS;
}

/**
 * Template → ordered slide component list.
 * Each entry is a component that accepts { data, teamData, game, asOf, slideNumber, slideTotal, options }.
 */
function getSlides(template, slideCount, options = {}) {
  switch (template) {
    // ── MLB templates: ALWAYS single slide ──
    case 'mlb-daily':
    case 'mlb-team':
    case 'mlb-league':
    case 'mlb-division':
    case 'mlb-game':
    case 'mlb-picks':
      return [MlbSingleSlide];

    // ── NCAAM templates (untouched) ──
    case 'team':
      return [TeamIntelSlide4, TeamIntelSlide1, TeamIntelSlide2, TeamIntelSlide3].slice(0, Math.min(slideCount, 4));
    case 'conference':
      return [ConferenceIntelSlide];
    case 'game': {
      if (options?.gameMode === 'tournament') return [TournamentInsightsSlide];
      if (options?.gameMode === 'upset-radar') {
        const dayCards = options?.dayCards;
        if (dayCards && dayCards.length > 1) {
          return dayCards.map(() => UpsetRadarSlide);
        }
        return [UpsetRadarSlide];
      }
      if (options?.gameMode === '5games') return [GameInsights5GamesSlide];
      return [GamePreviewSlide1, GamePreviewSlide2, GamePreviewSlide3].slice(0, Math.min(slideCount, 3));
    }
    case 'picks':
      return [
        MaxPicksHeroSlide,
        MaxPicksPickemsSlide,
        MaxPicksATSSlide,
        MaxPicksValueSlide,
        MaxPicksTotalsSlide,
        MaxPicksUpsetsSlide,
      ].slice(0, Math.min(slideCount, 6));
    case 'odds':
      if (slideCount >= 4) {
        return [OddsInsightsSlide1, OddsInsightsSlide2, OddsInsightsSlide3, OddsInsightsSlide4].slice(0, Math.min(slideCount, 4));
      }
      return [OddsInsightsSlide1, OddsInsightsSlide2, OddsInsightsSlide3].slice(0, Math.min(slideCount, 3));
    case 'daily':
    default:
      return [
        DailyBriefingHeroSlide,
        DailyBriefingSlide1,
        DailyBriefingSlide2,
        DailyBriefingSlide3,
        DailyBriefingSlide4,
        DailyBriefingSlide5,
      ].slice(0, Math.min(slideCount, 6));
  }
}

const TEMPLATE_LABELS = {
  daily:           'Daily Briefing',
  team:            'Team Intel',
  conference:      'Conference Intel',
  game:            'Game Insights',
  picks:           "Maximus's Picks",
  odds:            'Odds Insights',
  'mlb-daily':     'MLB Daily Briefing',
  'mlb-team':      'MLB Team Intel',
  'mlb-league':    'MLB League Intel',
  'mlb-division':  'MLB Division Intel',
  'mlb-game':      'MLB Game Insights',
  'mlb-picks':     "MLB Maximus's Picks",
};

/**
 * Renders a scaled preview row + hidden full-res export artboards.
 *
 * Props:
 *   template     – 'daily'|'team'|'game'|'odds'
 *   slideCount   – number of slides (Daily Briefing is always 5; others default to 3)
 *   data         – home/odds data (daily includes data.chatDigest)
 *   teamData     – team page data
 *   selectedGame – selected game object
 *   exportRef    – ref forwarded to the export layer
 *   onAssetsReady – callback when slides are ready
 *   options      – { styleMode, riskMode, picksMode, gameAngle, includeHeadlines }
 */
export default function CarouselComposer({
  template = 'daily',
  slideCount = 3,
  data,
  teamData,
  conferenceData,
  selectedGame,
  exportRef,
  onAssetsReady,
  options = {},
  previewScale = 0.35,
}) {
  const asOf = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short',
  });

  const slides = getSlides(template, slideCount, options);
  const total = slides.length;
  const dims = getTemplateDimensions(template);

  const dayCards = options?.dayCards;
  const isMultiDayUpsetRadar = options?.gameMode === 'upset-radar' && dayCards && dayCards.length > 1;

  function getSlideOptions(slideIndex) {
    if (!isMultiDayUpsetRadar) return options;
    const dayCard = dayCards[slideIndex];
    if (!dayCard) return options;
    return {
      ...options,
      upsetRadarGames: dayCard.games,
      dayLabel: dayCard.dayLabel,
      roundLabel: dayCard.roundLabel,
    };
  }

  const slideProps = { data, teamData, conferenceData, game: selectedGame, asOf, slideTotal: total };

  useEffect(() => {
    const t = setTimeout(() => onAssetsReady?.(), 700);
    return () => clearTimeout(t);
  }, [data, teamData, selectedGame, template, options, onAssetsReady]);

  const scaledW = Math.round(dims.width * previewScale);
  const scaledH = Math.round(dims.height * previewScale);

  return (
    <div className={styles.root}>
      {/* Template label */}
      <div className={styles.templateLabel}>
        {TEMPLATE_LABELS[template] || 'Carousel'} &mdash; {total} slide{total !== 1 ? 's' : ''}
      </div>

      {/* ── Scaled preview row ─────────────────────────── */}
      <div className={styles.previewRow}>
        {slides.map((SlideComp, i) => (
          <div key={i} className={styles.previewWrapper}>
            <div className={styles.slideLabel}>Slide {i + 1}</div>
            <div
              className={styles.previewScaler}
              style={{ width: `${scaledW}px`, height: `${scaledH}px` }}
            >
              <div
                className={styles.previewClip}
                style={{ transform: `scale(${previewScale})` }}
              >
                <SlideComp {...slideProps} options={getSlideOptions(i)} slideNumber={i + 1} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Full-res export artboards (visually hidden) ── */}
      <div className={styles.exportLayer} ref={exportRef} aria-hidden="true">
        {slides.map((SlideComp, i) => (
          <SlideComp
            key={i}
            {...slideProps}
            options={getSlideOptions(i)}
            slideNumber={i + 1}
            data-slide={String(i + 1)}
          />
        ))}
      </div>
    </div>
  );
}

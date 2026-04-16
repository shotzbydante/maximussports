/**
 * NBA Bracketology — premium dark-mode playoff bracket.
 * West left, East right, NBA Finals center.
 * Championship metallic gold on smoked black glass.
 *
 * State:
 * - picks: { matchupId: 'top'|'bottom' }
 * - seriesResults: { matchupId: { winner, loser, topWins, bottomWins, seriesCall, seriesScore } }
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { NBA_PLAYOFF_YEAR } from '../../config/nbaBracketology';
import {
  buildFullNbaBracket, applyPicksToBracket,
  resolvePlayIn, applyPlayInToBracket, hasUnresolvedPlayIn,
} from '../../data/nba/playoffBracket';
import {
  resolveFullNbaBracket, simulateNbaBracket,
  simulateRound, simulateRemainingBracket, sampleSeriesOutcome,
} from '../../utils/nbaSeriesResolver';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { NBA_TEAMS } from '../../sports/nba/teams';
import styles from './NbaBracketology.module.css';

const slugToName = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t.shortName || t.name]));

/* ── Helpers ── */

/** Get all downstream matchup IDs that depend on a given matchup */
function getDownstream(matchupId, bracket) {
  const downstream = new Set();
  const queue = [matchupId];
  while (queue.length > 0) {
    const cur = queue.pop();
    for (const [id, m] of Object.entries(bracket)) {
      if ((m.topSourceId === cur || m.bottomSourceId === cur) && !downstream.has(id)) {
        downstream.add(id);
        queue.push(id);
      }
    }
  }
  return downstream;
}

/** Clear picks and results for a set of matchup IDs */
function clearMatchupIds(ids, prevPicks, prevResults) {
  const nextPicks = { ...prevPicks };
  const nextResults = { ...prevResults };
  for (const id of ids) {
    delete nextPicks[id];
    delete nextResults[id];
  }
  return { picks: nextPicks, results: nextResults };
}

/* ── Series Card ── */
function SeriesCard({ matchup, result, prediction, userPick, onPick }) {
  if (!matchup) return null;
  const { topTeam, bottomTeam, matchupId, status, spread } = matchup;
  const isWaiting = status === 'waiting';
  const topPicked = userPick === 'top';
  const btmPicked = userPick === 'bottom';
  const isResolved = topPicked || btmPicked;

  function pick(pos) {
    if (isWaiting) return;
    const t = pos === 'top' ? topTeam : bottomTeam;
    if (!t || t.isPlaceholder) return;
    // Manual pick: sample a series outcome for display
    onPick(matchupId, pos);
  }

  const resultLabel = result?.seriesCall;

  return (
    <div className={`${styles.card} ${isWaiting ? styles.cardWaiting : ''} ${isResolved ? styles.cardResolved : ''}`}>
      {spread && <span className={styles.spread}>{spread}</span>}

      <button type="button"
        className={`${styles.slot} ${topPicked ? styles.slotWinner : ''} ${btmPicked ? styles.slotLoser : ''}`}
        onClick={() => pick('top')} disabled={isWaiting || topTeam?.isPlaceholder}>
        {topTeam?.logo && <img src={topTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{topTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{topTeam?.shortName || topTeam?.name || 'TBD'}</span>
        {result && <span className={`${styles.seriesWins} ${topPicked ? styles.seriesWinsActive : ''}`}>{result.topWins}</span>}
      </button>

      <button type="button"
        className={`${styles.slot} ${btmPicked ? styles.slotWinner : ''} ${topPicked ? styles.slotLoser : ''}`}
        onClick={() => pick('bottom')} disabled={isWaiting || bottomTeam?.isPlaceholder}>
        {bottomTeam?.logo && <img src={bottomTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{bottomTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{bottomTeam?.shortName || bottomTeam?.name || 'TBD'}</span>
        {result && <span className={`${styles.seriesWins} ${btmPicked ? styles.seriesWinsActive : ''}`}>{result.bottomWins}</span>}
      </button>

      <div className={styles.cardFoot}>
        {resultLabel && <span className={styles.resultBadge}>{resultLabel}</span>}
        {!resultLabel && prediction && <span className={styles.predBadge}>{prediction.seriesCall}</span>}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function NbaBracketology() {
  const [picks, setPicks] = useState({});
  const [seriesResults, setSeriesResults] = useState({});
  const [predictions, setPredictions] = useState({});
  const [odds, setOdds] = useState({});
  const [simResults, setSimResults] = useState(null);
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    fetchNbaChampionshipOdds().then(d => setOdds(d.odds || {})).catch(() => {});
  }, []);

  const [playInResults, setPlayInResults] = useState(null);

  const context = useMemo(() => ({ championshipOdds: odds }), [odds]);
  const rawBracketBase = useMemo(() => buildFullNbaBracket(), []);

  // Apply play-in results to the base bracket, then apply picks on top
  const rawBracket = useMemo(() => {
    if (!playInResults) return rawBracketBase;
    return applyPlayInToBracket(rawBracketBase, playInResults);
  }, [rawBracketBase, playInResults]);

  const allMatchups = useMemo(() => applyPicksToBracket(rawBracket, picks), [rawBracket, picks]);

  /** Resolve play-in if needed, returns the bracket with play-in seeds filled */
  const ensurePlayInResolved = useCallback(() => {
    if (!hasUnresolvedPlayIn(rawBracket)) return rawBracket;
    const westPI = resolvePlayIn('western', context);
    const eastPI = resolvePlayIn('eastern', context);
    const piResults = { western: westPI, eastern: eastPI };
    setPlayInResults(piResults);
    return applyPlayInToBracket(rawBracketBase, piResults);
  }, [rawBracket, rawBracketBase, context]);

  // Deterministic predictions for display hints
  useEffect(() => {
    const { predictions: preds } = resolveFullNbaBracket(allMatchups, context);
    setPredictions(preds);
  }, [allMatchups, context]);

  // Manual pick — cascades downstream
  const handlePick = useCallback((matchupId, position) => {
    const downstream = getDownstream(matchupId, rawBracket);
    setPicks(prev => {
      const cleaned = { ...prev };
      for (const id of downstream) delete cleaned[id];
      cleaned[matchupId] = position;
      return cleaned;
    });
    setSeriesResults(prev => {
      const cleaned = { ...prev };
      for (const id of downstream) delete cleaned[id];
      // Generate a result for the manual pick
      const current = applyPicksToBracket(rawBracket, { ...picks, [matchupId]: position });
      const m = current[matchupId];
      if (m?.topTeam && m?.bottomTeam && !m.topTeam.isPlaceholder && !m.bottomTeam.isPlaceholder) {
        const outcome = sampleSeriesOutcome(
          position === 'top' ? m.topTeam : m.bottomTeam,
          position === 'top' ? m.bottomTeam : m.topTeam,
          context
        );
        if (outcome) {
          // Reframe outcome relative to top/bottom
          const winnerIsTop = position === 'top';
          cleaned[matchupId] = {
            ...outcome,
            topWins: winnerIsTop ? 4 : outcome.bottomWins,
            bottomWins: winnerIsTop ? outcome.bottomWins : 4,
            seriesCall: `${(winnerIsTop ? m.topTeam : m.bottomTeam).shortName} in ${4 + outcome.bottomWins}`,
            seriesScore: `4-${outcome.bottomWins}`,
          };
        }
      }
      return cleaned;
    });
  }, [rawBracket, picks, context]);

  // Simulate a specific round (dice reroll)
  const handleSimRound = useCallback((round) => {
    // Resolve play-in first if R1 and seeds are TBD
    const base = round === 1 ? ensurePlayInResolved() : rawBracket;

    const current = applyPicksToBracket(base, picks);
    const roundMatchupIds = Object.values(current)
      .filter(m => m.round === round)
      .map(m => m.matchupId);

    const toClear = new Set(roundMatchupIds);
    for (const mid of roundMatchupIds) {
      for (const id of getDownstream(mid, base)) toClear.add(id);
    }

    const cleanedPicks = { ...picks };
    const cleanedResults = { ...seriesResults };
    for (const id of toClear) {
      delete cleanedPicks[id];
      delete cleanedResults[id];
    }

    const freshBracket = applyPicksToBracket(base, cleanedPicks);
    const { picks: roundPicks, results: roundResults } = simulateRound(freshBracket, round, context);

    setPicks({ ...cleanedPicks, ...roundPicks });
    setSeriesResults({ ...cleanedResults, ...roundResults });
  }, [rawBracket, picks, seriesResults, context, ensurePlayInResolved]);

  // Simulate full bracket from current state
  const handleSimBracket = useCallback(() => {
    setSimRunning(true);
    setTimeout(() => {
      // Resolve play-in first
      const base = ensurePlayInResolved();
      const { picks: newPicks, results: newResults } = simulateRemainingBracket(base, picks, applyPicksToBracket, context);
      setPicks(newPicks);
      setSeriesResults(prev => ({ ...prev, ...newResults }));
      const mcResults = simulateNbaBracket(base, context, 1000);
      setSimResults(mcResults);
      setSimRunning(false);
    }, 50);
  }, [rawBracket, picks, context, ensurePlayInResolved]);

  const handleClear = useCallback(() => {
    setPicks({});
    setSeriesResults({});
    setSimResults(null);
    setPlayInResults(null);
  }, []);

  // Maximus's Picks — simulate next unresolved round
  const handleMaximus = useCallback(() => {
    const current = applyPicksToBracket(rawBracket, picks);
    for (let round = 1; round <= 4; round++) {
      const hasResolvable = Object.values(current).some(m =>
        m.round === round && !picks[m.matchupId] &&
        m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder
      );
      if (hasResolvable) { handleSimRound(round); return; }
    }
  }, [rawBracket, picks, handleSimRound]);

  const getMatchups = (conference, round) =>
    Object.values(allMatchups)
      .filter(m => m.conference === conference && m.round === round)
      .sort((a, b) => a.position - b.position);

  // Check if a round has resolvable matchups
  const roundHasResolvable = (round) =>
    Object.values(allMatchups).some(m =>
      m.round === round && !picks[m.matchupId] &&
      m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder
    );

  // Check if a round has any resolved matchups (for reroll)
  const roundHasResolved = (round) =>
    Object.values(allMatchups).some(m => m.round === round && picks[m.matchupId]);

  const finals = allMatchups['finals'];
  const champion = finals && picks['finals']
    ? (picks['finals'] === 'top' ? finals.topTeam : finals.bottomTeam)
    : null;
  const finalsResult = seriesResults['finals'];
  const finalsLoser = finalsResult?.loser;

  // Conference champions
  const westChamp = allMatchups['r3-west'] && picks['r3-west']
    ? (picks['r3-west'] === 'top' ? allMatchups['r3-west'].topTeam : allMatchups['r3-west'].bottomTeam)
    : null;
  const eastChamp = allMatchups['r3-east'] && picks['r3-east']
    ? (picks['r3-east'] === 'top' ? allMatchups['r3-east'].topTeam : allMatchups['r3-east'].bottomTeam)
    : null;

  const simChamps = useMemo(() => {
    if (!simResults) return [];
    return Object.entries(simResults.champCounts)
      .map(([slug, count]) => ({ slug, name: slugToName[slug] || slug.toUpperCase(), pct: Math.round(count / simResults.numSims * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct).slice(0, 10);
  }, [simResults]);

  const confChamps = useMemo(() => {
    if (!simResults) return null;
    const fmt = (counts) => Object.entries(counts)
      .map(([slug, count]) => ({ slug, name: slugToName[slug] || slug, pct: Math.round(count / simResults.numSims * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct).slice(0, 4);
    return { west: fmt(simResults.confChampCounts.Western || {}), east: fmt(simResults.confChampCounts.Eastern || {}) };
  }, [simResults]);

  // Round header with dice CTA
  function RoundHeader({ label, round, gold }) {
    const canSim = roundHasResolvable(round);
    const canReroll = roundHasResolved(round);
    return (
      <div className={`${styles.roundHeader} ${gold ? styles.roundHeaderGold : ''}`}>
        <span className={styles.roundHeaderLabel}>{label}</span>
        {(canSim || canReroll) && (
          <button type="button" className={styles.diceBtn} onClick={() => handleSimRound(round)}
            title={canReroll ? 'Reroll this round' : 'Simulate this round'}>
            <span className={styles.diceIcon}>{'\uD83C\uDFB2'}</span>
            <span>{canReroll ? 'Reroll' : 'Simulate'}</span>
          </button>
        )}
      </div>
    );
  }

  function renderCol(conference, round, className) {
    const matchups = getMatchups(conference, round);
    return (
      <div className={`${styles.col} ${className || ''}`}>
        {matchups.map(m => (
          <SeriesCard key={m.matchupId} matchup={m} result={seriesResults[m.matchupId]}
            prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Hero */}
      <header className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <img src="/nba-logo.png" alt="" className={styles.heroLogo} />
            <div>
              <span className={styles.heroEyebrow}>2026 NBA Playoffs</span>
              <h1 className={styles.heroTitle}>NBA Bracketology</h1>
            </div>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.btn} onClick={handleMaximus}>
              {'\uD83C\uDFB2'} Maximus&rsquo;s Picks
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGold}`}
              onClick={handleSimBracket} disabled={simRunning}>
              {simRunning ? 'Simulating\u2026' : 'Simulate Bracket'}
            </button>
            <button type="button" className={styles.btnGhost} onClick={handleClear}>Clear</button>
          </div>
        </div>
      </header>

      {/* Conference Labels */}
      <div className={styles.confRow}>
        <span className={styles.confLabel}><img src="/nba-west-logo.png" alt="" className={styles.confIcon} /> WESTERN CONFERENCE</span>
        <span className={styles.confLabel}>EASTERN CONFERENCE <img src="/nba-east-logo.png" alt="" className={styles.confIcon} /></span>
      </div>

      {/* Round Headers */}
      <div className={styles.roundHeaderRow}>
        <RoundHeader label="1st Round" round={1} />
        <RoundHeader label="Conf. Semis" round={2} />
        <RoundHeader label="Conf. Finals" round={3} />
        <RoundHeader label="NBA Finals" round={4} gold />
        <RoundHeader label="Conf. Finals" round={3} />
        <RoundHeader label="Conf. Semis" round={2} />
        <RoundHeader label="1st Round" round={1} />
      </div>

      {/* Bracket */}
      <div className={styles.bracketScroll}>
        <div className={styles.bracket}>
          {renderCol('Western', 1)}
          {renderCol('Western', 2, styles.colR2)}
          {renderCol('Western', 3, styles.colCF)}

          {/* Finals Center */}
          <div className={styles.finalsCol}>
            <div className={styles.finalsGlow} />

            {/* Conference champ trophies */}
            <div className={styles.confChampBadges}>
              {westChamp && !westChamp.isPlaceholder && (
                <div className={styles.confChampBadge}>
                  {westChamp.logo && <img src={westChamp.logo} alt="" className={styles.confChampBadgeLogo} />}
                  <span className={styles.confChampBadgeText}>West Champ</span>
                </div>
              )}
              {eastChamp && !eastChamp.isPlaceholder && (
                <div className={styles.confChampBadge}>
                  {eastChamp.logo && <img src={eastChamp.logo} alt="" className={styles.confChampBadgeLogo} />}
                  <span className={styles.confChampBadgeText}>East Champ</span>
                </div>
              )}
            </div>

            <div className={styles.finalsCenter}>
              <img src="/nba-finals-logo.svg" alt="NBA Finals" className={styles.finalsLogo} />
              <span className={styles.finalsTag}>NBA Finals</span>
            </div>

            {finals && <SeriesCard matchup={finals} result={seriesResults['finals']}
              prediction={predictions['finals']} userPick={picks['finals']} onPick={handlePick} />}

            {champion && !champion.isPlaceholder && (
              <div className={styles.champ}>
                {champion.logo && <img src={champion.logo} alt="" className={styles.champLogo} />}
                <span className={styles.champTrophy}>{'\uD83C\uDFC6'}</span>
                <span className={styles.champName}>{champion.shortName || champion.name}</span>
                {finalsResult && finalsLoser && (
                  <span className={styles.champResult}>
                    def. {finalsLoser.shortName || finalsLoser.name} {finalsResult.seriesScore}
                  </span>
                )}
                <span className={styles.champLabel}>NBA Champion</span>
              </div>
            )}

            {/* Simulate Finals CTA */}
            {roundHasResolvable(4) && (
              <button type="button" className={styles.diceBtn} onClick={() => handleSimRound(4)}>
                <span className={styles.diceIcon}>{'\uD83C\uDFB2'}</span>
                <span>Simulate Finals</span>
              </button>
            )}
          </div>

          {renderCol('Eastern', 3, styles.colCF)}
          {renderCol('Eastern', 2, styles.colR2)}
          {renderCol('Eastern', 1)}
        </div>
      </div>

      {/* Simulation Results */}
      {simResults && (
        <section className={styles.simPanel}>
          <div className={styles.simHeader}>
            <h2 className={styles.simTitle}>Championship Probabilities</h2>
            <span className={styles.simRuns}>{simResults.numSims.toLocaleString()} simulations</span>
          </div>
          <div className={styles.simGrid}>
            {simChamps.map(({ slug, name, pct }, i) => (
              <div key={slug} className={`${styles.simRow} ${i === 0 ? styles.simRowTop : ''}`}>
                <span className={styles.simRank}>{i + 1}</span>
                <img src={getNbaEspnLogoUrl(slug)} alt="" className={styles.simLogo} />
                <span className={styles.simName}>{name}</span>
                <span className={styles.simPct}>{pct}%</span>
                <div className={styles.simBar}><div className={styles.simFill} style={{ width: `${Math.min(pct / (simChamps[0]?.pct || 1) * 100, 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {confChamps && (
            <div className={styles.confChampsRow}>
              <div className={styles.confChampCard}>
                <span className={styles.confChampCardLabel}>West Champion</span>
                {confChamps.west.slice(0, 3).map(t => (
                  <div key={t.slug} className={styles.confChampCardTeam}>
                    <img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.confChampCardLogo} />
                    <span>{t.name}</span><span className={styles.confChampCardPct}>{t.pct}%</span>
                  </div>
                ))}
              </div>
              <div className={styles.confChampCard}>
                <span className={styles.confChampCardLabel}>East Champion</span>
                {confChamps.east.slice(0, 3).map(t => (
                  <div key={t.slug} className={styles.confChampCardTeam}>
                    <img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.confChampCardLogo} />
                    <span>{t.name}</span><span className={styles.confChampCardPct}>{t.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * NBA Bracketology — premium dark-mode playoff bracket.
 * West left, East right, NBA Finals center.
 * Championship metallic gold on smoked black glass.
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
const slugToFull = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t.name]));
const slugToRecord = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t.record || '']));

/* ── Helpers ── */
function getDownstream(matchupId, bracket) {
  const ds = new Set();
  const q = [matchupId];
  while (q.length > 0) {
    const cur = q.pop();
    for (const [id, m] of Object.entries(bracket)) {
      if ((m.topSourceId === cur || m.bottomSourceId === cur) && !ds.has(id)) { ds.add(id); q.push(id); }
    }
  }
  return ds;
}

/* ── Series Card ── */
function SeriesCard({ matchup, result, prediction, userPick, onPick, emphasis }) {
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
    onPick(matchupId, pos);
  }

  return (
    <div className={`${styles.card} ${isWaiting ? styles.cardWaiting : ''} ${isResolved ? styles.cardResolved : ''} ${emphasis ? styles.cardEmphasis : ''}`}>
      {spread && <span className={styles.spread}>{spread}</span>}
      <button type="button" className={`${styles.slot} ${topPicked ? styles.slotWinner : ''} ${btmPicked ? styles.slotLoser : ''}`}
        onClick={() => pick('top')} disabled={isWaiting || topTeam?.isPlaceholder}>
        {topTeam?.logo && <img src={topTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{topTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{topTeam?.shortName || topTeam?.name || 'TBD'}</span>
        {result && <span className={`${styles.sw} ${topPicked ? styles.swA : ''}`}>{result.topWins}</span>}
      </button>
      <button type="button" className={`${styles.slot} ${btmPicked ? styles.slotWinner : ''} ${topPicked ? styles.slotLoser : ''}`}
        onClick={() => pick('bottom')} disabled={isWaiting || bottomTeam?.isPlaceholder}>
        {bottomTeam?.logo && <img src={bottomTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{bottomTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{bottomTeam?.shortName || bottomTeam?.name || 'TBD'}</span>
        {result && <span className={`${styles.sw} ${btmPicked ? styles.swA : ''}`}>{result.bottomWins}</span>}
      </button>
      <div className={styles.cardFoot}>
        {result?.seriesCall ? <span className={styles.resultBadge}>{result.seriesCall}</span>
          : prediction ? <span className={styles.predBadge}>{prediction.seriesCall}</span> : null}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function NbaBracketology() {
  const [picks, setPicks] = useState({});
  const [seriesResults, setSeriesResults] = useState({});
  const [predictions, setPredictions] = useState({});
  const [odds, setOdds] = useState({});
  const [simResults, setSimResults] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [playInResults, setPlayInResults] = useState(null);

  useEffect(() => { fetchNbaChampionshipOdds().then(d => setOdds(d.odds || {})).catch(() => {}); }, []);

  const context = useMemo(() => ({ championshipOdds: odds }), [odds]);
  const rawBracketBase = useMemo(() => buildFullNbaBracket(), []);
  const rawBracket = useMemo(() => playInResults ? applyPlayInToBracket(rawBracketBase, playInResults) : rawBracketBase, [rawBracketBase, playInResults]);
  const allMatchups = useMemo(() => applyPicksToBracket(rawBracket, picks), [rawBracket, picks]);

  const ensurePlayInResolved = useCallback(() => {
    if (!hasUnresolvedPlayIn(rawBracket)) return rawBracket;
    const pi = { western: resolvePlayIn('western', context), eastern: resolvePlayIn('eastern', context) };
    setPlayInResults(pi);
    return applyPlayInToBracket(rawBracketBase, pi);
  }, [rawBracket, rawBracketBase, context]);

  useEffect(() => {
    const { predictions: p } = resolveFullNbaBracket(allMatchups, context);
    setPredictions(p);
  }, [allMatchups, context]);

  const handlePick = useCallback((matchupId, position) => {
    const ds = getDownstream(matchupId, rawBracket);
    setPicks(prev => { const n = { ...prev }; for (const id of ds) delete n[id]; n[matchupId] = position; return n; });
    setSeriesResults(prev => {
      const n = { ...prev }; for (const id of ds) delete n[id];
      const cur = applyPicksToBracket(rawBracket, { ...picks, [matchupId]: position });
      const m = cur[matchupId];
      if (m?.topTeam && m?.bottomTeam && !m.topTeam.isPlaceholder && !m.bottomTeam.isPlaceholder) {
        const o = sampleSeriesOutcome(position === 'top' ? m.topTeam : m.bottomTeam, position === 'top' ? m.bottomTeam : m.topTeam, context);
        if (o) { const wt = position === 'top'; n[matchupId] = { ...o, topWins: wt ? 4 : o.bottomWins, bottomWins: wt ? o.bottomWins : 4, seriesCall: `${(wt ? m.topTeam : m.bottomTeam).shortName} in ${4 + o.bottomWins}`, seriesScore: `4-${o.bottomWins}` }; }
      }
      return n;
    });
  }, [rawBracket, picks, context]);

  const handleSimRound = useCallback((round) => {
    const base = round === 1 ? ensurePlayInResolved() : rawBracket;
    const cur = applyPicksToBracket(base, picks);
    const rids = Object.values(cur).filter(m => m.round === round).map(m => m.matchupId);
    const toClear = new Set(rids);
    for (const mid of rids) for (const id of getDownstream(mid, base)) toClear.add(id);
    const cp = { ...picks }, cr = { ...seriesResults };
    for (const id of toClear) { delete cp[id]; delete cr[id]; }
    const fb = applyPicksToBracket(base, cp);
    const { picks: rp, results: rr } = simulateRound(fb, round, context);
    setPicks({ ...cp, ...rp }); setSeriesResults({ ...cr, ...rr });
  }, [rawBracket, picks, seriesResults, context, ensurePlayInResolved]);

  const handleSimBracket = useCallback(() => {
    setSimRunning(true);
    setTimeout(() => {
      const base = ensurePlayInResolved();
      const { picks: np, results: nr } = simulateRemainingBracket(base, picks, applyPicksToBracket, context);
      setPicks(np); setSeriesResults(prev => ({ ...prev, ...nr }));
      setSimResults(simulateNbaBracket(base, context, 1000));
      setSimRunning(false);
    }, 50);
  }, [rawBracket, picks, context, ensurePlayInResolved]);

  const handleRerollBracket = useCallback(() => {
    // Full reroll: clear everything and re-simulate
    const base = ensurePlayInResolved();
    setSimRunning(true);
    setTimeout(() => {
      const { picks: np, results: nr } = simulateRemainingBracket(base, {}, applyPicksToBracket, context);
      setPicks(np); setSeriesResults(nr);
      setSimResults(simulateNbaBracket(base, context, 1000));
      setSimRunning(false);
    }, 50);
  }, [rawBracketBase, context, ensurePlayInResolved]);

  const handleClear = useCallback(() => { setPicks({}); setSeriesResults({}); setSimResults(null); setPlayInResults(null); }, []);

  const handleMaximus = useCallback(() => {
    const cur = applyPicksToBracket(rawBracket, picks);
    for (let r = 1; r <= 4; r++) {
      if (Object.values(cur).some(m => m.round === r && !picks[m.matchupId] && m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder)) { handleSimRound(r); return; }
    }
  }, [rawBracket, picks, handleSimRound]);

  const getM = (c, r) => Object.values(allMatchups).filter(m => m.conference === c && m.round === r).sort((a, b) => a.position - b.position);
  const roundResolvable = (r) => Object.values(allMatchups).some(m => m.round === r && !picks[m.matchupId] && m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder);
  const roundResolved = (r) => Object.values(allMatchups).some(m => m.round === r && picks[m.matchupId]);

  const finals = allMatchups['finals'];
  const champion = finals && picks['finals'] ? (picks['finals'] === 'top' ? finals.topTeam : finals.bottomTeam) : null;
  const finalsResult = seriesResults['finals'];
  const westChamp = allMatchups['r3-west'] && picks['r3-west'] ? (picks['r3-west'] === 'top' ? allMatchups['r3-west'].topTeam : allMatchups['r3-west'].bottomTeam) : null;
  const eastChamp = allMatchups['r3-east'] && picks['r3-east'] ? (picks['r3-east'] === 'top' ? allMatchups['r3-east'].topTeam : allMatchups['r3-east'].bottomTeam) : null;

  // Is the full bracket complete?
  const totalMatchups = Object.values(allMatchups).length;
  const totalPicked = Object.keys(picks).length;
  const bracketComplete = totalPicked >= 15; // 8 R1 + 4 R2 + 2 R3 + 1 Finals

  const simChamps = useMemo(() => {
    if (!simResults) return [];
    return Object.entries(simResults.champCounts).map(([slug, count]) => ({ slug, name: slugToName[slug] || slug.toUpperCase(), pct: Math.round(count / simResults.numSims * 1000) / 10 })).sort((a, b) => b.pct - a.pct).slice(0, 10);
  }, [simResults]);

  const confChamps = useMemo(() => {
    if (!simResults) return null;
    const f = (c) => Object.entries(c).map(([s, n]) => ({ slug: s, name: slugToName[s] || s, pct: Math.round(n / simResults.numSims * 1000) / 10 })).sort((a, b) => b.pct - a.pct).slice(0, 4);
    return { west: f(simResults.confChampCounts.Western || {}), east: f(simResults.confChampCounts.Eastern || {}) };
  }, [simResults]);

  // Generate narrative commentary
  const narrative = useMemo(() => {
    if (!simResults || simChamps.length === 0) return null;
    const top = simChamps[0];
    const topFull = slugToFull[top.slug] || top.name;
    const second = simChamps[1];
    const westTop = confChamps?.west?.[0];
    const eastTop = confChamps?.east?.[0];

    // Find biggest upset threat (low seed with >5% title probability)
    const upset = simChamps.find(t => {
      const team = NBA_TEAMS.find(x => x.slug === t.slug);
      return team && (team.seed || 99) >= 4 && t.pct >= 5;
    });

    const lines = [];
    lines.push(`The **${topFull}** lead the title race at **${top.pct}%** across ${simResults.numSims.toLocaleString()} simulations \u2014 their ${NBA_TEAMS.find(t => t.slug === top.slug)?.record || ''} record and top-seed positioning give them the most favorable bracket path.`);

    if (second) lines.push(`**${slugToFull[second.slug] || second.name}** trail at ${second.pct}%, making this a ${top.pct - second.pct > 10 ? 'clear frontrunner race' : 'competitive two-horse battle'} for the Larry O\u2019Brien Trophy.`);

    if (westTop && eastTop) lines.push(`The model\u2019s most likely Finals matchup: **${slugToFull[westTop.slug] || westTop.name}** (${westTop.pct}% to win the West) vs. **${slugToFull[eastTop.slug] || eastTop.name}** (${eastTop.pct}% to win the East).`);

    if (upset) lines.push(`Upset watch: the **${slugToFull[upset.slug] || upset.name}** carry ${upset.pct}% title equity despite a lower seed \u2014 a testament to their late-season form and matchup potential.`);

    lines.push(`These probabilities reflect seed, regular-season record, championship futures market, and home-court advantage across a best-of-7 format where higher seeds hold a structural edge.`);

    return lines;
  }, [simResults, simChamps, confChamps]);

  function RoundHeader({ label, round, gold }) {
    const canSim = roundResolvable(round);
    const canReroll = roundResolved(round);
    return (
      <div className={`${styles.rh} ${gold ? styles.rhGold : ''}`}>
        <span className={styles.rhLabel}>{label}</span>
        {(canSim || canReroll) && (
          <button type="button" className={styles.dice} onClick={() => handleSimRound(round)}>
            {'\uD83C\uDFB2'} {canReroll ? 'Reroll' : 'Simulate'}
          </button>
        )}
      </div>
    );
  }

  function Col({ conference, round, className }) {
    const ms = getM(conference, round);
    return (
      <div className={`${styles.col} ${className || ''}`}>
        {ms.map(m => <SeriesCard key={m.matchupId} matchup={m} result={seriesResults[m.matchupId]} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} emphasis={round >= 3} />)}
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
            {bracketComplete ? (
              <button type="button" className={`${styles.btn} ${styles.btnGold}`} onClick={handleRerollBracket} disabled={simRunning}>
                {'\uD83C\uDFB2'} Re-roll Bracket
              </button>
            ) : (
              <>
                <button type="button" className={styles.btn} onClick={handleMaximus}>
                  {'\uD83C\uDFB2'} Maximus&rsquo;s Picks
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnGold}`} onClick={handleSimBracket} disabled={simRunning}>
                  {simRunning ? 'Simulating\u2026' : 'Simulate Bracket'}
                </button>
              </>
            )}
            <button type="button" className={styles.btnGhost} onClick={handleClear}>Clear</button>
            {bracketComplete && <span className={styles.completePill}>Simulation Complete</span>}
          </div>
        </div>
      </header>

      {/* Conference + Round Headers */}
      <div className={styles.confRow}>
        <span className={styles.confLabel}><img src="/nba-west-logo.png" alt="" className={styles.confIcon} /> WESTERN CONFERENCE</span>
        <span className={styles.confLabel}>EASTERN CONFERENCE <img src="/nba-east-logo.png" alt="" className={styles.confIcon} /></span>
      </div>
      <div className={styles.rhRow}>
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
          <Col conference="Western" round={1} />
          <Col conference="Western" round={2} className={styles.colR2} />
          <Col conference="Western" round={3} className={styles.colCF} />

          {/* Finals Center */}
          <div className={styles.finalsCol}>
            <div className={styles.finalsGlow} />
            <div className={styles.confBadges}>
              {westChamp && !westChamp.isPlaceholder && <div className={styles.confBadge}>{westChamp.logo && <img src={westChamp.logo} alt="" className={styles.confBadgeLogo} />}<span>West</span></div>}
              {eastChamp && !eastChamp.isPlaceholder && <div className={styles.confBadge}>{eastChamp.logo && <img src={eastChamp.logo} alt="" className={styles.confBadgeLogo} />}<span>East</span></div>}
            </div>
            <div className={styles.finalsCenter}>
              <img src="/nba-finals-logo.png" alt="NBA Finals" className={styles.finalsLogo} />
            </div>
            {finals && <SeriesCard matchup={finals} result={seriesResults['finals']} prediction={predictions['finals']} userPick={picks['finals']} onPick={handlePick} emphasis />}
            {champion && !champion.isPlaceholder && (
              <div className={styles.champ}>
                {champion.logo && <img src={champion.logo} alt="" className={styles.champLogo} />}
                <span className={styles.champTrophy}>{'\uD83C\uDFC6'}</span>
                <span className={styles.champName}>{champion.shortName || champion.name}</span>
                {finalsResult?.loser && <span className={styles.champResult}>def. {finalsResult.loser.shortName || finalsResult.loser.name} {finalsResult.seriesScore}</span>}
                <span className={styles.champLabel}>NBA Champion</span>
              </div>
            )}
            {roundResolvable(4) && <button type="button" className={styles.dice} onClick={() => handleSimRound(4)}>{'\uD83C\uDFB2'} Simulate Finals</button>}
          </div>

          <Col conference="Eastern" round={3} className={styles.colCF} />
          <Col conference="Eastern" round={2} className={styles.colR2} />
          <Col conference="Eastern" round={1} />
        </div>
      </div>

      {/* Analytics Section */}
      {simResults && (
        <section className={styles.analytics}>
          {/* Bracket Pulse */}
          {narrative && (
            <div className={styles.pulse}>
              <h2 className={styles.pulseTitle}>Bracket Pulse</h2>
              <div className={styles.pulseBody}>
                {narrative.map((line, i) => (
                  <p key={i} className={styles.pulseLine} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                ))}
              </div>
            </div>
          )}

          {/* Title Race */}
          <div className={styles.titleRace}>
            <div className={styles.trHeader}>
              <h2 className={styles.trTitle}>Title Race</h2>
              <span className={styles.trSub}>Championship probability from {simResults.numSims.toLocaleString()} bracket simulations</span>
            </div>
            <div className={styles.trGrid}>
              {simChamps.map(({ slug, name, pct }, i) => (
                <div key={slug} className={`${styles.trRow} ${i === 0 ? styles.trRowTop : ''}`}>
                  <span className={styles.trRank}>{i + 1}</span>
                  <img src={getNbaEspnLogoUrl(slug)} alt="" className={styles.trLogo} />
                  <span className={styles.trName}>{name}</span>
                  <span className={styles.trPct}>{pct}%</span>
                  <div className={styles.trBar}><div className={styles.trFill} style={{ width: `${Math.min(pct / (simChamps[0]?.pct || 1) * 100, 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Conference Outlook */}
          {confChamps && (
            <div className={styles.confOutlook}>
              <h2 className={styles.coTitle}>Conference Outlook</h2>
              <div className={styles.coGrid}>
                <div className={styles.coCard}>
                  <span className={styles.coCardLabel}><img src="/nba-west-logo.png" alt="" className={styles.coCardIcon} /> Western Conference Champion</span>
                  {confChamps.west.slice(0, 4).map(t => (
                    <div key={t.slug} className={styles.coTeam}><img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.coTeamLogo} /><span>{t.name}</span><span className={styles.coTeamPct}>{t.pct}%</span></div>
                  ))}
                </div>
                <div className={styles.coCard}>
                  <span className={styles.coCardLabel}><img src="/nba-east-logo.png" alt="" className={styles.coCardIcon} /> Eastern Conference Champion</span>
                  {confChamps.east.slice(0, 4).map(t => (
                    <div key={t.slug} className={styles.coTeam}><img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.coTeamLogo} /><span>{t.name}</span><span className={styles.coTeamPct}>{t.pct}%</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Model Reasoning */}
          <div className={styles.reasoning}>
            <h2 className={styles.reasonTitle}>Why Maximus Landed Here</h2>
            <p className={styles.reasonBody}>
              The Maximus playoff model weighs four core factors across each best-of-7 series: <strong>regular-season record</strong> (30%), <strong>championship futures market</strong> (35%), <strong>seeding and home-court advantage</strong> (25%), and <strong>bracket path difficulty</strong> (10%). Higher seeds carry a compounding edge in a seven-game format — the gap between a 55% single-game probability and a 50/50 coin flip translates to roughly a 70/30 series split. Teams with shorter championship odds in the betting market receive a proportional boost, reflecting the sharpest money in the sports betting ecosystem.
            </p>
            <p className={styles.reasonBody}>
              Simulations are probabilistic, not deterministic — each run samples game outcomes weighted by these factors, producing a distribution of plausible playoff paths. The title probability percentages represent how often each team wins the championship across all simulated brackets, accounting for the full variance of upset potential and bracket luck.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

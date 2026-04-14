/**
 * NBA Bracketology — playoff bracket visualization and simulation.
 *
 * West on left, East on right, NBA Finals in center.
 * Each matchup is a best-of-7 series with predictions.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { NBA_PLAYOFF_YEAR, ROUND_LABELS } from '../../config/nbaBracketology';
import { buildFullNbaBracket, applyPicksToBracket } from '../../data/nba/playoffBracket';
import { resolveFullNbaBracket, resolveNbaSeries, simulateNbaBracket } from '../../utils/nbaSeriesResolver';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import NbaSeriesCard from '../../components/nba-bracket/NbaSeriesCard';
import styles from './NbaBracketology.module.css';

export default function NbaBracketology() {
  const { workspace } = useWorkspace();
  const [picks, setPicks] = useState({});
  const [predictions, setPredictions] = useState({});
  const [odds, setOdds] = useState({});
  const [simResults, setSimResults] = useState(null);
  const [simRunning, setSimRunning] = useState(false);

  // Load championship odds for enrichment
  useEffect(() => {
    fetchNbaChampionshipOdds()
      .then(d => setOdds(d.odds || {}))
      .catch(() => {});
  }, []);

  const context = useMemo(() => ({ championshipOdds: odds }), [odds]);

  // Build bracket with picks applied
  const rawBracket = useMemo(() => buildFullNbaBracket(), []);
  const allMatchups = useMemo(() => applyPicksToBracket(rawBracket, picks), [rawBracket, picks]);

  // Auto-resolve predictions when odds load
  useEffect(() => {
    if (Object.keys(odds).length === 0) return;
    const { predictions: preds } = resolveFullNbaBracket(allMatchups, context);
    setPredictions(preds);
  }, [odds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePick = useCallback((matchupId, position) => {
    setPicks(prev => {
      const next = { ...prev, [matchupId]: position };
      // Clear downstream picks that depended on this matchup
      const toCheck = [matchupId];
      const cleared = new Set();
      while (toCheck.length > 0) {
        const current = toCheck.pop();
        for (const [id, m] of Object.entries(rawBracket)) {
          if ((m.topSourceId === current || m.bottomSourceId === current) && !cleared.has(id)) {
            delete next[id];
            cleared.add(id);
            toCheck.push(id);
          }
        }
      }
      return next;
    });
  }, [rawBracket]);

  const handleSimulate = useCallback(() => {
    setSimRunning(true);
    // Run in a timeout to not block UI
    setTimeout(() => {
      const results = simulateNbaBracket(allMatchups, context, 1000);
      setSimResults(results);
      setSimRunning(false);
    }, 50);
  }, [allMatchups, context]);

  const handleAutoFill = useCallback(() => {
    const { picks: modelPicks } = resolveFullNbaBracket(allMatchups, context);
    setPicks(modelPicks);
  }, [allMatchups, context]);

  // Get matchups for each conference and round
  const getMatchups = (conference, round) => {
    return Object.values(allMatchups)
      .filter(m => m.conference === conference && m.round === round)
      .sort((a, b) => a.position - b.position);
  };

  const finals = allMatchups['finals'];
  const champion = finals && picks['finals']
    ? (picks['finals'] === 'top' ? finals.topTeam : finals.bottomTeam)
    : null;

  // Simulation results sorted
  const simChamps = useMemo(() => {
    if (!simResults) return [];
    return Object.entries(simResults.champCounts)
      .map(([slug, count]) => ({
        slug,
        pct: Math.round(count / simResults.numSims * 1000) / 10,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [simResults]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.pageTitle}>NBA Playoffs Bracket {NBA_PLAYOFF_YEAR}</h1>
          <div className={styles.headerActions}>
            <button type="button" className={styles.actionBtn} onClick={handleAutoFill}>
              Maximus Picks
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={handleSimulate} disabled={simRunning}>
              {simRunning ? 'Simulating...' : 'Simulate (1K)'}
            </button>
            <button type="button" className={styles.actionBtnMuted} onClick={() => setPicks({})}>
              Clear
            </button>
          </div>
        </div>
        {/* Round labels */}
        <div className={styles.roundHeaders}>
          <span className={styles.roundLabel}>1st Round</span>
          <span className={styles.roundLabel}>Conf. Semis</span>
          <span className={styles.roundLabel}>Conf. Finals</span>
          <span className={styles.roundLabelCenter}>NBA Finals</span>
          <span className={styles.roundLabel}>Conf. Finals</span>
          <span className={styles.roundLabel}>Conf. Semis</span>
          <span className={styles.roundLabel}>1st Round</span>
        </div>
      </header>

      {/* Bracket */}
      <div className={styles.bracketContainer}>
        {/* Conference labels */}
        <div className={styles.confLabels}>
          <div className={styles.confLabelLeft}>
            <img src="/nba-west-logo.png" alt="" className={styles.confLogo} />
            <span>WESTERN CONFERENCE</span>
          </div>
          <div className={styles.confLabelRight}>
            <span>EASTERN CONFERENCE</span>
            <img src="/nba-east-logo.png" alt="" className={styles.confLogo} />
          </div>
        </div>

        <div className={styles.bracketGrid}>
          {/* West R1 */}
          <div className={styles.roundCol}>
            {getMatchups('Western', 1).map(m => (
              <NbaSeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]}
                userPick={picks[m.matchupId]} onPick={handlePick} />
            ))}
          </div>

          {/* West R2 */}
          <div className={`${styles.roundCol} ${styles.roundColSpaced}`}>
            {getMatchups('Western', 2).map(m => (
              <NbaSeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]}
                userPick={picks[m.matchupId]} onPick={handlePick} />
            ))}
          </div>

          {/* West Conf Finals */}
          <div className={`${styles.roundCol} ${styles.roundColWide}`}>
            {getMatchups('Western', 3).map(m => (
              <NbaSeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]}
                userPick={picks[m.matchupId]} onPick={handlePick} />
            ))}
          </div>

          {/* NBA Finals (center) */}
          <div className={styles.finalsCol}>
            <div className={styles.finalsHeader}>
              <span className={styles.finalsLabel}>Championship</span>
            </div>
            {finals && (
              <NbaSeriesCard matchup={finals} prediction={predictions['finals']}
                userPick={picks['finals']} onPick={handlePick} />
            )}
            {champion && !champion.isPlaceholder && (
              <div className={styles.championDisplay}>
                {champion.logo && <img src={champion.logo} alt="" className={styles.champLogo} />}
                <div className={styles.champTrophy}>{'\uD83C\uDFC6'}</div>
                <span className={styles.champName}>{champion.shortName || champion.name}</span>
              </div>
            )}
          </div>

          {/* East Conf Finals */}
          <div className={`${styles.roundCol} ${styles.roundColWide}`}>
            {getMatchups('Eastern', 3).map(m => (
              <NbaSeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]}
                userPick={picks[m.matchupId]} onPick={handlePick} />
            ))}
          </div>

          {/* East R2 */}
          <div className={`${styles.roundCol} ${styles.roundColSpaced}`}>
            {getMatchups('Eastern', 2).map(m => (
              <NbaSeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]}
                userPick={picks[m.matchupId]} onPick={handlePick} />
            ))}
          </div>

          {/* East R1 */}
          <div className={styles.roundCol}>
            {getMatchups('Eastern', 1).map(m => (
              <NbaSeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]}
                userPick={picks[m.matchupId]} onPick={handlePick} />
            ))}
          </div>
        </div>
      </div>

      {/* Simulation Results */}
      {simResults && (
        <section className={styles.simSection}>
          <h2 className={styles.simTitle}>Simulation Results ({simResults.numSims.toLocaleString()} runs)</h2>
          <div className={styles.simGrid}>
            {simChamps.map(({ slug, pct }) => {
              const logo = getNbaEspnLogoUrl(slug);
              return (
                <div key={slug} className={styles.simTeam}>
                  {logo && <img src={logo} alt="" className={styles.simLogo} />}
                  <span className={styles.simName}>{slug.toUpperCase()}</span>
                  <span className={styles.simPct}>{pct}%</span>
                  <div className={styles.simBar}>
                    <div className={styles.simBarFill} style={{ width: `${Math.min(pct * 2, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

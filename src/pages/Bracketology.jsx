/**
 * Bracketology — premium tournament bracket surface.
 *
 * Phase 2: Projected bracket mode with 64 pre-populated teams,
 * auto-switch to official ESPN data, manual vs Maximus comparison,
 * richer intelligence overlays, and polished interactions.
 *
 * Feature-gated to allowlisted emails.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../context/AuthContext';
import { useBracketData } from '../hooks/useBracketData';
import { useBracketPicks } from '../hooks/useBracketPicks';
import { buildFullBracket } from '../data/bracketData';
import { generateProjectedBracket } from '../data/projectedField';
import { resolveBracketMatchup, resolveFullBracket } from '../utils/bracketMatchupResolver';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { getSimulationStats } from '../utils/bracketSimulator';
import { getTournamentPhase, getActiveRound } from '../utils/tournamentHelpers';
import BracketLoading from '../components/bracketology/BracketLoading';
import BracketHero from '../components/bracketology/BracketHero';
import BracketControls from '../components/bracketology/BracketControls';
import BracketRegion from '../components/bracketology/BracketRegion';
import BracketFinalFour from '../components/bracketology/BracketFinalFour';
import BracketIntelStrip from '../components/bracketology/BracketIntelStrip';
import BracketCompare from '../components/bracketology/BracketCompare';
import BracketShareSummary from '../components/bracketology/BracketShareSummary';
import ShareButton from '../components/common/ShareButton';
import AuthGateModal from '../components/common/AuthGateModal';
import styles from './Bracketology.module.css';

export default function Bracketology() {
  const { user, loading: authLoading } = useAuth();
  const {
    bracket, loading: bracketLoading, bracketMode, isProjected, isOfficial, isPartialESPN, isFieldSet, refresh,
  } = useBracketData();
  const {
    picks, pickOrigins, saveStatus, lastSaved, loaded: picksLoaded,
    makePick, clearBracket, clearRound, applyMaximusPicks, resetToMaximus,
    simulateEntire, simulateRest, regeneratePicks,
    totalPicks, totalGames, progress, manualCount, maximusCount,
  } = useBracketPicks(bracket);

  const [modelContext, setModelContext] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [maximusPicks, setMaximusPicks] = useState({});
  const [showMinLoadTime, setShowMinLoadTime] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const [showShareSummary, setShowShareSummary] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const isGuest = !user;

  const requireAuth = useCallback((action) => {
    if (isGuest) {
      setShowAuthGate(true);
      return true;
    }
    return false;
  }, [isGuest]);

  useEffect(() => {
    const timer = setTimeout(() => setShowMinLoadTime(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadModelContext();
  }, []);

  async function loadModelContext() {
    try {
      const { odds } = await fetchChampionshipOdds();

      let rankMap = {};
      try {
        const rankRes = await fetch('/api/rankings');
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          const rankings = rankData?.rankings || [];
          for (const r of rankings) {
            const slug = r.teamName?.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
            if (slug && r.rank) rankMap[slug] = r.rank;
          }
        }
      } catch { /* rankings are optional enrichment */ }

      setModelContext({
        rankMap,
        championshipOdds: odds || {},
        atsBySlug: {},
      });
    } catch {
      setModelContext({ rankMap: {}, championshipOdds: {}, atsBySlug: {} });
    }
  }

  const allMatchups = useMemo(() => {
    if (!bracket?.regions) return {};
    return buildFullBracket(bracket.regions, picks);
  }, [bracket, picks]);

  useEffect(() => {
    if (!modelContext || !bracket?.regions) return;
    const newPredictions = {};
    for (const matchup of Object.values(allMatchups)) {
      if (!matchup.topTeam?.slug || !matchup.bottomTeam?.slug) continue;
      if (matchup.topTeam.isPlaceholder || matchup.bottomTeam.isPlaceholder) continue;
      newPredictions[matchup.matchupId] = resolveBracketMatchup(
        matchup.topTeam, matchup.bottomTeam, modelContext,
        { round: matchup.round },
      );
    }
    setPredictions(newPredictions);
  }, [allMatchups, modelContext]);

  useEffect(() => {
    if (!bracket || !modelContext) return;
    const { picks: maxPicks } = resolveFullBracket(bracket, modelContext, buildFullBracket);
    setMaximusPicks(maxPicks);
  }, [bracket, modelContext]);

  const handlePick = useCallback((matchupId, position) => {
    if (requireAuth()) return;
    makePick(matchupId, position, 'manual');
  }, [makePick, requireAuth]);

  const handleMaximusPick = useCallback((matchupId, position) => {
    if (requireAuth()) return;
    makePick(matchupId, position, 'maximus');
  }, [makePick, requireAuth]);

  const handlePopulateField = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleAutoFill = useCallback(() => {
    if (requireAuth()) return;
    if (!bracket || !modelContext) return;
    const { picks: maxPicksResult } = resolveFullBracket(bracket, modelContext, buildFullBracket);
    applyMaximusPicks(maxPicksResult);
  }, [bracket, modelContext, applyMaximusPicks, requireAuth]);

  const handleResetToMaximus = useCallback(() => {
    if (requireAuth()) return;
    if (!bracket || !modelContext) return;
    const { picks: maxPicksResult } = resolveFullBracket(bracket, modelContext, buildFullBracket);
    resetToMaximus(maxPicksResult);
  }, [bracket, modelContext, resetToMaximus, requireAuth]);

  const handleSimulateEntire = useCallback(() => {
    if (requireAuth()) return;
    if (!modelContext || isSimulating) return;
    setIsSimulating(true);
    const start = performance.now();
    requestAnimationFrame(() => {
      const result = simulateEntire(modelContext);
      if (result?.predictions) {
        setPredictions(prev => ({ ...prev, ...result.predictions }));
      }
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, 600 - elapsed);
      setTimeout(() => setIsSimulating(false), remaining);
    });
  }, [modelContext, simulateEntire, requireAuth, isSimulating]);

  const handleSimulateRest = useCallback(() => {
    if (requireAuth()) return;
    if (!modelContext) return;
    const result = simulateRest(modelContext);
    if (result?.predictions) {
      setPredictions(prev => ({ ...prev, ...result.predictions }));
    }
  }, [modelContext, simulateRest, requireAuth]);

  const handleRegeneratePicks = useCallback(() => {
    if (requireAuth()) return;
    if (!modelContext) return;
    const result = regeneratePicks(modelContext, predictions);
    if (result?.predictions) {
      setPredictions(prev => ({ ...prev, ...result.predictions }));
    }
  }, [modelContext, predictions, regeneratePicks, requireAuth]);

  const simStats = useMemo(() => {
    return getSimulationStats(predictions);
  }, [predictions]);

  const champion = useMemo(() => {
    const champ = allMatchups['champ'];
    if (!champ || !picks['champ']) return null;
    return picks['champ'] === 'top' ? champ.topTeam : champ.bottomTeam;
  }, [allMatchups, picks]);

  const championPrediction = predictions['champ'] || null;

  const activeRound = useMemo(() => {
    const phase = getTournamentPhase();
    return getActiveRound(phase);
  }, []);

  const isLoading = bracketLoading || showMinLoadTime;

  if (isLoading) return <BracketLoading />;

  const hasBracket = isFieldSet && bracket?.regions?.length > 0;

  return (
    <>
      <Helmet>
        <title>Bracketology — Maximus Sports</title>
        <meta name="description" content="Model-driven NCAA tournament bracket intelligence. Build your bracket with AI-powered picks." />
      </Helmet>

      <div className={styles.page}>
        <div className={styles.backgroundGlow} />
        <div className={styles.backgroundVignette} />

        <BracketHero
          bracketMode={bracketMode}
          totalPicks={totalPicks}
          totalGames={totalGames}
          progress={progress}
          manualCount={manualCount}
          maximusCount={maximusCount}
          champion={champion}
          championPrediction={championPrediction}
          hasBracket={hasBracket}
          isGuest={isGuest}
          onPopulateField={handlePopulateField}
          onAutoFill={handleAutoFill}
        />

        {hasBracket && (
          <>
            <BracketControls
              saveStatus={saveStatus}
              lastSaved={lastSaved}
              totalPicks={totalPicks}
              totalGames={totalGames}
              bracketMode={bracketMode}
              isGuest={isGuest}
              bracketMeta={{
                realTeamCount: bracket?.teamCount,
                lastUpdated: bracket?.lastUpdated,
                isPartial: isPartialESPN,
              }}
              onAutoFill={handleAutoFill}
              onResetToMaximus={handleResetToMaximus}
              onClearBracket={clearBracket}
              onClearRound={clearRound}
              onToggleCompare={() => setShowCompare(s => !s)}
              showCompare={showCompare}
              onSimulateEntire={handleSimulateEntire}
              isSimulating={isSimulating}
              onSimulateRest={handleSimulateRest}
              onRegeneratePicks={handleRegeneratePicks}
              simStats={simStats}
            />

            <BracketIntelStrip
              picks={picks}
              pickOrigins={pickOrigins}
              predictions={predictions}
              allMatchups={allMatchups}
              maximusPicks={maximusPicks}
            />

            {showCompare && (
              <BracketCompare
                picks={picks}
                pickOrigins={pickOrigins}
                maximusPicks={maximusPicks}
                predictions={predictions}
                allMatchups={allMatchups}
              />
            )}

            <div className={styles.bracketContainer}>
              <div className={styles.bracketGrid}>
                <div className={styles.leftBracket}>
                  {bracket.regions.slice(0, 2).map((region) => (
                    <BracketRegion
                      key={region.name}
                      region={region}
                      allMatchups={allMatchups}
                      picks={picks}
                      pickOrigins={pickOrigins}
                      predictions={predictions}
                      maximusPicks={maximusPicks}
                      onPick={handlePick}
                      onMaximusPick={handleMaximusPick}
                      showCompare={showCompare}
                      isGuest={isGuest}
                      activeRound={activeRound}
                      side="left"
                    />
                  ))}
                </div>

                <div className={styles.centerBracket}>
                  <BracketFinalFour
                    allMatchups={allMatchups}
                    picks={picks}
                    pickOrigins={pickOrigins}
                    predictions={predictions}
                    maximusPicks={maximusPicks}
                    onPick={handlePick}
                    onMaximusPick={handleMaximusPick}
                    showCompare={showCompare}
                    isGuest={isGuest}
                  />
                </div>

                <div className={styles.rightBracket}>
                  {bracket.regions.slice(2, 4).map((region) => (
                    <BracketRegion
                      key={region.name}
                      region={region}
                      allMatchups={allMatchups}
                      picks={picks}
                      pickOrigins={pickOrigins}
                      predictions={predictions}
                      maximusPicks={maximusPicks}
                      onPick={handlePick}
                      onMaximusPick={handleMaximusPick}
                      showCompare={showCompare}
                      isGuest={isGuest}
                      activeRound={activeRound}
                      side="right"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.bracketShare}>
              <button
                type="button"
                className={styles.shareSummaryBtn}
                onClick={() => setShowShareSummary(true)}
                disabled={totalPicks === 0}
              >
                Share My Bracket
              </button>
              <ShareButton
                shareType="bracket_bust"
                title="My March Madness Bracket"
                subtitle={picks?.championship ? `Champion: ${allMatchups?.[picks.championship]?.name || picks.championship}` : 'Build your bracket'}
                destinationPath="/bracketology"
                placement="bracketology_footer"
                label="Share Link"
                variant="primary"
              />
            </div>

            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.legendManual}>{'\u2713'}</span>
                <span>Manual Pick</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendMaximus}>{'\u25C6'}</span>
                <span>Maximus Pick</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendHighConviction}>{'\u25C6'}</span>
                <span>High Conviction</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDiceRoll}>{'\uD83C\uDFB2'}</span>
                <span>Dice Roll</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendUpsetSpecial}>{'\u26A0'}</span>
                <span>Upset Special</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendUpset}>!</span>
                <span>Upset</span>
              </div>
              {showCompare && (
                <div className={styles.legendItem}>
                  <span className={styles.legendDiverge}>DIFF</span>
                  <span>Diverges from Maximus</span>
                </div>
              )}
              {isProjected && (
                <div className={styles.legendItem}>
                  <span className={styles.legendProjected}>P</span>
                  <span>Projected Field</span>
                </div>
              )}
            </div>
          </>
        )}

        {showShareSummary && (
          <BracketShareSummary
            picks={picks}
            maximusPicks={maximusPicks}
            allMatchups={allMatchups}
            predictions={predictions}
            bracketMode={bracketMode}
            onClose={() => setShowShareSummary(false)}
          />
        )}

        {showAuthGate && (
          <AuthGateModal
            onClose={() => setShowAuthGate(false)}
            message="Create a free Maximus Sports account to save picks, simulate your bracket, and compete with friends."
          />
        )}
      </div>
    </>
  );
}

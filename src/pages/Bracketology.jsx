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
import { hasBracketologyAccess } from '../config/bracketology';
import { useBracketData } from '../hooks/useBracketData';
import { useBracketPicks } from '../hooks/useBracketPicks';
import { buildFullBracket } from '../data/bracketData';
import { resolveBracketMatchup, resolveFullBracket } from '../utils/bracketMatchupResolver';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import BracketLoading from '../components/bracketology/BracketLoading';
import BracketAccessDenied from '../components/bracketology/BracketAccessDenied';
import BracketHero from '../components/bracketology/BracketHero';
import BracketControls from '../components/bracketology/BracketControls';
import BracketRegion from '../components/bracketology/BracketRegion';
import BracketFinalFour from '../components/bracketology/BracketFinalFour';
import BracketIntelStrip from '../components/bracketology/BracketIntelStrip';
import BracketCompare from '../components/bracketology/BracketCompare';
import ShareButton from '../components/common/ShareButton';
import styles from './Bracketology.module.css';

export default function Bracketology() {
  const { user, loading: authLoading } = useAuth();
  const hasAccess = hasBracketologyAccess(user?.email);
  const {
    bracket, loading: bracketLoading, bracketMode, isProjected, isFieldSet, refresh,
  } = useBracketData();
  const {
    picks, pickOrigins, saveStatus, lastSaved, loaded: picksLoaded,
    makePick, clearBracket, clearRound, applyMaximusPicks, resetToMaximus,
    totalPicks, totalGames, progress, manualCount, maximusCount,
  } = useBracketPicks(bracket);

  const [modelContext, setModelContext] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [maximusPicks, setMaximusPicks] = useState({});
  const [showMinLoadTime, setShowMinLoadTime] = useState(true);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowMinLoadTime(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    loadModelContext();
  }, [hasAccess]);

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
    makePick(matchupId, position, 'manual');
  }, [makePick]);

  const handleMaximusPick = useCallback((matchupId, position) => {
    makePick(matchupId, position, 'maximus');
  }, [makePick]);

  const handleAutoFill = useCallback(() => {
    if (!bracket || !modelContext) return;
    const { picks: maxPicksResult } = resolveFullBracket(bracket, modelContext, buildFullBracket);
    applyMaximusPicks(maxPicksResult);
  }, [bracket, modelContext, applyMaximusPicks]);

  const handleResetToMaximus = useCallback(() => {
    if (!bracket || !modelContext) return;
    const { picks: maxPicksResult } = resolveFullBracket(bracket, modelContext, buildFullBracket);
    resetToMaximus(maxPicksResult);
  }, [bracket, modelContext, resetToMaximus]);

  const champion = useMemo(() => {
    const champ = allMatchups['champ'];
    if (!champ || !picks['champ']) return null;
    return picks['champ'] === 'top' ? champ.topTeam : champ.bottomTeam;
  }, [allMatchups, picks]);

  const championPrediction = predictions['champ'] || null;

  const isLoading = authLoading || bracketLoading || showMinLoadTime;

  if (isLoading) return <BracketLoading />;
  if (!hasAccess) return (
    <div className={styles.page}>
      <BracketAccessDenied />
    </div>
  );

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
        />

        {hasBracket && (
          <>
            <BracketControls
              saveStatus={saveStatus}
              lastSaved={lastSaved}
              totalPicks={totalPicks}
              totalGames={totalGames}
              bracketMode={bracketMode}
              onAutoFill={handleAutoFill}
              onResetToMaximus={handleResetToMaximus}
              onClearBracket={clearBracket}
              onClearRound={clearRound}
              onToggleCompare={() => setShowCompare(s => !s)}
              showCompare={showCompare}
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
                      side="right"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.bracketShare}>
              <ShareButton
                shareType="bracket_bust"
                title="My March Madness Bracket"
                subtitle={picks?.championship ? `Champion: ${allMatchups?.[picks.championship]?.name || picks.championship}` : 'Build your bracket'}
                destinationPath="/bracketology"
                placement="bracketology_footer"
                label="Share Bracket"
                variant="primary"
              />
            </div>

            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.legendManual}>✓</span>
                <span>Manual Pick</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendMaximus}>◆</span>
                <span>Maximus Pick</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendUpset}>!</span>
                <span>Upset</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendCoinFlip}>~</span>
                <span>Coin Flip</span>
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
      </div>
    </>
  );
}

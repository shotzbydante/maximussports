/**
 * Bracketology — premium tournament bracket surface.
 *
 * Feature-gated to allowlisted emails. Dark-mode cinematic experience
 * with full bracket, manual picks, and Maximus model-driven predictions.
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
import PreSelectionState from '../components/bracketology/PreSelectionState';
import styles from './Bracketology.module.css';

export default function Bracketology() {
  const { user, loading: authLoading } = useAuth();
  const hasAccess = hasBracketologyAccess(user?.email);
  const { bracket, loading: bracketLoading, isPreSelection, isFieldSet, refresh } = useBracketData();
  const {
    picks, pickOrigins, saveStatus, loaded: picksLoaded,
    makePick, clearBracket, clearRound, applyMaximusPicks,
    totalPicks, totalGames, progress,
  } = useBracketPicks(bracket);

  const [modelContext, setModelContext] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [showMinLoadTime, setShowMinLoadTime] = useState(true);

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

  const handlePick = useCallback((matchupId, position) => {
    makePick(matchupId, position, 'manual');
  }, [makePick]);

  const handleMaximusPick = useCallback((matchupId, position) => {
    makePick(matchupId, position, 'maximus');
  }, [makePick]);

  const handleAutoFill = useCallback(() => {
    if (!bracket || !modelContext) return;
    const { picks: maximusPicks, predictions: maximusPredictions } =
      resolveFullBracket(bracket, modelContext, buildFullBracket);
    applyMaximusPicks(maximusPicks, maximusPredictions);
  }, [bracket, modelContext, applyMaximusPicks]);

  const isLoading = authLoading || bracketLoading || showMinLoadTime;

  if (isLoading) return <BracketLoading />;
  if (!hasAccess) return (
    <div className={styles.page}>
      <BracketAccessDenied />
    </div>
  );

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
          isPreSelection={isPreSelection}
          totalPicks={totalPicks}
          totalGames={totalGames}
          progress={progress}
        />

        {isPreSelection ? (
          <PreSelectionState />
        ) : (
          <>
            <BracketControls
              saveStatus={saveStatus}
              totalPicks={totalPicks}
              totalGames={totalGames}
              isPreSelection={isPreSelection}
              onAutoFill={handleAutoFill}
              onClearBracket={clearBracket}
              onClearRound={clearRound}
            />

            <BracketIntelStrip
              picks={picks}
              pickOrigins={pickOrigins}
              predictions={predictions}
              allMatchups={allMatchups}
            />

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
                      onPick={handlePick}
                      onMaximusPick={handleMaximusPick}
                      isPreSelection={isPreSelection}
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
                    onPick={handlePick}
                    onMaximusPick={handleMaximusPick}
                    isPreSelection={isPreSelection}
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
                      onPick={handlePick}
                      onMaximusPick={handleMaximusPick}
                      isPreSelection={isPreSelection}
                      side="right"
                    />
                  ))}
                </div>
              </div>
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
                <span className={styles.legendUpset}>⚡</span>
                <span>Upset</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

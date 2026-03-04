import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchHomeFast, fetchHomeSlow, mergeHomeData } from '../api/home';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import CarouselComposer from '../components/dashboard/CarouselComposer';
import styles from './Dashboard.module.css';

const ADMIN_EMAIL = 'dantedicicco@gmail.com';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();

  const isAuthorized = !authLoading && user?.email === ADMIN_EMAIL;
  const isUnauthorized = !authLoading && (!user || user.email !== ADMIN_EMAIL);

  const [dashData, setDashData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { atsLeaders } = useAtsLeaders({ initialWindow: 'last30' });

  const exportRef = useRef(null);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [fast, slow] = await Promise.all([fetchHomeFast(), fetchHomeSlow()]);
      const merged = mergeHomeData(fast, slow);
      setDashData({ ...merged, atsLeaders: atsLeaders?.best?.length ? atsLeaders : merged.atsLeaders });
    } catch (err) {
      setDataError(err.message || 'Failed to load data');
    } finally {
      setDataLoading(false);
    }
  }, [atsLeaders]);

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = () => {
    setAssetsReady(false);
    setRefreshKey(k => k + 1);
  };

  const handleExport = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      let idx = 1;
      for (const slide of slides) {
        const dataUrl = await toPng(slide, {
          width: 1080,
          height: 1350,
          pixelRatio: 1,
          skipAutoScale: true,
          cacheBust: true,
        });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `maximus_daily_${idx}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        idx++;
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error('[Dashboard] Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className={styles.gateWrap}>
        <div className={styles.gateCard}>
          <div className={styles.spinner} />
          <p className={styles.gateSubtext}>Checking authorization…</p>
        </div>
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className={styles.gateWrap}>
        <div className={styles.gateCard}>
          <div className={styles.gateLockIcon}>🔒</div>
          <h1 className={styles.gateTitle}>Unauthorized</h1>
          <p className={styles.gateSubtext}>
            {user
              ? 'Your account does not have access to this page.'
              : 'You must be signed in to access this page.'}
          </p>
          <Link to="/settings" className={styles.gateBtn}>
            {user ? 'Go to Settings' : 'Sign In'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Creator Dashboard</h1>
          <span className={styles.badge}>Admin Only</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.templateSelect}>
            <label className={styles.controlLabel}>Template</label>
            <div className={styles.selectDisplay}>Daily Briefing (3 slides)</div>
          </div>
          <button
            className={styles.btnSecondary}
            onClick={handleRegenerate}
            disabled={dataLoading || exporting}
          >
            {dataLoading ? 'Loading…' : 'Regenerate'}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleExport}
            disabled={dataLoading || exporting || !dashData}
          >
            {exporting ? 'Exporting…' : 'Export Images'}
          </button>
        </div>
      </div>

      {assetsReady && !exporting && (
        <div className={styles.readyBadge}>✓ Ready to export</div>
      )}

      {dataError && (
        <div className={styles.errorBanner}>
          <strong>Data error:</strong> {dataError}
        </div>
      )}

      <div className={styles.previewArea}>
        {dataLoading || !dashData ? (
          <div className={styles.skeletonRow}>
            {[1, 2, 3].map(i => (
              <div key={i} className={styles.skeletonSlide} />
            ))}
          </div>
        ) : (
          <CarouselComposer
            data={dashData}
            exportRef={exportRef}
            onAssetsReady={() => setAssetsReady(true)}
          />
        )}
      </div>
    </div>
  );
}

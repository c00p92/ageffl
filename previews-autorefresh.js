
// === Live auto-refresh for Sleeper data ===
// Wrap fetchJson to add cache-busting and no-store
(function(){
  if (window.fetchJson && !window.fetchJson.__wrappedForNoStore) {
    const _fetchJson = window.fetchJson;
    window.fetchJson = (url, opts={}) => _fetchJson(
      `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`,
      Object.assign({ cache: 'no-store' }, opts)
    );
    window.fetchJson.__wrappedForNoStore = true;
  }

  // Manual trigger (you can call refreshLiveData() from console if needed)
  window.refreshLiveData = async function refreshLiveData(){
    try {
      if (typeof loadCurrentLeague === 'function') await loadCurrentLeague();
      if (location.hash.replace('#','') === 'previews' && typeof loadPreviewsPage === 'function') {
        await loadPreviewsPage(); // also re-imports latest-week previews JSON
      }
      console.log('Live data refreshed @', new Date().toLocaleString());
    } catch (e) {
      console.warn('Refresh failed:', e);
    }
  };

  // Determine if we're in a likely game window (America/Detroit)
  function isGameWindowDetroit(now = new Date()){
    const day = now.getDay();   // 0=Sun, 1=Mon, ..., 4=Thu
    const h = now.getHours();
    if (day === 4 && h >= 19) return true;           // Thu Night Football
    if (day === 0 && h >= 9 && h <= 23) return true; // Sunday slate incl. intl
    if (day === 1 && h >= 19) return true;           // Mon Night Football
    return false;
  }

  // Start the auto-refresh loop (every 2 minutes during likely windows)
  (function startAutoRefresh(){
    function tick(){
      const season = window.CURRENT_SEASON;
      const lid = window.LEAGUES?.[season];
      const isManual = (typeof isManualLeagueId === 'function') ? isManualLeagueId(lid) : false;
      const sleeperSeason = lid && !isManual;
      if (sleeperSeason && isGameWindowDetroit(new Date())) {
        window.refreshLiveData();
      }
    }
    setInterval(tick, 2 * 60 * 1000); // 2 minutes
    tick(); // fire once on load
  })();
})();

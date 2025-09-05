/* ===== Previews: auto-load the LATEST weekly file from GitHub (2025+) + Live Auto-Refresh ===== */
(function () {
  "use strict";

  const OWNER = "c00p92";
  const REPO  = "ageffl";
  const REF   = "main";

  // One-file-per-week (primary + a few fallbacks)
  const WEEKLY_PREVIEWS_SPEC_TEMPLATE = "c00p92/ageffl@main:previews/{season}/week-{week2}.json";
  const WEEKLY_PREVIEWS_SPEC_FALLBACKS = [
    "c00p92/ageffl@main:data/previews/{season}/week-{week2}.json",
    "c00p92/ageffl@main:previews/{season}/week-{week}.json",
    "c00p92/ageffl@main:data/previews/{season}/week-{week}.json"
  ];

  /* ---------------- GitHub helpers ---------------- */
  async function resolveLatestPreviewWeek(season){
    if (Number(season) < 2025) return null;
    const dirs = ["previews/" + season, "data/previews/" + season];
    const weeks = new Set();
    for (var i=0;i<dirs.length;i++){
      const dir = dirs[i];
      try {
        const url = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" + dir + "?ref=" + encodeURIComponent(REF);
        const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" });
        if (!res.ok) continue;
        const items = await res.json();
        for (var j=0;j<items.length;j++){
          const it = items[j];
          const m = /^week-(\d+)\.json$/i.exec(it.name);
          if (m) weeks.add(parseInt(m[1], 10));
        }
      } catch(_) {}
    }
    if (weeks.size === 0) return null;
    return Math.max.apply(null, Array.from(weeks)); // latest present
  }

  function parseGhSpec(spec){
    spec = (spec||"").trim(); if (!spec) return null;
    var ownerRepo, ref = "main", path = "";
    var colon = spec.indexOf(":"), at = spec.indexOf("@");
    ownerRepo = colon === -1 ? spec : spec.slice(0, colon);
    path = colon === -1 ? "" : spec.slice(colon + 1);
    var repoPart = at === -1 ? ownerRepo : ownerRepo.slice(0, at);
    ref = at === -1 ? ref : ownerRepo.slice(at + 1);
    var slash = repoPart.indexOf("/");
    if (slash === -1) return null;
    var owner = repoPart.slice(0, slash), repo = repoPart.slice(slash + 1);
    if (!owner || !repo || !path) return null;
    return { owner: owner, repo: repo, ref: ref, path: path };
  }

  async function fetchGithubRaw(p){
    const url = "https://api.github.com/repos/" + p.owner + "/" + p.repo + "/contents/" + p.path + "?ref=" + encodeURIComponent(p.ref);
    const r = await fetch(url, { headers: { "Accept": "application/vnd.github.v3.raw" }, cache: "no-store" });
    if (!r.ok) throw new Error("GitHub API " + r.status);
    return await r.text();
  }
  async function fetchGithubRawCdn(p){
    const url = "https://raw.githubusercontent.com/" + p.owner + "/" + p.repo + "/" + p.ref + "/" + p.path;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("raw.githubusercontent.com " + r.status);
    return await r.text();
  }
  async function fetchTextFromGhSpec(spec){
    const parsed = parseGhSpec(spec);
    if (!parsed) throw new Error("Bad GitHub spec: " + spec);
    try { return await fetchGithubRaw(parsed); } catch (e1) {
      try { return await fetchGithubRawCdn(parsed); } catch(e2) { throw e1; }
    }
  }

  function fillTemplate(t, map){
    var out = t;
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map,k)) {
      // simple global replace without replaceAll
      var re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      out = out.replace(re, map[k]);
    }
    return out;
  }

  async function importPreviewsWeeklyJsonTextForLeague(txt, leagueId, week){
    try {
      const data = JSON.parse(txt);
      const w = String(week);
      // Accept either {mid:text} or {"w":{mid:text}}
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const looksFlat = typeof Object.values(data)[0] === "string";
        const map = looksFlat ? data : (data[w] || {});
        for (const mid in map) if (Object.prototype.hasOwnProperty.call(map, mid)) {
          const blurb = map[mid] || "";
          localStorage.setItem("sleeper_previews_" + leagueId + "_" + w + "_" + mid, blurb);
        }
        return true;
      }
      return false;
    } catch(e){ console.error("Preview JSON parse failed:", e); return false; }
  }

  async function importPreviewsFromGithubForWeek(season, week, leagueId){
    if (Number(season) < 2025) return;
    if (typeof window.isManualLeagueId === "function" && window.isManualLeagueId(leagueId)) return;
    const wk = String(week), week2 = wk.padStart(2, "0");
    const repl = { "{season}": String(season), "{week}": wk, "{week2}": week2 };
    const specs = [ fillTemplate(WEEKLY_PREVIEWS_SPEC_TEMPLATE, repl) ]
      .concat(WEEKLY_PREVIEWS_SPEC_FALLBACKS.map(function(s){ return fillTemplate(s, repl); }));
    for (var i=0;i<specs.length;i++) {
      try {
        const txt = await fetchTextFromGhSpec(specs[i]);
        if (await importPreviewsWeeklyJsonTextForLeague(txt, leagueId, week)) {
          console.log("[previews] imported:", specs[i]);
          return true;
        }
      } catch(_) {}
    }
    return false;
  }

  /* ---------------- Override Previews loader to use LATEST week (with Week-01 fallback) ---------------- */
  window.loadPreviewsPage = async function loadPreviewsPage() {
    try {
      const season = window.CURRENT_SEASON;
      const leagueId = window.LEAGUES && window.LEAGUES[season];

      let week = await resolveLatestPreviewWeek(season);
      // Fallback: if listing fails, try week-01 explicitly before giving up
      if (!week) {
        const wk = "01";
        const primary = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + REF + "/previews/" + season + "/week-" + wk + ".json";
        const alt     = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + REF + "/data/previews/" + season + "/week-" + wk + ".json";
        try { await fetch(primary, {cache:"no-store"}).then(function(r){ if(!r.ok) throw 0; }); week = 1; } catch(_){
          try { await fetch(alt, {cache:"no-store"}).then(function(r){ if(!r.ok) throw 0; }); week = 1; } catch(__){}
        }
      }
      // Last fallback: current week
      if (!week && typeof window.getCurrentWeek === "function") week = await window.getCurrentWeek();
      if (!week) throw new Error("Could not determine week.");

      const matchupsP = fetchJson("/league/" + leagueId + "/matchups/" + week);
      const rostersP  = (window.cache && window.cache.rosters && window.cache.rosters.length)
        ? Promise.resolve(window.cache.rosters)
        : fetchJson("/league/" + leagueId + "/rosters");
      const usersP    = (window.cache && window.cache.users && window.cache.users.length)
        ? Promise.resolve(window.cache.users)
        : fetchJson("/league/" + leagueId + "/users");

      const [matchups, rosters, users] = await Promise.all([matchupsP, rostersP, usersP]);
      if (!window.cache) window.cache = { matchupsByWeek: {} };
      window.cache.matchupsByWeek[week] = matchups;
      if (typeof window.registerProfilesFromSleeper === "function") registerProfilesFromSleeper(users);

      const groups = matchups.reduce(function(acc, m){
        (acc[m.matchup_id] = acc[m.matchup_id] || []).push(m);
        return acc;
      }, {});

      await importPreviewsFromGithubForWeek(season, week, leagueId);
      if (typeof window.renderPreviews === "function") renderPreviews(week, groups, users, rosters);
    } catch (err) {
      const el = document.querySelector('#previewsWrap');
      if (el) el.innerHTML = '<div class="muted">Error loading previews: ' + err.message + '</div>';
      console.warn(err);
    }
  };

  /* ---------------- Live Auto-Refresh (2m during game windows) ---------------- */
  // Wrap fetchJson to add cache-busting and no-store
  if (window.fetchJson && !window.fetchJson.__wrappedForNoStore) {
    const _fetchJson = window.fetchJson;
    window.fetchJson = function(url, opts){
      opts = opts || {};
      const sep = url.indexOf("?") === -1 ? "?" : "&";
      return _fetchJson(url + sep + "t=" + Date.now(), Object.assign({ cache: "no-store" }, opts));
    };
    window.fetchJson.__wrappedForNoStore = true;
  }

  window.refreshLiveData = async function refreshLiveData(){
    try {
      if (typeof window.loadCurrentLeague === "function") await window.loadCurrentLeague();
      if (location.hash.replace("#","") === "previews" && typeof window.loadPreviewsPage === "function") {
        await window.loadPreviewsPage();
      }
      console.log("Live data refreshed @", new Date().toLocaleString());
    } catch (e) {
      console.warn("Refresh failed:", e);
    }
  };

  function isGameWindowDetroit(now){
    now = now || new Date();
    const day = now.getDay();   // 0=Sun, 1=Mon, ..., 4=Thu
    const h = now.getHours();
    if (day === 4 && h >= 12) return true;            // Thu Night Football
    if (day === 5 && h >= 12) return true;            // Fri early (intl games)
    if (day === 0 && h >= 5 && h <= 23) return true;  // Sunday slate incl. intl
    if (day === 1 && h >= 12) return true;            // Mon Night Football
    return false;
  }

  (function startAutoRefresh(){
    function tick(){
      const season = window.CURRENT_SEASON;
      const lid = window.LEAGUES && window.LEAGUES[season];
      const isManual = (typeof window.isManualLeagueId === "function") ? window.isManualLeagueId(lid) : false;
      const sleeperSeason = lid && !isManual;
      if (sleeperSeason && isGameWindowDetroit(new Date())) {
        window.refreshLiveData();
      }
    }
    setInterval(tick, 2 * 60 * 1000);
    tick();
  })();
})();

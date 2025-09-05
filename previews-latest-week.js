<script>
/* ===== Auto-load LATEST weekly previews from GitHub (2025+) ===== */
(function () {
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

  async function resolveLatestPreviewWeek(season){
    if (Number(season) < 2025) return null;
    const dirs = [`previews/${season}`, `data/previews/${season}`];
    const weeks = new Set();
    for (const dir of dirs){
      try {
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${dir}?ref=${encodeURIComponent(REF)}`;
        const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" });
        if (!res.ok) continue;
        const items = await res.json();
        for (const it of items) {
          const m = /^week-(\d+)\.json$/i.exec(it.name);
          if (m) weeks.add(parseInt(m[1], 10));
        }
      } catch(_) {}
    }
    if (weeks.size === 0) return null;
    return Math.max(...weeks); // ← pick the latest file present
  }

  async function fetchTextFromGhSpec(spec){
    function parseGhSpec(spec){
      spec = (spec||"").trim(); if (!spec) return null;
      let ownerRepo, ref = "main", path = "";
      const colon = spec.indexOf(":"), at = spec.indexOf("@");
      ownerRepo = colon === -1 ? spec : spec.slice(0, colon);
      path = colon === -1 ? "" : spec.slice(colon + 1);
      const repoPart = at === -1 ? ownerRepo : ownerRepo.slice(0, at);
      ref = at === -1 ? ref : ownerRepo.slice(at + 1);
      const slash = repoPart.indexOf("/");
      if (slash === -1) return null;
      const owner = repoPart.slice(0, slash), repo = repoPart.slice(slash + 1);
      if (!owner || !repo || !path) return null;
      return { owner, repo, ref, path };
    }
    async function fetchGithubRaw(p){
      const url = `https://api.github.com/repos/${p.owner}/${p.repo}/contents/${p.path}?ref=${encodeURIComponent(p.ref)}`;
      const r = await fetch(url, { headers: { "Accept": "application/vnd.github.v3.raw" }, cache: "no-store" });
      if (!r.ok) throw new Error(`GitHub API ${r.status}`);
      return await r.text();
    }
    async function fetchGithubRawCdn(p){
      const url = `https://raw.githubusercontent.com/${p.owner}/${p.repo}/${p.ref}/${p.path}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`raw.githubusercontent.com ${r.status}`);
      return await r.text();
    }
    const parsed = parseGhSpec(spec);
    if (!parsed) throw new Error("Bad GitHub spec: " + spec);
    try { return await fetchGithubRaw(parsed); } catch (e1) {
      try { return await fetchGithubRawCdn(parsed); } catch(e2) { throw e1; }
    }
  }

  async function importPreviewsWeeklyJsonTextForLeague(txt, leagueId, week){
    try {
      const data = JSON.parse(txt);
      const w = String(week);
      // Accept either {mid:text} or {"w":{mid:text}}
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const looksFlat = typeof Object.values(data)[0] === "string";
        const map = looksFlat ? data : (data[w] || {});
        for (const [mid, blurb] of Object.entries(map)) {
          localStorage.setItem(`sleeper_previews_${leagueId}_${w}_${mid}`, blurb || "");
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
    const fill = (t)=> Object.entries(repl).reduce((s,[k,v])=> s.replaceAll(k,v), t);
    const specs = [ fill(WEEKLY_PREVIEWS_SPEC_TEMPLATE), ...WEEKLY_PREVIEWS_SPEC_FALLBACKS.map(fill) ];
    for (const spec of specs) {
      try {
        const txt = await fetchTextFromGhSpec(spec);
        if (await importPreviewsWeeklyJsonTextForLeague(txt, leagueId, week)) {
          console.log("Imported previews:", spec);
          return true;
        }
      } catch(_) {}
    }
    return false;
  }

  // Override Previews loader to always use the *latest available* week
  window.loadPreviewsPage = async function loadPreviewsPage() {
    try {
      const season = window.CURRENT_SEASON;
      const leagueId = window.LEAGUES?.[season];
      let week = await resolveLatestPreviewWeek(season);
      if (!week) week = await window.getCurrentWeek();
      if (!week) throw new Error("Could not determine week.");

      const [matchups, rosters, users] = await Promise.all([
        fetchJson(`/league/${leagueId}/matchups/${week}`),
        window.cache.rosters?.length ? Promise.resolve(window.cache.rosters) : fetchJson(`/league/${leagueId}/rosters`),
        window.cache.users?.length ? Promise.resolve(window.cache.users) : fetchJson(`/league/${leagueId}/users`)
      ]);
      window.cache.matchupsByWeek[week] = matchups;
      registerProfilesFromSleeper(users);

      const groups = matchups.reduce((acc, m) => {
        (acc[m.matchup_id] ||= []).push(m);
        return acc;
      }, {});

      await importPreviewsFromGithubForWeek(season, week, leagueId);
      renderPreviews(week, groups, users, rosters);
    } catch (err) {
      const el = document.querySelector('#previewsWrap');
      if (el) el.innerHTML = `<div class="muted">Error loading previews: ${err.message}</div>`;
    }
  };
})();
</script>

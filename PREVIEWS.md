# Weekly Matchup Previews — Runbook

This is the procedure Claude follows once a week to write the matchup previews for the
current season. It is written to be read cold by a fresh session with no prior context.

**Cadence:** Wednesday mornings. Sleeper rolls `state.week` on Tuesday, and Monday Night
Football is final by then, so Wednesday is the first day both "last week's results" and
"this week's matchups" are correct.

**Do not** write previews for a week that is already underway, and do not overwrite an
existing `previews/<season>/week-XX.json` unless explicitly asked.

---

## 1. Get the data

`api.sleeper.app` is blocked from both the cloud sandbox shell and the local device shell
by network policy. Fetch it from **page context in the browser pane instead**, which works
because the site itself talks to Sleeper:

1. `Claude_Browser__preview_start` → `https://coopage.org/`
2. `Claude_Browser__javascript_tool` → run `fetch(...)` calls against
   `https://api.sleeper.app/v1/...` and return the JSON.

If the browser pane is unavailable, stop and tell Chris rather than guessing at data.

### Endpoints used

| What | Endpoint |
| --- | --- |
| Current week / season | `/state/nfl` |
| League meta | `/league/{leagueId}` |
| Managers | `/league/{leagueId}/users` |
| Rosters, records, PF/PA | `/league/{leagueId}/rosters` |
| This week's pairings | `/league/{leagueId}/matchups/{week}` |
| Last week's scores | `/league/{leagueId}/matchups/{week-1}` |
| Waivers / trades | `/league/{leagueId}/transactions/{week-1}` |
| Player names | `/players/nfl` (large — cache it, don't refetch per player) |

League IDs live in `index.html` in the `LEAGUES` map. Prior seasons are chained through
each league's `previous_league_id`, which is how head-to-head history is assembled.

---

## 2. Assemble the inputs

For **each** of the six matchups, gather:

- **Records and scoring** — W-L, PF, PA, PF rank, current streak for both teams.
- **Last week** — what each manager actually scored, whether they won, and the margin.
  A blowout, a one-point loss, or the week's high score are all worth calling out.
- **Head-to-head history** — all-time record between the two managers across 2022-present.
  Use the `previous_league_id` chain to walk prior seasons.
- **Roster detail** — notable starters, a big waiver pickup or trade from the past week,
  anyone starting a player on bye or an injured starter still in the lineup.
- **Lore** — `data/league-lore.json`. This is the file that makes the writeups personal:
  real names, nicknames, running jokes, grudges, and league history that no API knows.
  Use a manager's real name from the lore file when it exists; fall back to their team
  name, never the raw Sleeper handle.

Respect `doNotJokeAbout` in the lore file. If it lists a subject, it is off limits.

---

## 3. Write them

**Voice:** a sharp roast delivered deadpan in the register of a national broadcast analyst.
Treat a 12-team home league as though it carries genuine championship stakes — invented
storylines, overwrought narrative arcs, gravely delivered stat callouts — and use that
straight face as the setup for the actual insult. The comedy is in the mismatch between
the tone and the subject matter.

Rules that keep it good:

- **Two to four sentences per matchup.** Tight beats rambling. Never pad.
- **Every writeup ends with an explicit pick**, formatted exactly `Winner: <Name>`.
  This matches the existing files and is how the site displays the call.
- **Land at least one specific, checkable detail per matchup** — a real score, a real
  player, a real streak, a real head-to-head record. Specificity is what makes it funny;
  generic trash talk is not.
- **Vary the openings.** Do not start more than one writeup the same way in a week.
- **Punch at teams and decisions, not at people.** Roster moves, draft picks, lineup
  choices, and losing streaks are fair game. Anything genuinely personal is not.
- **Never invent facts.** If a stat isn't in the data, don't cite it. Made-up numbers are
  the one thing that kills the bit — the league will check.
- Chris (`Coop92`) gets the same treatment as everyone else, or harder.

---

## 4. Output

Write `previews/<season>/week-XX.json` (zero-padded week, e.g. `week-02.json`):

```json
{
  "1": "…writeup for matchup_id 1… Winner: Name",
  "2": "…"
}
```

> **The keys are Sleeper `matchup_id` values, not card positions.**
> The site renders previews by looking up `matchup_id` directly, but the Previews page
> displays cards in roster order, so the third card on screen is very often not
> `matchup_id` 3. Always take the id from the `/matchups/{week}` response for each pair.
> Getting this wrong silently attaches every writeup to the wrong game.

Before committing, verify: valid JSON, exactly one key per matchup, every key matches a
real `matchup_id` for that week, and every value ends in `Winner: <Name>`.

---

## 5. Commit

- **Never commit to `main`.** Everything goes through a pull request Chris reviews.
- Branch from `main`: `previews/<season>-week-XX`.
- Commit only the new previews file.
- The device shell has no GitHub credentials, so the push has to come from Chris. Leave the
  branch committed locally and tell him it's ready to push and open a PR.

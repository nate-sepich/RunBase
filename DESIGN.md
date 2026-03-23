# RunBase v2 — Training Assistant Design Doc

**Status:** Draft  
**Authors:** Nate Sepich, Gabe Hiatt  
**Last updated:** 2026-03-22

---

## Vision

Evolve RunBase from a *passive dashboard* into an *active training assistant* — something Gabe checks before lacing up, not after finishing a run.

The core loop:
> **4am brief → training context → go run → data logged → dashboard updated**

---

## Feature Inventory

### F1 — Heart Rate Zone Breakdown (Dashboard)

**What Gabe wants:** Per-mile (or per-lap) HR zone overlay on existing activity cards.

**How it works:**
- Strava returns `laps[]` and `splits_metric[]` on detailed activity fetch
- Each split/lap includes `average_heartrate` and `moving_time_seconds`
- Map HR into 5 zones based on max HR (configurable, default 185 bpm for Gabe)
- Display as a color-coded bar per mile on the activity card

**HR Zone thresholds (% of max HR):**
| Zone | Label | % Max HR | Color |
|------|-------|----------|-------|
| Z1 | Recovery | <60% | Gray |
| Z2 | Aerobic Base | 60–70% | Blue |
| Z3 | Tempo | 70–80% | Green |
| Z4 | Threshold | 80–90% | Orange |
| Z5 | VO2 Max | 90%+ | Red |

**Data requirements:**
- `ingest.js` must fetch full activity detail (Strava `/activities/{id}`) for each new run, not just the list endpoint
- Store `splits_metric[]` in `runs.json` per activity
- `max_hr` config per athlete in `data/athlete.json` (simple key/value, one file)

**UI change:** Add "Mile Breakdown" section to `ActivityCard.astro` — expandable/collapsible to keep cards clean.

---

### F2 — 4am Training Brief (Automated Text/Notification)

**What Gabe wants:** A message at 4am that gives him everything he needs to walk out the door:
- Today's planned training (distance, pace target, HR zone targets)
- Current weather
- Nutrition recommendations
- Link to full plan/dashboard

**Delivery options (pick one to start):**
- **SMS via Twilio** — simplest, works on any phone
- **iMessage via mac** — free but requires Nate's machine to be on
- **Push notification** — needs an app, overkill for now

**Recommended: Twilio SMS** (or we use Nate's iMessage CLI since it's already set up)

**Message format:**
```
🏃 Morning, Gabe! Here's your training brief:

📋 TODAY: 8 miles @ 7:30/mi pace (Z2–Z3 effort)
Zone target: Keep HR 130–155 bpm

🌤 WEATHER (Des Moines, 4am): 38°F, winds 12mph NW
→ Dress: Base layer + jacket, gloves likely needed

💧 NUTRITION:
• Hydrate 12–16oz water before you head out
• 45min+: 1 gel at mile 4
• Carry water if >60min out

📍 Full plan: https://gabe.github.io/RunBase

Good luck out there 💪
```

**Architecture:**
- GitHub Actions cron job (daily 9am UTC = 4am CDT)
- Script: `scripts/daily-brief.js`
- Reads: `data/training-plan.json` for today's session
- Calls: Open-Meteo API (free, no key) for weather
- Sends: Twilio SMS to Gabe's number

---

### F3 — Training Plan Integration

**What Gabe wants:** A structured plan (weeks of sessions) that feeds the daily brief and appears in the dashboard.

**Data model — `data/training-plan.json`:**
```json
{
  "athlete": "Gabe Hiatt",
  "plan_start": "2026-03-24",
  "target_event": "Race Name",
  "target_date": "2026-06-01",
  "weeks": [
    {
      "week": 1,
      "sessions": [
        {
          "day": "Monday",
          "type": "easy",
          "distance_miles": 5,
          "pace_target": "8:00–8:30/mi",
          "hr_zone": "Z2",
          "hr_bpm_range": "120–140",
          "notes": "Shakeout — keep it conversational"
        },
        {
          "day": "Wednesday",
          "type": "tempo",
          "distance_miles": 6,
          "pace_target": "7:00–7:15/mi",
          "hr_zone": "Z3–Z4",
          "hr_bpm_range": "145–165",
          "notes": "Warm up 1mi easy, 4mi tempo, 1mi cool down"
        },
        {
          "day": "Saturday",
          "type": "long_run",
          "distance_miles": 12,
          "pace_target": "8:30–9:00/mi",
          "hr_zone": "Z2",
          "hr_bpm_range": "120–140",
          "notes": "Easy effort throughout — don't race it"
        }
      ]
    }
  ]
}
```

**How "today's session" is resolved:**
1. Calculate current week number from `plan_start`
2. Match current day of week to session `day` field
3. Return session or `null` (rest day)

**Dashboard view (`/plan`):**
- Weekly calendar grid
- Completed sessions auto-matched to logged runs (±1 day, ±15% distance tolerance)
- Visual: planned vs actual pace + HR

---

### F4 — Nutrition Recommendations

**What Gabe wants:** Pre-run nutrition guidance based on session type and duration.

**Rules (simple lookup table, adjustable):**

| Duration | Hydration (pre-run) | Fuel during |
|----------|--------------------|-|
| <45min | 8–12oz water | None needed |
| 45–75min | 12–16oz water | 1 gel optional at mile 4+ |
| 75–120min | 16–20oz water | 1 gel per 45min |
| 120min+ | 20oz + electrolytes | 1 gel per 45min, electrolytes at 60min |

**Hot weather modifier (>75°F):** Increase pre-hydration by 8oz, add electrolyte reminder.  
**Cold weather modifier (<32°F):** Mention hydration still important even if not thirsty.

This is a pure lookup — no external API needed. Baked into `daily-brief.js`.

---

## Implementation Phases

### Phase 1 — HR Zones on Dashboard (Frontend only, no infra changes)
- Fetch full activity detail in `ingest.js` (adds Strava API calls)
- Store `splits_metric[]` in `runs.json`
- Add zone breakdown bar to `ActivityCard.astro`
- Config: `data/athlete.json` with `max_hr`
- **Effort:** Medium — mostly ETL + UI

### Phase 2 — Training Plan Data + Dashboard View
- Create `data/training-plan.json` with Gabe's actual plan
- Add `/plan` route to Astro site
- Week calendar grid with session cards
- **Effort:** Medium — data entry + new Astro page
- **Dependency:** Gabe supplies the plan content

### Phase 3 — 4am Daily Brief
- `scripts/daily-brief.js` — resolves today's session, fetches weather, computes nutrition
- GitHub Actions cron: `0 9 * * *` (9am UTC = 4am CDT)
- Delivery: Twilio SMS (or iMessage if Nate's mac is always on)
- **Effort:** Medium — new script + GitHub secret (Twilio keys)
- **Dependency:** Gabe's phone number, Twilio account OR Nate's iMessage relay

---

## Open Questions

| # | Question | Owner |
|---|----------|-------|
| Q1 | What is Gabe's max HR? (needed for zone calc) | Gabe |
| Q2 | What is the target race + date? | Gabe |
| Q3 | Does Gabe have an existing training plan to digitize? | Gabe |
| Q4 | Twilio SMS or iMessage for the brief? | Nate/Gabe |
| Q5 | What city/coords for weather? (Des Moines assumed) | Gabe |
| Q6 | Should the brief also be viewable on the dashboard? | Gabe |

---

## Non-Goals (for now)

- Real-time GPS tracking
- Wearable integration beyond Strava
- AI-generated adaptive training plans
- Social/sharing features
- Mobile app

---

## Tech Stack (unchanged)

| Layer | Tech |
|-------|------|
| Frontend | Astro 4 + Tailwind CSS |
| Data | `data/*.json` committed to repo |
| ETL | `scripts/ingest.js` (Node 20, GitHub Actions) |
| Brief | `scripts/daily-brief.js` (Node 20, GitHub Actions cron) |
| Weather | Open-Meteo API (free, no key required) |
| SMS | Twilio (or iMessage relay) |
| Hosting | GitHub Pages |

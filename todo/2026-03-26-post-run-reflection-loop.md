# RunBase TODO — Post-run reflection + plan adherence loop

- **Created:** 2026-03-26
- **Status:** Draft
- **Owner:** Clawdio
- **Related Notion card:** [RunBase] Post-run reflection + plan adherence loop

## Goal

Add a lightweight post-run workflow to RunBase that:
1. detects when a newly ingested Strava run matches a planned session
2. compares planned vs actual workout characteristics
3. sends Gabe a short reflection prompt shortly after the run lands
4. stores subjective feedback alongside the activity
5. exposes this context in the RunBase UI where it adds value

## Working principles

- Keep the first version small and useful.
- Prefer supportive reflection over compliance scoring.
- Use the existing RunBase architecture where possible.
- Keep temporary planning/tracking in `todo/` during active work.
- Put durable feature documentation in the repo README/docs once the feature is accepted.
- Delete this file after completion + acceptance.

## Existing system we can build on

- `scripts/ingest.js` already fetches new Strava runs and maps them into `data/runs.json`.
- `data/training-plan.json` already describes planned sessions.
- `src/pages/plan.astro` already matches planned sessions to actual runs.
- `scripts/daily-brief.js` already establishes a delivery pattern for outbound messages.
- Activity UI already displays run metrics and HR breakdown.

## MVP scope

### Data
- Add a new store for reflection/adherence metadata, likely `data/reflections.json`.
- Key by Strava activity ID.
- Store:
  - matched planned session metadata snapshot
  - adherence summary
  - outbound prompt metadata
  - athlete reply / note
  - timestamps

### Logic
- Add a reusable matching/adherence module rather than duplicating logic inside pages/scripts.
- Determine whether a newly ingested run should generate a reflection prompt.
- Produce a concise human summary such as:
  - matched plan
  - modified effort
  - off-plan but useful

### Messaging
- Generate a short post-run prompt in a supportive tone.
- Delivery path should align with the current RunBase/OpenClaw messaging reality.
- Prefer a first version that can be tested manually or in dry-run mode before any automated scheduling.

### UI
- Show reflection context on the activity view/card if present.
- Optionally show simple plan-vs-actual context on `/plan`.
- Do not overbuild dashboards or scoring systems in MVP.

## Likely implementation slices

### Slice 1 — Shared matching/adherence logic
- Extract/commonize plan matching helpers from `src/pages/plan.astro`.
- Create a shared utility for:
  - week/session date resolution
  - matching a run to a planned session
  - generating a simple adherence classification

### Slice 2 — Reflection data model
- Add `data/reflections.json` with a minimal schema.
- Add read/write helpers.
- Ensure the file is stable in git and easy to inspect manually.

### Slice 3 — Prompt generation path
- Build a script or module to:
  - inspect recent unmatched/unprompted runs
  - create a short reflection prompt
  - optionally send or dry-run it
- Keep transport abstract enough that current delivery can be swapped later.

### Slice 4 — Persist athlete notes
- Define how a reply/note gets written back.
- MVP may start with an OpenClaw-assisted write/update path while validating the response loop in Telegram.
- Initial testing can use real messages in the RunBase chat with Nate verifying visibility and reply behavior.

### Slice 5 — UI surfacing
- Add reflection/adherence rendering to activity cards or another clear location.
- Update docs once the UX settles.

## Decisions captured after review

1. **Delivery path for MVP:** OpenClaw via Telegram.
2. **UI approach:** Keep the existing website pattern and extend it only where necessary.
3. **Data shape:** Prefer keeping reflection/adherence data attached directly to the run record in `data/runs.json` unless this becomes awkward enough to justify a separate store.
4. **Local workflow:** Pull latest `main` before implementation because GitHub Actions is currently the system writing fresh run data.
5. **Responsibility split for MVP:** RunBase scripts own data collection/matching/state/prompt generation; OpenClaw owns Telegram messaging delivery.

## Current implementation stance

- Start with shared matching/adherence logic.
- Pull latest RunBase data from `main` before making behavior changes.
- Prefer enriching `data/runs.json` activity objects with a nested reflection/adherence payload instead of creating `data/reflections.json` immediately.
- Use OpenClaw/Telegram for MVP prompt delivery.
- Keep messaging transport outside the repo scripts for now; scripts should emit/store the prompt and OpenClaw should send it.
- Keep website changes additive and minimal.
- After acceptance, update permanent repo docs and remove this file.

## Working notes on data model choice

### Preferred first pass: embed in `runs.json`
Pros:
- reflection data stays physically attached to the activity it describes
- simpler joins in Astro pages/components
- easier manual inspection in a single source file
- avoids maintaining a second JSON store prematurely

Cons:
- ETL update logic must preserve nested reflection metadata on re-ingest
- `ingest.js` mapping/upsert behavior needs extra care so reflection info is not blown away when the activity is refreshed

### Likely shape
Each activity may gain a nested object like:

```json
"post_run": {
  "matched_plan": {
    "week": 2,
    "day": "Tuesday",
    "type": "workout"
  },
  "adherence": {
    "status": "matched|modified|off_plan",
    "summary": "Plan called for intervals; effort landed a little hot but close enough."
  },
  "reflection": {
    "prompt_sent_at": "...",
    "reply_text": "...",
    "reply_received_at": "..."
  }
}
```

If preserving this inside ETL becomes messy, revisit a separate reflection store later.

## Remaining open question

1. Should MVP include automatic capture of Gabe replies into the run metadata immediately, or should the first version focus on outbound prompt generation + manual/assisted attachment path?

## Change log

### 2026-03-26
- Created initial working design doc in `todo/` before implementation.
- Captured scope, principles, slices, and open questions.
- Recorded MVP decision to use OpenClaw via Telegram.
- Recorded preference to keep reflection/adherence data in `runs.json` if practical.
- Recorded local workflow requirement to pull latest `main` before implementation.
- Pulled latest `main` in RunBase to sync fresh GitHub Actions activity data before coding.
- Added shared post-run matching/adherence helpers in `src/lib/postRun.ts`.
- Updated `scripts/ingest.js` to preserve embedded `post_run` metadata during activity refreshes.
- Extended activity typing to support embedded post-run metadata.
- Added `scripts/post-run-brief.js` to generate/store a Telegram-oriented reflection prompt for an activity.
- Confirmed MVP ownership split: script handles data/state/prompt generation, OpenClaw handles Telegram sending.
- Extended `ActivityCard.astro` to surface plan/adherence/reflection context when present.

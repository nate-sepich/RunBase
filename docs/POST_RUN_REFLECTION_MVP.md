# Post-Run Reflection MVP

## Purpose

RunBase now supports a lightweight post-run reflection workflow that compares a newly ingested run to the training plan, generates a short reflection prompt, stores the prompt metadata with the activity, and can display the plan/adherence/reflection context in the existing UI.

## Architecture split

### RunBase owns
- activity data ingestion
- plan matching
- adherence classification
- prompt generation
- persistence of post-run metadata in `data/runs.json`

### Runtime layer owns
- Telegram message delivery
- conversational handling around the prompt
- temporary human-in-the-loop testing during MVP validation
- syncing canonical prompt/reply state back into `data/runs.json`

This split is intentional so the transport layer can be swapped later without rewriting RunBase's core data model.

## Data model

Post-run state is embedded directly on each activity in `data/runs.json` under `post_run`.

Example shape:

```json
{
  "post_run": {
    "matched_plan": {
      "week": 1,
      "theme": "Base",
      "date": "2026-03-26",
      "session": {
        "day": "Thursday",
        "type": "workout",
        "distance_miles": null,
        "pace_target": "7:35/mi per repeat",
        "hr_zone": "Z4–Z5",
        "hr_bpm_range": "160–180",
        "notes": "Mile repeats x3 — full recovery jog between each"
      }
    },
    "adherence": {
      "status": "matched",
      "summary": "Plan called for workout and this landed pretty close to target.",
      "actual_distance_miles": 2.02,
      "actual_pace_per_mile": "6:59"
    },
    "reflection": {
      "prompt_channel": "telegram",
      "prompt_target": "-5176531716",
      "prompt_sent_at": "2026-03-26T16:18:00.000Z",
      "prompt_text": "...",
      "reply_text": "...",
      "reply_received_at": "2026-03-26T16:30:00.000Z"
    }
  }
}
```

## Scripts

### Generate/store a post-run prompt

```bash
node scripts/post-run-brief.js --dry-run
```

Optional:

```bash
ACTIVITY_ID=17863703118 node scripts/post-run-brief.js --dry-run
```

What it does:
- selects an eligible activity (or a specific one)
- matches it to the plan if possible
- computes a simple adherence status
- stores the generated prompt and metadata into `runs.json`
- emits an OpenClaw-facing handoff payload for Telegram delivery

### Save a reply back onto the run

```bash
node scripts/apply-post-run-reply.js --activity=17863703118 --reply="Legs felt solid but wind was annoying"
```

What it does:
- finds the activity in `runs.json`
- writes `post_run.reflection.reply_text`
- timestamps `reply_received_at`

## UI behavior

Activity cards now show post-run metadata when present:
- plan matched / modified / off-plan badge
- a short adherence summary
- saved reflection text if one exists

The rest of the site pattern remains unchanged.

## ETL preservation rule

`scripts/ingest.js` preserves existing `activity.post_run` metadata when refreshing activities from Strava. This is critical because GitHub Actions is the current source of fresh run data.

## MVP limitations

- Runtime delivery is now cloud-hosted, but production cutover still needs an explicit swap from the old OpenClaw cron path.
- `runs.json` sync depends on a GitHub token being available to the AWS runtime.
- Adherence logic is intentionally lightweight and should be refined with real usage.

## Future evolution

This MVP is designed to support a future migration to a more sustainable delivery path (for example, a cloud or always-on agent) without changing the core RunBase-side workflow.

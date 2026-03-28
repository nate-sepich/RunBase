# RunBase Prod Cutover Plan

Status: Draft  
Last updated: 2026-03-28

## Goal

Cut RunBase messaging over from the current OpenClaw cron-based daily brief to the AWS/SAM Telegram runtime without duplicate sends, data drift, or silent rollback pain.

## Current production behavior

### OpenClaw cron currently owns
- **Daily training brief** at `4:00 AM America/Chicago`
- direct Telegram delivery to Gabe's production chat
- isolated agent execution via OpenClaw cron
- LLM-generated message composition

### What that means in practice
The current production path is not just a timer. It provides:
- schedule + timezone handling
- isolated execution context
- direct Telegram delivery
- run history and delivery tracking
- model/provider selection and usage tracking
- natural-language message generation via LLM

### Observed LLM use
Recent RunBase cron history shows:
- provider/model examples: `openai-codex/gpt-5.4`, `anthropic/claude-sonnet-4-6`
- total token use per run is non-trivial (recent examples were roughly high-teens to ~30k total tokens)

Implication:
- current cron is flexible and nicely worded
- but more expensive, less deterministic, and still dependent on OpenClaw/model availability

## Target architecture after cutover

### GitHub / repo owns
- Strava ETL
- static site build/deploy
- canonical publishable run/reflection state in `data/runs.json`

### AWS runtime owns
- scheduled daily brief
- scheduled post-run prompt scan
- inbound Telegram webhook handling
- operational state in DynamoDB
  - Telegram message ids
  - reply correlation
  - idempotency
  - sync bookkeeping

### OpenClaw owns
- no production responsibility for this flow after cutover

## Canonical state split

### `data/runs.json` is canonical for domain/product state
Use it for:
- matched plan context
- adherence summary
- post-run prompt metadata that should surface in the product
- captured reflection reply text / timestamps

### DynamoDB is canonical for runtime/operational state
Use it for:
- prompt delivery ids
- chat/message correlation
- idempotency
- sync status / retry bookkeeping
- operational debugging

This is not duplication for duplication's sake. It is a deliberate split between publishable product data and automation control-plane state.

## Parity checklist before full cutover

### Daily brief parity
- [ ] sends at the correct prod schedule
- [ ] delivers to the correct prod Telegram chat
- [ ] includes session / pace / HR / weather / clothing / fueling guidance
- [ ] uses local America/Chicago presentation in user-facing text
- [ ] does not duplicate the existing OpenClaw cron message
- [ ] idempotency works for the same day

### Post-run parity
- [ ] finds eligible new activities
- [ ] sends a prompt exactly once per activity
- [ ] writes prompt metadata back into `data/runs.json`
- [ ] captures Telegram replies via webhook
- [ ] writes reply text and timestamp back into `data/runs.json`
- [ ] existing UI can surface the saved reflection state

### Ops parity
- [ ] prod webhook registered
- [ ] logs are readable in AWS
- [ ] rollback path is documented and fast
- [ ] old OpenClaw cron is disabled but preserved during the first live days

## Recommended cutover sequence

### Phase 1 — Finish parity in dev
1. validate daily brief send in dev
2. validate post-run prompt send in dev
3. validate reply capture in dev
4. validate `runs.json` sync in dev-path testing
5. keep dev schedules disabled unless intentionally testing

### Phase 2 — Prod dark launch
Deploy the production AWS stack with:
- webhook enabled
- schedules intended to be disabled

Then immediately verify the actual EventBridge rule state after deploy and disable the rules explicitly if needed.

Reason:
- infrastructure exists and can be smoke-tested
- nothing auto-sends yet
- zero risk of duplicate 4 AM messages during setup

### Phase 3 — Manual prod smoke tests
Before enabling schedules:
1. manually invoke prod daily brief once
2. confirm correct prod chat / formatting / local-time wording
3. manually invoke prod post-run scan against a controlled eligible activity
4. reply to the Telegram prompt
5. confirm DynamoDB state + `runs.json` sync

### Phase 4 — Cutover execution
1. **disable old OpenClaw RunBase daily brief cron**
   - disable, do not delete
2. enable AWS prod daily brief schedule
3. enable AWS prod post-run scan schedule
4. watch first live cycles closely

### Phase 5 — Early-life monitoring
For the first 1–3 days after cutover:
- inspect CloudWatch logs
- inspect DynamoDB sync status
- verify messages in prod Telegram chat
- verify `runs.json` updates are landing cleanly

## Rollback plan

If anything goes wrong after cutover:
1. disable AWS prod daily brief schedule
2. disable AWS prod post-run scan schedule
3. re-enable the old OpenClaw daily brief cron
4. leave the webhook in place or temporarily ignore production replies while diagnosing
5. inspect CloudWatch + DynamoDB + repo sync state

Key rule:
- the old OpenClaw cron should be **disabled, not deleted**, until the AWS path has proven itself live for multiple successful cycles

## Duplicate-send avoidance

Never enable AWS prod schedules while the old OpenClaw daily brief cron is still active.

Safe order:
1. deploy prod dark
2. verify both prod EventBridge rules are actually `DISABLED`
3. smoke test manually
4. disable old OpenClaw cron
5. enable AWS schedules

Unsafe order:
- enable AWS schedules first and hope to remember to turn off OpenClaw later

## LLM position for production v1

### Recommendation
Use the deterministic AWS brief generator for the first production cutover.

### Why
- cheaper
- faster
- easier to test
- more predictable
- less sensitive to provider/model drift

### Optional later enhancement
Add a feature-flagged LLM rewrite/styling pass later if desired.
Suggested posture:
- deterministic structured brief first
- optional LLM polish second
- `openrouter/auto` is a reasonable later candidate, not a cutover prerequisite

## Open questions still worth deciding
- should captured reflection replies be surfaced visibly on the public/site UI immediately, or just stored canonically in `runs.json` first?
- what post-run polling interval is ideal for prod?
- should prod daily brief and post-run use the exact same bot/chat forever, or only for the initial release?

## Current status (2026-03-28)

### Completed
- dev validated end-to-end:
  - daily brief send
  - post-run prompt send
  - webhook reply capture
  - canonical `runs.json` sync for prompt/reply state
- prod AWS stack deployed in `us-east-2`
- prod webhook registered
- old OpenClaw **daily brief** cron disabled
- AWS prod **daily brief** schedule enabled
- AWS prod **post-run** schedule remains disabled
- manual prod daily-brief smoke test succeeded
- daily brief URL corrected to `https://nate-sepich.github.io/RunBase`

### Remaining before this is fully buttoned up
- decide when to enable prod post-run prompting
- run a controlled prod post-run smoke test before enabling that schedule
- add basic CloudWatch alarm/ops polish
- replace the temporary GitHub write token with a dedicated fine-grained PAT if desired
- monitor the first live AWS daily brief cycles and confirm no duplicate-send or sync issues

## Recommended next action
- monitor the first live AWS prod daily-brief cycle
- keep prod post-run disabled until explicitly launched
- perform a controlled prod post-run smoke test when ready

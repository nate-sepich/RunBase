# RunBase Implementation Checklist

Status: Draft  
Last updated: 2026-03-28

## Goal

Ship a durable cloud-hosted messaging/runtime layer for:
- daily training brief
- post-run reflection prompt
- reply capture

Keep existing GitHub Actions ETL + Astro site deployment in place.

## Phase 0 — Decision lock
- [x] Confirm **AWS** as the target cloud
- [x] Confirm **Telegram** as v1 transport (Twilio remains fallback only)
- [ ] Confirm whether reflection replies need to appear on the public/site UI in v1
- [ ] Confirm acceptable post-run scan interval (recommended: 10–15 min)
- [x] Confirm daily brief + post-run share the same chat/channel per environment
- [x] Confirm separate `dev` and `prod` environments
- [x] Confirm secrets source of truth is **GitHub Environments**, with deploy/bootstrap sync into AWS

## Phase 1 — Repo logic cleanup
- [x] Extract daily brief generation into reusable modules under `src/lib/server/`
- [x] Remove hard dependency on `imsg` from daily brief logic
- [x] Define transport-ready message generation boundaries for:
  - [x] daily brief
  - [x] post-run reflection prompt
  - [ ] optional confirmation / follow-up messages
- [x] Reuse shared post-run logic from `src/lib/server/postRun.js`
  - [x] plan matching
  - [x] adherence classification
  - [x] reflection prompt generation
- [x] Decide where runtime-only state lives vs what belongs in `runs.json`
  - runtime delivery/reply state → DynamoDB
  - site-visible run metadata can remain in `runs.json` when/if synced back intentionally

## Phase 2 — AWS app scaffold
- [x] Create SAM app in repo (`infra/`)
- [x] Define environments/stages (`dev`, `prod`)
- [x] Add Lambda for `sendDailyBrief`
- [x] Add Lambda for `scanPostRunPrompts`
- [x] Add Lambda for `handleIncomingMessage`
- [x] Add API Gateway route for webhook delivery
- [x] Add EventBridge schedules for:
  - [x] daily brief
  - [x] post-run scan
- [x] Add DynamoDB table for message state / idempotency
- [x] Add secrets wiring for messaging credentials via SAM parameters / env vars

## Phase 3 — Transport adapter
### Preferred: Telegram
- [x] Implement `sendTelegramMessage()` adapter
- [x] Implement webhook/update parsing baseline
- [x] Map inbound replies to prompt/activity context via replied-to Telegram message id
- [x] Store Telegram message ids for correlation/debugging

### Alternative: Twilio
- [ ] Implement SMS send adapter
- [ ] Implement inbound SMS webhook parsing
- [ ] Store message ids/status for correlation/debugging

## Phase 4 — Daily brief runtime
- [x] Lambda reads training plan + athlete config + current context
- [x] Generate daily brief text from shared logic
- [x] Send via chosen transport
- [x] Persist delivery result to DynamoDB
- [x] Add idempotency guard to avoid duplicate same-day sends
- [x] Add logging and failure visibility
- [x] Deploy and validate against dev Telegram chat

## Phase 5 — Post-run reflection runtime
- [x] Read latest run data source
- [x] Find newly eligible activities lacking prompt state
- [x] Compute matched plan + adherence summary
- [x] Generate reflection prompt
- [x] Send prompt via chosen transport
- [x] Persist prompt state to DynamoDB
- [x] Add idempotency so the same run is not prompted twice
- [x] Deploy and validate against dev Telegram chat

## Phase 6 — Reply capture
- [x] Accept inbound webhook from transport
- [x] Resolve reply to tracked run prompt via replied-to Telegram message
- [x] Persist reply text and timestamps
- [x] Decide to write canonical prompt/reply state back into `data/runs.json`
- [x] Define sync path clearly: DynamoDB operational state + GitHub-backed `runs.json` canonical state
- [x] Deploy and validate webhook end-to-end (synthetic webhook test in dev)

## Phase 7 — Operational polish
- [ ] CloudWatch alarms for repeated failures
- [ ] Retry / dead-letter strategy if needed
- [ ] Basic runbook for secrets rotation
- [x] Document local dev flow
- [x] Document deploy flow
- [x] Remove obsolete iMessage-based GitHub Actions behavior from `daily-brief.yml`

## Recommended order of execution
1. Refactor repo logic away from `imsg`
2. Create AWS/SAM scaffold in `us-east-2`
3. Implement Telegram adapter
4. Stand up daily brief Lambda end-to-end
5. Stand up post-run scan Lambda end-to-end
6. Add inbound reply webhook
7. Decide on site-data sync for reflections
8. Remove obsolete local/iMessage workflow
9. Add GitHub Environment → AWS secret sync/bootstrap flow

## Definition of done
- [x] Daily brief can send from cloud without Mac dependency (validated in dev)
- [x] Post-run prompts can send from cloud for eligible new runs (validated in dev)
- [x] Replies can be captured and stored durably (validated in dev)
- [x] Canonical prompt/reply state can sync back into `data/runs.json` (validated in dev)
- [x] Obsolete iMessage path is removed or retired
- [x] Repo docs reflect the new architecture
- [ ] Full production cutover executed safely (daily brief is cut over; prod post-run remains intentionally disabled)

# RunBase Repo Refactor Plan

Status: Draft  
Last updated: 2026-03-28

## Objective

Refactor RunBase so the training logic is reusable from:
- local scripts
- GitHub Actions
- AWS Lambda
- future transports

The key principle:
> **message generation logic should not know how delivery happens**

## Current state

### Already in decent shape
- `src/lib/postRun.ts`
  - plan matching
  - adherence classification
  - reflection prompt generation
- `scripts/post-run-brief.js`
  - already behaves mostly like a handoff producer

### Needs refactor
- `scripts/daily-brief.js`
  - mixes message generation with `imsg` delivery
  - still has Mac/local assumptions baked in
- runtime state strategy
  - currently some reflection data is embedded in `runs.json`
  - durable messaging state should move to a cloud state store

## Proposed target structure

```text
RunBase/
  app/
    ARCHITECTURE_OUTLINE.md
    IMPLEMENTATION_CHECKLIST.md
    REFACTOR_PLAN.md
    NATE_SETUP_CHECKLIST.md
  src/
    lib/
      format.ts
      types.ts
      postRun.ts
      dailyBrief.ts          # new: generate daily brief content only
      trainingPlan.ts        # new: shared date/session resolution helpers
      athlete.ts             # new: shared athlete config loader/helpers
      transport/
        types.ts             # message payload contracts
  scripts/
    daily-brief.js          # thin wrapper around shared daily brief logic
    post-run-brief.js       # thin wrapper around shared post-run logic
  infra/
    template.yaml
    samconfig.toml
    src/
      functions/
        sendDailyBrief.ts
        scanPostRunPrompts.ts
        handleIncomingMessage.ts
      shared/
        telegram.ts
        awsConfig.ts
```

## Refactor steps

### Step 1 — Extract training-plan helpers
Move duplicated date/session logic into shared helpers.

#### Candidate module
- `src/lib/trainingPlan.ts`

#### Move here
- week start calculation
- session date calculation
- ISO date helpers
- current week resolution
- today's session lookup

#### Current duplication exists in
- `scripts/daily-brief.js`
- `scripts/post-run-brief.js`
- `src/pages/plan.astro`
- `src/lib/postRun.ts`

### Step 2 — Extract daily brief generation
Create a pure generator module.

#### Candidate module
- `src/lib/dailyBrief.ts`

#### Responsibilities
- resolve today's session
- fetch/normalize weather data or accept weather as input
- generate nutrition recommendations
- produce final message text + metadata

#### Important rule
No transport calls here.
No `execFileSync`.
No `imsg`.

### Step 3 — Standardize message payloads
Create shared contracts for outbound/inbound messaging.

#### Candidate module
- `src/lib/transport/types.ts`

#### Suggested shapes
- `DailyBriefMessage`
- `PostRunPromptMessage`
- `InboundReplyPayload`
- `DeliveryResult`

This keeps Lambda code thin and reduces glue duplication.

### Step 4 — Make scripts thin wrappers
Keep local scripts, but turn them into adapters.

#### `scripts/daily-brief.js`
Should do:
- load config/data
- call shared generator
- print output or send via chosen adapter in local/dev mode

#### `scripts/post-run-brief.js`
Should do:
- load run data
- call shared post-run helpers
- print/store handoff payload

### Step 5 — Split durable state from published site data

#### Keep in repo/site data
- run activity data
- matched plan snapshot if needed for UI
- curated reflection data if you want it visible on site

#### Move to runtime store
- prompt sent timestamps
- transport message ids
- webhook correlation state
- retries / delivery status
- temporary reply routing state

This prevents `runs.json` from becoming the operational database.

### Step 6 — Retire obsolete iMessage path
After cloud path is live:
- remove `imsg` transport code
- remove local-only GitHub Actions assumptions
- disable/remove obsolete workflow(s)

## Recommended boundaries

### Repo logic owns
- what today’s session is
- how adherence is classified
- what the brief/prompt text says
- what data shape the UI needs

### Cloud runtime owns
- when to send
- how to send
- how to correlate replies
- retries / failure handling
- idempotency

## First concrete edits I would make
1. Create `src/lib/trainingPlan.ts`
2. Create `src/lib/dailyBrief.ts`
3. Move duplicated helper logic into shared modules
4. Update `scripts/daily-brief.js` to become a thin wrapper
5. Keep `src/lib/postRun.ts` as the canonical post-run logic core
6. Add transport type contracts
7. Only then start the SAM/AWS layer

## Success criteria
- one source of truth for training-plan date/session resolution
- one source of truth for daily brief generation
- one source of truth for post-run prompt generation
- no delivery mechanism hardcoded into business logic
- AWS functions can reuse repo logic with minimal glue

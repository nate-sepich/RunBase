# RunBase Cloud Architecture Outline

Status: Draft  
Last updated: 2026-03-28

## Recommendation

Build the durable messaging/runtime layer on **AWS** using **SAM**, with **Telegram-first** delivery.

Why this stack:
- event-driven workload fits Lambda well
- easy scheduled jobs + webhook endpoints
- SAM CLI is already installed locally and AWS CLI access is working
- lower ceremony than introducing another framework when plain AWS/serverless is enough
- avoids Mac/iMessage dependency

If phone-native delivery becomes mandatory, swap the transport adapter to **Twilio SMS**.

## Locked decisions

- **Cloud:** AWS
- **Infra/deploy tool:** SAM
- **Primary region:** `us-east-2` (Ohio) — closest practical AWS region to Iowa
- **Messaging transport:** Telegram
- **Prod chat:** `-5176531716`
- **Dev chat:** `-5210721420`
- **Daily brief + post-run channel policy:** same chat per environment
- **Environment split:** separate `dev` and `prod`
- **Secrets source of truth:** GitHub Environment secrets; AWS receives synced copies during deploy/bootstrap, but GitHub remains canonical

## Keep vs Move

### Keep in GitHub / repo
- Strava ETL (`scripts/ingest.js`)
- Astro site build/deploy
- core training logic in repo modules:
  - daily brief generation
  - plan matching
  - adherence summary
  - reflection prompt generation

### Move to AWS
- scheduled daily brief delivery
- scheduled post-run prompt detection
- inbound reply webhook handling
- messaging state / idempotency
- secrets storage
- logs / alerting

## Proposed AWS Resources

### Compute / orchestration
- **SAM app / CloudFormation stack** to define and deploy infra
- **Lambda: `sendDailyBrief`**
  - scheduled each morning
  - generates today's brief
  - sends via Telegram (or Twilio)
- **Lambda: `scanPostRunPrompts`**
  - runs on a short interval (for example every 10–15 min)
  - finds newly eligible runs
  - computes plan match + adherence
  - sends reflection prompt if not already sent
- **Lambda: `handleIncomingMessage`**
  - webhook endpoint for Telegram updates (or Twilio inbound SMS)
  - matches reply to athlete/activity context
  - stores reflection reply

### Scheduling / ingress
- **EventBridge Scheduler**
  - triggers `sendDailyBrief`
  - triggers `scanPostRunPrompts`
- **API Gateway**
  - exposes webhook endpoint for inbound replies

### State / secrets / ops
- **DynamoDB**
  - prompt state
  - reply state
  - idempotency / delivery bookkeeping
- **Secrets Manager** or **SSM Parameter Store**
  - Telegram bot token or Twilio creds
  - optional GitHub token / repo access token if needed
- **CloudWatch**
  - logs
  - alarm on repeated Lambda failures

## Suggested Data Model

### DynamoDB table: `runbase-message-state`
Partition key can be `pk`, sort key `sk`.

Suggested items:
- `RUN#<activity_id>` / `PROMPT`
  - prompt sent timestamp
  - channel
  - message id
  - delivery status
  - matched plan snapshot
- `RUN#<activity_id>` / `REPLY`
  - reply text
  - reply received timestamp
  - source user/channel
- `DAILY#<yyyy-mm-dd>` / `BRIEF`
  - sent timestamp
  - target
  - delivery status

This keeps operational state out of git-tracked JSON.

## Recommended Data Flow

### 1) Daily brief
1. EventBridge triggers `sendDailyBrief`
2. Lambda loads training data + athlete config + latest run context
3. Lambda generates brief text
4. Lambda sends via Telegram bot
5. Lambda writes delivery result to DynamoDB

### 2) Post-run prompt
1. Strava ETL continues updating `data/runs.json` in GitHub
2. `scanPostRunPrompts` runs every 10–15 min
3. Lambda reads latest repo data (or later: an exported artifact/event)
4. Lambda identifies runs without prompt state
5. Lambda computes matched plan + adherence
6. Lambda sends reflection prompt
7. Lambda writes prompt state to DynamoDB

### 3) Reply capture
1. Gabe replies in Telegram
2. Telegram webhook hits API Gateway → `handleIncomingMessage`
3. Lambda resolves which recent run/prompt the reply belongs to
4. Lambda stores reply text in DynamoDB
5. Optional follow-up sync writes selected reflection data back into RunBase site data

## Recommended v1 simplification

To ship quickly:
- keep **GitHub Actions** as the source of fresh Strava/site data
- let AWS functions **read repo data** rather than re-platforming the whole pipeline
- keep reply state in DynamoDB
- decide later whether reflection data should sync back into `runs.json`

That gives durability without rewriting the whole app.

## Tooling Nate needs to set up

### AWS
- AWS account / target environment to use ✅
- IAM access for deployment from local machine ✅
- local AWS CLI access available ✅
- SAM CLI available locally ✅
- permission to create:
  - Lambda
  - API Gateway
  - EventBridge schedules
  - DynamoDB table
  - Secrets Manager / SSM params
  - CloudWatch alarms/log groups

### Messaging
Choose one:

#### Preferred: Telegram
- Telegram chosen for v1 ✅
- bot token provided out-of-band / in chat; do **not** commit it to repo
- prod chat ID confirmed: `-5176531716`
- dev chat ID confirmed: `-5210721420`
- if webhook mode is used, allow webhook registration

#### Alternative: Twilio
- Twilio account
- phone number
- account SID / auth token
- target phone number
- approval for SMS cost / usage

### Optional support pieces
- GitHub Environment secrets for `dev` and `prod` should be the source of truth
- deploy/bootstrap commands can mirror those secrets into AWS SSM/Secrets Manager as needed
- GitHub fine-grained token if AWS runtime needs repo reads beyond public raw access
- custom domain only if you want cleaner webhook URLs (not required for v1)

## Actions Nate needs to take

### Required from Nate
- choose **Telegram vs Twilio**
- choose / provide **AWS environment**
- provide the necessary secrets/credentials
- approve any billing-bearing services
- if Telegram: create bot + share target chat details
- if Twilio: create number + share credentials / destination

### Helpful but optional from Nate
- decide whether reflections should be visible on the public/site UI in v1
- decide acceptable polling frequency for post-run prompts
- decide whether daily brief should remain in the same channel as post-run replies

## Actions Clawdio can do

Without additional external setup, Clawdio can:
- refactor RunBase logic into transport-agnostic modules
- write the SST app / infra code
- implement Lambda handlers
- implement Telegram or Twilio adapter code
- define DynamoDB schema and idempotency rules
- add docs and local runbooks
- update the RunBase repo structure and wiring
- test locally where credentials are available

## Initial build sequence

1. Refactor repo logic into reusable modules
2. Stand up AWS infra via SST
3. Implement Telegram delivery path
4. Wire daily brief Lambda
5. Wire post-run scanner Lambda
6. Wire inbound reply webhook
7. Decide whether/how to sync replies back into site data

## Recommendation in one sentence

Use **AWS + SAM + Telegram-first** for the durable runtime, keep **GitHub Actions + Astro** for ETL/site publishing, and keep RunBase's training logic transport-agnostic so delivery can evolve without rewriting the app.

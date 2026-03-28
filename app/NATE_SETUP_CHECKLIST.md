# Nate Setup Checklist

Status: Draft  
Last updated: 2026-03-28

## Goal

Everything Nate needs to set up or decide so Clawdio can build the durable cloud runtime.

## 1) Decisions to make

### Required
- [x] Confirm **AWS** as the target cloud
- [x] Confirm **Telegram** as v1 messaging transport
  - [x] Twilio is fallback only, not v1
- [ ] Decide whether post-run reflection replies should show up on the RunBase site in v1
- [ ] Decide preferred scan interval for new run prompts
  - recommendation: **10–15 minutes**

### Nice to decide early
- [x] Daily brief and post-run replies should live in the same chat/channel per environment
- [x] Separate `dev` and `prod` environments

## 2) AWS setup Nate needs to do

### Account / environment
- [x] AWS account / environment chosen
- [x] Region chosen: `us-east-2` (Ohio)

### Access for deployment
Provide a way for Clawdio to deploy from the local machine:
- [x] AWS CLI access configured locally
- [x] SAM CLI installed locally
- [x] confirm permissions to create/update:
  - [ ] Lambda
  - [ ] API Gateway
  - [ ] EventBridge Scheduler
  - [ ] DynamoDB
  - [ ] Secrets Manager or SSM Parameter Store
  - [ ] CloudWatch logs/alarms
  - [ ] IAM roles/policies required by the app

### Optional but helpful
- [ ] If you already have naming/tagging conventions, provide them
- [ ] If you want budget guardrails, set them up now

## 3) Messaging setup Nate needs to do

### Preferred path: Telegram
- [x] Telegram bot created
- [x] Bot token available (treat as secret; do not commit to repo/docs)
- [x] Bot added to prod target chat
- [x] Prod chat ID confirmed: `-5176531716`
- [x] Dev chat ID confirmed: `-5210721420`
- [ ] If needed, confirm bot permission posture / webhook readiness

### If using Twilio instead
- [ ] Create/confirm Twilio account
- [ ] Buy or select sending number
- [ ] Provide/store:
  - [ ] account SID
  - [ ] auth token
  - [ ] from number
  - [ ] Gabe destination number
- [ ] Approve usage/cost expectations

## 4) Secrets Nate needs to make available

### GitHub Environments are the source of truth
Use GitHub Environment secrets as canonical for `dev` and `prod`. Deploy/bootstrap flows should copy secrets into AWS as needed, but not make AWS the source of truth.

Suggested secret names:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `AWS_REGION`
- optional: `RUNBASE_GITHUB_WRITE_TOKEN`

### AWS runtime secrets
- [x] Telegram bot token available
- [ ] any repo access token if runtime needs authenticated repo reads

### Existing RunBase-related secrets to confirm remain available
- [ ] Strava client id
- [ ] Strava client secret
- [ ] Strava refresh token
- [ ] GitHub token/PAT if still needed for rotation or repo writes

## 5) What Nate must do vs what Clawdio can do

### Nate must do
- [ ] make the cloud/transport decisions
- [ ] create or expose credentials
- [ ] approve billing-bearing services
- [ ] create the Telegram bot or Twilio account resources
- [ ] ensure local machine has deployable AWS access

### Clawdio can do after setup exists
- [ ] scaffold SST app
- [ ] write infra definitions
- [ ] implement Lambda handlers
- [ ] implement Telegram/Twilio adapters
- [ ] refactor repo logic
- [ ] wire state persistence
- [ ] add runbooks/docs
- [ ] test and iterate

## 6) Minimal handoff Nate can give to unblock build

If you want the smallest possible unblocker, provide:
- [x] AWS credentials/profile usable from this machine
- [x] chosen AWS region
- [x] Telegram bot token
- [x] target prod Telegram chat ID
- [x] target dev Telegram chat ID
- [x] confirmation that AWS + Telegram is the chosen v1 path

Once the GitHub Environment secrets are populated for `dev` and `prod`, Clawdio can start implementation without waiting on much else.

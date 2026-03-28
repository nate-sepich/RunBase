# RunBase SAM Runtime

Durable cloud runtime for:
- daily training brief
- post-run prompt scan
- inbound Telegram reply capture
- canonical `data/runs.json` sync for post-run prompt/reply state

## Region
- `us-east-2`

## Deploy model
GitHub Environments remain the source of truth for secrets.
For deploys, provide these as environment variables locally or in CI:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RUNBASE_GITHUB_WRITE_TOKEN` (required for AWS to sync post-run prompt/reply state back into `data/runs.json`)

Then deploy with SAM parameter overrides.

## GitHub Actions CD
A manual deployment workflow now exists at:
- `.github/workflows/deploy-runtime.yml`

Recommended use:
- **dev**: safe to use for routine environment deploys
- **prod**: use via GitHub Environment approval / manual dispatch, not auto-on-push

Expected GitHub Environment secrets:
- `AWS_REGION`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RUNBASE_GITHUB_WRITE_TOKEN`
- either:
  - `AWS_ROLE_TO_ASSUME` (preferred), or
  - `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (+ optional `AWS_SESSION_TOKEN`)

Current state:
- GitHub OIDC provider is configured in AWS for this account
- deploy role exists: `GitHubActionsRunBaseDeployRole`
- `AWS_ROLE_TO_ASSUME` is populated in the RunBase `dev` and `prod` GitHub Environments

The workflow also verifies actual EventBridge rule state after deploy so schedule drift is caught immediately.

## Example deploy

### Dev
```bash
cd infra
sam deploy --config-env dev \
  --parameter-overrides \
    Stage=dev \
    EnableDailyBriefSchedule=false \
    EnablePostRunScanSchedule=false \
    TelegramBotToken="$TELEGRAM_BOT_TOKEN" \
    TelegramChatId="$TELEGRAM_CHAT_ID" \
    RunBaseGithubWriteToken="$RUNBASE_GITHUB_WRITE_TOKEN"
```

### Prod (dark launch by default)
```bash
cd infra
sam deploy --config-env prod \
  --parameter-overrides \
    Stage=prod \
    EnableDailyBriefSchedule=false \
    EnablePostRunScanSchedule=false \
    TelegramBotToken="$TELEGRAM_BOT_TOKEN" \
    TelegramChatId="$TELEGRAM_CHAT_ID" \
    RunBaseGithubWriteToken="$RUNBASE_GITHUB_WRITE_TOKEN"
```

## After deploy
- capture the `TelegramWebhookUrl` output
- register it with the chosen Telegram bot webhook

Example:
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$TELEGRAM_WEBHOOK_URL"
```

## Current scope
- production daily brief is cut over to AWS
- production post-run remains intentionally disabled pending separate launch
- prompt/reply state now syncs back into `data/runs.json`
- DynamoDB remains the operational state store for delivery ids, correlation, idempotency, and sync bookkeeping

## Ops notes
- CloudWatch error alarms are created per Lambda function
- Lambda log groups already exist in AWS; retention can be tuned later if desired without blocking rollout
- see `docs/OPS_RUNBOOK.md` for rollout, rollback, and first-live-cycle checks

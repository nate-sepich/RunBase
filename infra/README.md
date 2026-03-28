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

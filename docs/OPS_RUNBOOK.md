# RunBase AWS Ops Runbook

Status: Draft  
Last updated: 2026-03-28

## Scope

Operational notes for the AWS/SAM messaging runtime that now owns the production daily brief and will later own production post-run messaging.

## Current production state

- **Prod daily brief:** AWS schedule enabled
- **Prod post-run:** disabled
- **Old OpenClaw daily brief cron:** disabled, preserved for rollback
- **Webhook:** registered on the prod bot
- **Region:** `us-east-2`

## Core AWS resources

- CloudFormation stack: `runbase-messaging-prod`
- DynamoDB table: `RunBaseMessagingState-prod`
- HTTP API base: `https://d0zenb4adf.execute-api.us-east-2.amazonaws.com/prod`
- Telegram webhook: `https://d0zenb4adf.execute-api.us-east-2.amazonaws.com/prod/telegram/webhook`

## Schedules

### Prod
- Daily brief rule: `RunBaseDailyBrief-prod`
- Post-run scan rule: `RunBasePostRunScan-prod`

### Dev
- Daily brief rule: `RunBaseDailyBrief-dev`
- Post-run scan rule: `RunBasePostRunScan-dev`

## Alarms

Expected alarms after ops polish deploy:
- `RunBase-prod-SendDailyBrief-Errors`
- `RunBase-prod-ScanPostRunPrompts-Errors`
- `RunBase-prod-HandleIncomingMessage-Errors`

Default posture:
- alarm on any Lambda errors in the last 5 minutes
- treat missing data as not breaching

Note:
- explicit Lambda log-group retention is not enforced by the stack right now because the log groups already exist from prior deploys; that can be tuned later as a separate cleanup if desired.

## First live-cycle checks

For the first real AWS production daily-brief runs, verify:
- message lands in the correct prod Telegram chat
- link is `https://nate-sepich.github.io/RunBase`
- local-time wording looks sane
- no duplicate send occurs
- DynamoDB daily brief entry is written
- CloudWatch logs are clean

## Prod post-run launch checklist

Before enabling prod post-run schedule:
1. confirm prod post-run rule is still disabled
2. manually invoke prod post-run once in a controlled window
3. verify prompt lands in the prod chat
4. reply to the prompt from Telegram
5. verify reply capture in DynamoDB
6. verify prompt/reply sync back into `data/runs.json`
7. only then enable `RunBasePostRunScan-prod`

## Rollback

If daily brief has a production issue:
1. disable `RunBaseDailyBrief-prod`
2. re-enable the old OpenClaw RunBase daily brief cron
3. inspect CloudWatch logs for the failing Lambda
4. inspect DynamoDB daily brief entry for the attempted run
5. fix forward, then cut back again when safe

If post-run has a production issue after future launch:
1. disable `RunBasePostRunScan-prod`
2. leave daily brief schedule alone unless it is also implicated
3. inspect CloudWatch logs for prompt/reply flow
4. inspect DynamoDB sync status fields
5. verify whether `data/runs.json` sync partially succeeded

## Token / secret hygiene

Current secret used by AWS runtime for repo writeback:
- `RUNBASE_GITHUB_WRITE_TOKEN`

Best-practice cleanup still recommended:
- replace the current temporary value with a dedicated fine-grained PAT scoped narrowly to the RunBase repo/write path
- update both GitHub environments (`dev`, `prod`)
- redeploy after rotation if desired

## Handy commands

### Check prod rules
```bash
aws events describe-rule --name RunBaseDailyBrief-prod --region us-east-2
aws events describe-rule --name RunBasePostRunScan-prod --region us-east-2
```

### Disable prod rules
```bash
aws events disable-rule --name RunBaseDailyBrief-prod --region us-east-2
aws events disable-rule --name RunBasePostRunScan-prod --region us-east-2
```

### Enable prod daily brief only
```bash
aws events enable-rule --name RunBaseDailyBrief-prod --region us-east-2
```

### Manual prod daily brief invoke
```bash
SEND_FN=$(aws cloudformation describe-stack-resource \
  --stack-name runbase-messaging-prod \
  --logical-resource-id SendDailyBriefFunction \
  --region us-east-2 \
  --query 'StackResourceDetail.PhysicalResourceId' \
  --output text)

aws lambda invoke \
  --function-name "$SEND_FN" \
  --region us-east-2 \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' /tmp/runbase-prod-send-daily.json
```

## Rule of thumb

- Daily brief production is live on AWS now.
- Post-run production is a separate launch, not an automatic part of the daily-brief cutover.

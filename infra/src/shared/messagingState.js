import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client);

function tableName() {
  const value = process.env.MESSAGING_STATE_TABLE;
  if (!value) throw new Error('Missing MESSAGING_STATE_TABLE');
  return value;
}

export async function getDailyBriefState({ stage, date }) {
  const command = new GetCommand({
    TableName: tableName(),
    Key: {
      pk: `DAILY#${stage}#${date}`,
      sk: 'BRIEF',
    },
  });

  const result = await doc.send(command);
  return result.Item ?? null;
}

export async function markDailyBriefSent({ stage, date, chatId, telegramMessageId, sessionType, messageText, sentAt }) {
  const command = new PutCommand({
    TableName: tableName(),
    Item: {
      pk: `DAILY#${stage}#${date}`,
      sk: 'BRIEF',
      entityType: 'dailyBrief',
      stage,
      date,
      chatId,
      telegramMessageId,
      sessionType,
      messageText,
      sentAt,
    },
  });

  await doc.send(command);
}

export async function getPromptStateByRun(activityId) {
  const command = new GetCommand({
    TableName: tableName(),
    Key: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
    },
  });

  const result = await doc.send(command);
  return result.Item ?? null;
}

export async function getPromptIndexByTelegramMessage({ chatId, messageId }) {
  const command = new GetCommand({
    TableName: tableName(),
    Key: {
      pk: `TG#${chatId}#${messageId}`,
      sk: 'PROMPT',
    },
  });

  const result = await doc.send(command);
  return result.Item ?? null;
}

export async function markPromptSent({
  activityId,
  chatId,
  telegramMessageId,
  promptText,
  promptSentAt,
  matchedPlan,
  adherence,
  stage,
}) {
  await doc.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: `RUN#${activityId}`,
        sk: 'PROMPT',
        entityType: 'runPrompt',
        activityId,
        stage,
        chatId,
        telegramMessageId,
        promptText,
        promptSentAt,
        matchedPlan,
        adherence,
      },
    }),
  );

  await doc.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: `TG#${chatId}#${telegramMessageId}`,
        sk: 'PROMPT',
        entityType: 'telegramPromptIndex',
        activityId,
        stage,
        chatId,
        telegramMessageId,
        promptSentAt,
      },
    }),
  );
}

export async function markReplyReceived({
  activityId,
  replyText,
  replyReceivedAt,
  fromUserId,
  fromUsername,
  chatId,
}) {
  const command = new UpdateCommand({
    TableName: tableName(),
    Key: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
    },
    UpdateExpression:
      'SET replyText = :replyText, replyReceivedAt = :replyReceivedAt, fromUserId = :fromUserId, fromUsername = :fromUsername, replyChatId = :chatId',
    ExpressionAttributeValues: {
      ':replyText': replyText,
      ':replyReceivedAt': replyReceivedAt,
      ':fromUserId': fromUserId,
      ':fromUsername': fromUsername,
      ':chatId': chatId,
    },
  });

  await doc.send(command);
}

export async function markPromptSyncStatus({ activityId, status, syncedAt = null, errorMessage = null }) {
  const command = new UpdateCommand({
    TableName: tableName(),
    Key: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
    },
    UpdateExpression:
      'SET promptSyncStatus = :status, promptSyncedAt = :syncedAt, promptSyncError = :errorMessage',
    ExpressionAttributeValues: {
      ':status': status,
      ':syncedAt': syncedAt,
      ':errorMessage': errorMessage,
    },
  });

  await doc.send(command);
}

export async function markReplySyncStatus({ activityId, status, syncedAt = null, errorMessage = null }) {
  const command = new UpdateCommand({
    TableName: tableName(),
    Key: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
    },
    UpdateExpression:
      'SET replySyncStatus = :status, replySyncedAt = :syncedAt, replySyncError = :errorMessage',
    ExpressionAttributeValues: {
      ':status': status,
      ':syncedAt': syncedAt,
      ':errorMessage': errorMessage,
    },
  });

  await doc.send(command);
}

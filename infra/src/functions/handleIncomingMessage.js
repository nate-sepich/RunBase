import { getPromptIndexByTelegramMessage, markReplyReceived, markReplySyncStatus } from '../shared/messagingState.js';
import { syncReplyToRunsJson } from '../shared/repoSync.js';

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export const handler = async (event) => {
  try {
    const body = event?.body ? JSON.parse(event.body) : {};
    const message = body?.message;

    if (!message?.text) {
      return json(200, { ok: true, ignored: 'no text message' });
    }

    const chatId = String(message.chat?.id ?? '');
    const replyToMessageId = message.reply_to_message?.message_id;

    if (!chatId || !replyToMessageId) {
      return json(200, { ok: true, ignored: 'message was not a reply to a tracked prompt' });
    }

    const promptIndex = await getPromptIndexByTelegramMessage({
      chatId,
      messageId: replyToMessageId,
    });

    if (!promptIndex?.activityId) {
      return json(200, { ok: true, ignored: 'no tracked prompt for replied-to message' });
    }

    const replyReceivedAt = new Date().toISOString();

    await markReplyReceived({
      activityId: promptIndex.activityId,
      replyText: message.text,
      replyReceivedAt,
      fromUserId: String(message.from?.id ?? ''),
      fromUsername: message.from?.username ?? null,
      chatId,
    });

    let replySyncStatus = 'skipped';
    try {
      await syncReplyToRunsJson({
        activityId: promptIndex.activityId,
        replyText: message.text,
        replyReceivedAt,
      });
      replySyncStatus = 'synced';
      await markReplySyncStatus({ activityId: promptIndex.activityId, status: 'synced', syncedAt: new Date().toISOString() });
    } catch (error) {
      replySyncStatus = 'pending';
      console.error('[handleIncomingMessage] runs.json reply sync failed', error);
      await markReplySyncStatus({
        activityId: promptIndex.activityId,
        status: 'pending',
        errorMessage: error.message || String(error),
      });
    }

    return json(200, {
      ok: true,
      activityId: promptIndex.activityId,
      replyCaptured: true,
      replySyncStatus,
    });
  } catch (error) {
    console.error('[handleIncomingMessage] error', error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};

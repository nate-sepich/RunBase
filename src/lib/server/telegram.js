export async function sendTelegramMessage({ botToken, chatId, text, disableWebPagePreview = true }) {
  if (!botToken) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  if (!chatId) {
    throw new Error('Missing TELEGRAM_CHAT_ID');
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: disableWebPagePreview,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram API failed: ${response.status}`);
  }

  return payload.result;
}

import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "../constants.js"

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

export async function sendTelegramMessage(text) {
  const response = await fetch(`${BASE_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
    }),
  })

  const data = await response.json()
  if (!data.ok) {
    throw new Error(`Telegram sendMessage failed: ${data.description}`)
  }

  return data.result
}

export async function editTelegramMessage(messageId, text) {
  const response = await fetch(`${BASE_URL}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }),
  })

  const data = await response.json()
  if (!data.ok) {
    if (data.description?.includes("message is not modified")) {
      console.log("ℹ️ Telegram message unchanged, skip edit.")
      return
    }
    throw new Error(`Telegram editMessageText failed: ${data.description}`)
  }

  return data.result
}

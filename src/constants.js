import path from "node:path"

export const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  NTFY_URL,
  NTFY_TOPIC,
  NTFY_AUTH_TOKEN,
  CITY,
  STREET,
  HOUSE,
} = process.env

export const SHUTDOWNS_PAGE = "https://www.dtek-oem.com.ua/ua/shutdowns"
export const CRON_INITIAL_INTERVAL = parseInt(process.env.CRON_INITIAL_INTERVAL || "2", 10)
export const CRON_INTERVAL = parseInt(process.env.CRON_INTERVAL || "10", 10)
export const PORT = parseInt(process.env.PORT || "3000", 10)

export const LAST_MESSAGE_FILE = path.resolve("artifacts", "last-message.json")
export const STATE_FILE = path.resolve("artifacts", "state.json")

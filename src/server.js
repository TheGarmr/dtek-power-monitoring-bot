import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  PORT,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  CRON_INITIAL_INTERVAL,
  CRON_INTERVAL,
} from "./constants.js"
import api from "./api.js"
import { startCron } from "./cron/cron.js"
import { startNtfyListener } from "./ntfy/listener.js"
import {
  loadState,
  addEntry,
  getEntry,
  removeEntry,
} from "./store/store.js"
import {
  getInfo,
  resolveOutage,
  normalizeHouses,
} from "./monitor.js"
import {
  sendTelegramMessage,
  editTelegramMessage,
  deleteTelegramMessage,
} from "./telegram/sender.js"
import {
  messageDownWithInfo,
  messageDownNoInfo,
  messageRestored,
} from "./telegram/messages.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const addressesPath = path.resolve(__dirname, "config", "addresses.json")
const ADDRESSES = JSON.parse(fs.readFileSync(addressesPath, "utf8"))

if (!TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN")
if (!TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_CHAT_ID")

async function handleDown(alias) {
  const address = ADDRESSES[alias]
  if (!address) {
    console.log(`⚠️ Unknown alias: "${alias}", ignoring DOWN event.`)
    return
  }

  if (getEntry(alias)) {
    console.log(`ℹ️ ${alias} already monitored, ignoring duplicate DOWN.`)
    return
  }

  const { city, street } = address
  const houses = normalizeHouses(address)
  console.log(`⬇️ DOWN: ${alias} (${city}, ${street} ${houses.join(", ")})`)

  const downSince = new Date().toISOString()
  let info = null
  let hasInfo = false
  let resolvedHouse = null
  let message

  try {
    info = await getInfo({ city, street })
    resolvedHouse = resolveOutage(info, houses)
    hasInfo = resolvedHouse !== null

    message = hasInfo
      ? messageDownWithInfo(alias, { city, street, house: resolvedHouse }, info)
      : messageDownNoInfo(alias, { city, street, house: houses[0] }, downSince)
  } catch (error) {
    console.error(`❌ Failed to get DTEK info for ${alias}:`, error.message)
    message = messageDownNoInfo(alias, { city, street, house: houses[0] }, downSince)
  }

  try {
    const result = await sendTelegramMessage(message)
    addEntry(alias, {
      ...address,
      telegramMessageId: result.message_id,
      telegramMessageDate: result.date,
      downSince,
      lastInfo: info,
      resolvedHouse,
      checkInterval: hasInfo ? CRON_INTERVAL : CRON_INITIAL_INTERVAL,
    })
    console.log(`✅ ${alias}: Telegram message sent (id: ${result.message_id})`)
  } catch (error) {
    console.error(
      `❌ Failed to send Telegram message for ${alias}:`,
      error.message
    )
  }
}

async function handleUp(alias) {
  const entry = getEntry(alias)
  if (!entry) {
    console.log(`ℹ️ ${alias} not monitored, ignoring UP event.`)
    return
  }

  const {
    city,
    street,
    telegramMessageId,
    newScheduleMessageId,
    downSince,
  } = entry
  const houses = normalizeHouses(entry)
  console.log(`⬆️ UP: ${alias} (${city}, ${street} ${houses.join(", ")})`)

  const message = messageRestored(alias, { city, street, house: houses[0] }, downSince)

  try {
    if (telegramMessageId) {
      await editTelegramMessage(telegramMessageId, message)
      console.log(`✅ ${alias}: Telegram message edited with restoration info.`)
    }
  } catch (error) {
    console.error(
      `❌ Failed to edit Telegram message for ${alias}:`,
      error.message
    )
  }

  if (newScheduleMessageId) {
    try {
      await deleteTelegramMessage(newScheduleMessageId)
      console.log(`🗑️ ${alias}: new schedule notice deleted.`)
    } catch (error) {
      console.error(
        `❌ Failed to delete new schedule notice for ${alias}:`,
        error.message
      )
    }
  }

  removeEntry(alias)
  console.log(`🗑️ ${alias}: removed from monitoring.`)
}

loadState()

api.listen(PORT, () => {
  console.log(`🌐 Health API listening on port ${PORT}`)
})

startCron()

startNtfyListener({
  onDown: handleDown,
  onUp: handleUp,
})

console.log("🚀 dtek-monitor service started.")

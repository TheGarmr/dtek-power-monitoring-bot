import { chromium } from "playwright"

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  CITY,
  STREET,
  HOUSE,
  SHUTDOWNS_PAGE,
} from "./constants.js"

import {
  capitalize,
  deleteLastMessage,
  getCurrentTime,
  loadLastMessage,
  saveLastMessage,
} from "./helpers.js"

// Outage type mapping based on dtek.js:
// type "1" → Planned maintenance (sub_type not used, reason is hardcoded as "планові ремонтні роботи")
// type "2" → Reason driven by sub_type field
const OUTAGE_TYPE_PLANNED = "1"
const OUTAGE_TYPE_SUBTYPE_DRIVEN = "2"

// sub_type values that indicate a scheduled (non-emergency) outage
const ScheduledSubTypes = [
    "Стабілізаційне відключення (Згідно графіку погодинних відключень)",
    "планові ремонтні роботи",
    "Приєднання нового клієнту до електричних мереж",
];

// sub_type values that indicate an emergency outage (schedule table is hidden on dtek.com)
const EmergencySubTypes = [
    "Екстренні відключення (Аварійне без застосування графіку погодинних відключень)",
    "аварійні ремонтні роботи",
];

// Parse DTEK date format "HH:MM DD.MM.YYYY" into a Date object
export function parseDtekDate(dateStr) {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{2}):(\d{2})\s+(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return null
  const [, hours, minutes, day, month, year] = match
  return new Date(+year, +month - 1, +day, +hours, +minutes)
}

// Normalize address config: supports both "house": "14" and "houses": ["14", "14а"]
export function normalizeHouses(address) {
  if (Array.isArray(address.houses) && address.houses.length > 0) return address.houses
  if (address.house) return [address.house]
  return []
}

function hasOutageData(entry) {
  if (!entry) return false
  return entry.sub_type !== "" || entry.start_date !== "" || entry.end_date !== "" || entry.type !== ""
}

function isRelevantOutage(entry) {
  if (!entry) return false
  const subType = entry.sub_type || ""
  const type = entry.type || ""

  if (type === OUTAGE_TYPE_PLANNED) return true

  const subTypeLower = subType.toLowerCase()
  const isScheduled = ScheduledSubTypes.some(p => subTypeLower.includes(p.toLowerCase()))
  const isEmergency = EmergencySubTypes.some(e => subTypeLower.includes(e.toLowerCase()))

  return isScheduled || isEmergency
}

// Resolve the best house key from multiple candidates.
// Checks all house keys for outage data with a relevant status (scheduled or emergency).
// If multiple houses have outage info, picks the one with the earliest end_date.
// Returns the house key (string) or null if no relevant outage found.
export function resolveOutage(info, houses) {
  if (!info?.data) return null

  const relevant = houses.filter(h => {
    const entry = info.data[h]
    return hasOutageData(entry) && isRelevantOutage(entry)
  })

  if (relevant.length === 0) return null
  if (relevant.length === 1) return relevant[0]

  // Multiple entries — pick the one with earliest end_date (earliest planned restoration)
  return relevant.reduce((bestH, currentH) => {
    const bestEnd = parseDtekDate(info.data[bestH].end_date)
    const currentEnd = parseDtekDate(info.data[currentH].end_date)
    if (!bestEnd) return currentH
    if (!currentEnd) return bestH
    return currentEnd < bestEnd ? currentH : bestH
  })
}

export async function getInfo({ city = CITY, street = STREET } = {}) {

  const browser = await chromium.launch({ headless: true })
  const browserPage = await browser.newPage()

  try {
    await browserPage.goto(SHUTDOWNS_PAGE, {
      waitUntil: "load",
    })

    const csrfTokenTag = await browserPage.waitForSelector(
      'meta[name="csrf-token"]',
      { state: "attached" }
    )
    const csrfToken = await csrfTokenTag.getAttribute("content")

    const info = await browserPage.evaluate(
      async ({ city, street, csrfToken }) => {
        const formData = new URLSearchParams()
        formData.append("method", "getHomeNum")
        formData.append("data[0][name]", "city")
        formData.append("data[0][value]", city)
        formData.append("data[1][name]", "street")
        formData.append("data[1][value]", street)
        formData.append("data[2][name]", "updateFact")
        formData.append("data[2][value]", new Date().toLocaleString("uk-UA"))

        const response = await fetch("/ua/ajax", {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "x-csrf-token": csrfToken,
          },
          body: formData,
        })
        return await response.json()
      },
      { city, street, csrfToken }
    )

    console.log("✅ Getting info finished.")
    return info
  } catch (error) {
    throw Error(`❌ Getting info failed: ${error.message}`)
  } finally {
    await browser.close()
  }
}

export function checkIsOutage(info, house = HOUSE) {

  if (!info?.data) {
    throw Error("❌ Power outage info missed.")
  }

  const entry = info?.data?.[house] || {}
  return hasOutageData(entry)
}

export function checkIsEmergencyOutage(info, house = HOUSE) {
  console.log("🌀 Checking whether power outage is emergency...")

  if (!info?.data) {
    throw Error("❌ Power outage info missed.")
  }

  const { sub_type } = info?.data?.[house] || {}
  return EmergencySubTypes.some(e => sub_type.toLowerCase().includes(e.toLowerCase()));
}

export function checkIsScheduled(info, house = HOUSE) {
  console.log("🌀 Checking whether power outage scheduled...")

  if (!info?.data) {
    throw Error("❌ Power outage info missed.")
  }

  const { sub_type, type } = info?.data?.[house] || {}

  // type "1" is always planned maintenance regardless of sub_type
  if (type === OUTAGE_TYPE_PLANNED) return true

  return ScheduledSubTypes.some(p => sub_type.toLowerCase().includes(p.toLowerCase()));
}

export function generateMessage(info, { city = CITY, street = STREET, house = HOUSE } = {}) {
  const { sub_type, start_date, end_date } = info?.data?.[house] || {}
  const { updateTimestamp } = info || {}

  const reason = capitalize(sub_type)
  const updateTimestampFormatted = formatSmartDtekDate(updateTimestamp)
  const currentTime = formatTime(new Date())

  return [
    `🏠 <b>${alias}</b>`,
    "",
    "⚡️ <b>Зафіксовано відключення:</b>",
    `🪫 <code>${formatDateRange(start_date, end_date)}</code>`,
    "",
    `⚠️ <i>${reason}.</i>`,
    "\n",
    `🔄 <i>Оновлено на сайті: ${updateTimestampFormatted}</i>`,
    `💬 <i>Перевірено: ${currentTime}</i>`,
  ].join("\n")
}

export async function sendNotification(message) {
  if (!TELEGRAM_BOT_TOKEN)
    throw Error("❌ Missing telegram bot token or chat id.")
  if (!TELEGRAM_CHAT_ID) throw Error("❌ Missing telegram chat id.")

  const lastMessage = loadLastMessage() || {}
  try {
    const action_url_id = lastMessage.message_id ? "editMessageText" : "sendMessage"
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${action_url_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          message_id: lastMessage.message_id ?? undefined,
        }),
      }
    )

    const data = await response.json()
    saveLastMessage(data.result)

    console.log("🟢 Notification sent.")
  } catch (error) {
    console.log("🔴 Notification not sent.", error.message)
    deleteLastMessage()
  }
}

async function run() {
  const houses = HOUSE ? HOUSE.split(",").map(h => h.trim()).filter(Boolean) : []
  const info = await getInfo()
  const resolvedHouse = resolveOutage(info, houses)
  if (resolvedHouse) {
    const message = generateMessage(info, { house: resolvedHouse })
    await sendNotification(message)
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))

if (isDirectRun) {
  run().catch((error) => console.error(error.message))
}

import fs from "node:fs"
import path from "node:path"

import { STATE_FILE, CRON_INITIAL_INTERVAL } from "../constants.js"

let state = {}

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf8").trim()
      if (raw) {
        state = JSON.parse(raw)
        console.log(
          `📂 Loaded state: ${Object.keys(state).length} monitored address(es)`
        )
      }
    }
  } catch (error) {
    console.error("⚠️ Failed to load state, starting fresh:", error.message)
    state = {}
  }
}

function saveState() {
  try {
    const dir = path.dirname(STATE_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (error) {
    console.error("⚠️ Failed to save state:", error.message)
  }
}

export function getMonitoredAddresses() {
  return Object.values(state)
}

export function getEntry(alias) {
  return state[alias] || null
}

export function addEntry(
  alias,
  { city, street, house, houses, resolvedHouse, telegramMessageId, telegramMessageDate, downSince, lastInfo, checkInterval }
) {
  state[alias] = {
    alias,
    city,
    street,
    house,
    houses,
    resolvedHouse,
    telegramMessageId,
    telegramMessageDate,
    downSince,
    lastInfo: lastInfo || null,
    lastChecked: new Date().toISOString(),
    checkInterval: checkInterval ?? CRON_INITIAL_INTERVAL,
  }
  saveState()
}

export function updateEntry(alias, updates) {
  if (!state[alias]) return
  Object.assign(state[alias], updates, {
    lastChecked: new Date().toISOString(),
  })
  saveState()
}

export function removeEntry(alias) {
  delete state[alias]
  saveState()
}

export function hasEntry(alias) {
  return alias in state
}

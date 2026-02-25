import cron from "node-cron"

import { CRON_INITIAL_INTERVAL, CRON_INTERVAL } from "../constants.js"
import {
  getInfo,
  resolveOutage,
  normalizeHouses,
} from "../monitor.js"
import { getMonitoredAddresses, updateEntry } from "../store/store.js"
import {
  messageUpdatedInfo,
  messageDownNoInfo,
  messageRestoreRescheduled,
  messageNewSchedule,
} from "../telegram/messages.js"
import {
  editTelegramMessage,
  sendTelegramMessage,
} from "../telegram/sender.js"


async function runJob() {
  const addresses = getMonitoredAddresses()
  if (addresses.length === 0) return

  console.log(`[CRON] Checking ${addresses.length} monitored address(es)...`)

  for (const entry of addresses) {
    try {
      const { alias, city, street, telegramMessageId, lastInfo, downSince } = entry
      const houses = normalizeHouses(entry)
      const prevResolvedHouse = entry.resolvedHouse

      const entryInterval = (entry.checkInterval || CRON_INITIAL_INTERVAL) * 60 * 1000
      const elapsed = Date.now() - new Date(entry.lastChecked).getTime()
      if (elapsed < entryInterval) {
        const remaining = Math.ceil((entryInterval - elapsed) / 60000)
        console.log(`[CRON] ${alias}: interval not elapsed, next check in ~${remaining}m, skipping.`)
        continue
      }

      const info = await getInfo({ city, street })

      const resolvedHouse = resolveOutage(info, houses)
      const hasInfo = resolvedHouse !== null

      let newMessage
      if (hasInfo) {
        const oldData = JSON.stringify(prevResolvedHouse ? (lastInfo?.data?.[prevResolvedHouse] || {}) : {})
        const newData = JSON.stringify(info?.data?.[resolvedHouse] || {})
        const timestampChanged =
          info?.updateTimestamp !== lastInfo?.updateTimestamp

        const oldEndDate = prevResolvedHouse ? lastInfo?.data?.[prevResolvedHouse]?.end_date : null
        const newEndDate = info?.data?.[resolvedHouse]?.end_date
        if (newEndDate && oldEndDate && oldEndDate !== newEndDate) {
          console.log(`[CRON] ${alias}: restore time changed from ${oldEndDate} to ${newEndDate}, notifying.`)
          sendTelegramMessage(messageRestoreRescheduled(alias, newEndDate)).catch(err =>
            console.error(`[CRON] ${alias}: failed to send reschedule notice:`, err.message)
          )
        } else if (newEndDate && !oldEndDate) {
          console.log(`[CRON] ${alias}: new schedule appeared, end_date: ${newEndDate}, notifying.`)
          sendTelegramMessage(messageNewSchedule(alias, newEndDate)).catch(err =>
            console.error(`[CRON] ${alias}: failed to send new schedule notice:`, err.message)
          )
        }

        if (oldData === newData && !timestampChanged) {
          console.log(`[CRON] ${alias}: no data change, refreshing check time.`)
        } else if (oldData === newData) {
          console.log(
            `[CRON] ${alias}: DTEK timestamp changed, updating message.`
          )
        }
        newMessage = messageUpdatedInfo(alias, { city, street, house: resolvedHouse }, info)
      } else {
        newMessage = messageDownNoInfo(alias, { city, street, house: houses[0] }, downSince)
      }

      const newInterval = hasInfo ? CRON_INTERVAL : CRON_INITIAL_INTERVAL
      if (newInterval !== (entry.checkInterval || CRON_INITIAL_INTERVAL)) {
        console.log(`[CRON] ${alias}: switching check interval to ${newInterval}m.`)
      }

      if (telegramMessageId) {
        try {
          await editTelegramMessage(telegramMessageId, newMessage)
        } catch {
          console.log(
            `[CRON] ${alias}: edit failed, sending new message.`
          )
          const result = await sendTelegramMessage(newMessage)
          updateEntry(alias, {
            lastInfo: info,
            resolvedHouse,
            checkInterval: newInterval,
            telegramMessageId: result.message_id,
            telegramMessageDate: result.date,
          })
          console.log(`[CRON] ${alias}: new Telegram message sent.`)
          continue
        }
      }

      updateEntry(alias, { lastInfo: info, resolvedHouse, checkInterval: newInterval })
      console.log(`[CRON] ${alias}: Telegram message updated.`)
    } catch (error) {
      console.error(`[CRON] Error checking ${entry.alias}:`, error.message)
    }
  }
}

async function runStartupCheck() {
  const addresses = getMonitoredAddresses()
  const stale = addresses.filter(entry => {
    const threshold = (entry.checkInterval || CRON_INITIAL_INTERVAL) * 60 * 1000
    const elapsed = Date.now() - new Date(entry.lastChecked).getTime()
    return elapsed > threshold
  })

  if (stale.length === 0) {
    console.log("[STARTUP] All monitored addresses are up to date, skipping check.")
    return
  }

  console.log(`[STARTUP] ${stale.length} address(es) overdue for check, running...`)
  await runJob()
}

export function startCron() {
  const cronExpression = `*/${CRON_INITIAL_INTERVAL} * * * *`
  console.log(
    `⏰ Cron scheduled: every ${CRON_INITIAL_INTERVAL} minutes (${cronExpression}), per-entry intervals: initial=${CRON_INITIAL_INTERVAL}m, withData=${CRON_INTERVAL}m`
  )

  runStartupCheck().catch(err => console.error("[STARTUP] Check failed:", err))

  cron.schedule(cronExpression, async () => {
    try {
      await runJob()
    } catch (err) {
      console.error("[CRON] Job failed:", err)
    }
  })
}

import { capitalize, getCurrentTime } from "../helpers.js"

export function messageDownWithInfo(alias, { city, street, house }, info) {
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

export function messageDownNoInfo(alias, { city, street, house }, downSince) {
  const downTime = formatTime(new Date(downSince))
  const currentTime = formatTime(new Date())
  return [
    `🏠 <b>${alias}</b>`,
    "",
    `⚡️ <b>Зафіксовано відключення - ${downTime}.</b>`,
    "",
    "ℹ️ <i>Інформація на сайті ДТЕК наразі відсутня.</i>",
    `💬 <i>Перевірено: ${currentTime}</i>`,
  ].join("\n")
}

export function messageUpdatedInfo(alias, { city, street, house }, info) {
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

export function messageRestored(alias, { city, street, house }, downSince) {
  const downDate = new Date(downSince)
  const duration = formatDuration(downDate, new Date())
  const outageStart = formatTime(downDate)
  const currentTime = formatTime(new Date())

  return [
    `🏠 <b>${alias}</b>`,
    "",
    `✅ <b>Електропостачання відновлено - ${currentTime}!</b>`,
    `🕐 <i>Початок відключення: ${outageStart}</i>`,
    `⏱ <i>Тривалість відключення: ${duration}</i>`,
  ].join("\n")
}

export function messageRestoreRescheduled(alias, newEndDate) {
  const time = formatSmartDtekDate(newEndDate)
  return [
    `🏠 <b>${alias}</b>`,
    "",
    `🔀 Відновлення елетроенергії перенесено на <b>${time}</b>`,
  ].join("\n")
}

export function messageNewSchedule(alias, newEndDate) {
  const time = formatSmartDtekDate(newEndDate)
  return [
    `🏠 <b>${alias}</b>`,
    "",
    `📋 З'явилася інформація: відновлення очікується о <b>${time}</b>`,
  ].join("\n")
}

const MS_24H = 24 * 60 * 60 * 1000

/**
 * Format a single DTEK date ("HH:MM DD.MM.YYYY") relative to now.
 * Within 24h of now → time only: "00:33"
 * More than 24h from now → time + DD.MM (no year): "00:33 15.02"
 */
function formatSmartDtekDate(dtekDate) {
  if (!dtekDate) return "?"
  const parts = dtekDate.match(/^(\d{2}:\d{2})\s+(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!parts) return dtekDate

  const [, time, day, month, year] = parts
  const dateObj = new Date(+year, +month - 1, +day,
    +time.split(":")[0], +time.split(":")[1])
  const diffMs = Math.abs(Date.now() - dateObj.getTime())

  if (diffMs <= MS_24H) return time
  return `${time} ${day}.${month}`
}

function formatDateRange(start_date, end_date) {
  return `${formatSmartDtekDate(start_date)} — ${formatSmartDtekDate(end_date)}`
}

/**
 * Format a JS Date relative to now.
 * Within 24h → time only: "23:01"
 * More than 24h → time + DD.MM (no year): "23:01 10.02"
 */
function formatTime(date) {
  const time = date.toLocaleTimeString("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
  })
  const diffMs = Math.abs(Date.now() - date.getTime())

  if (diffMs <= MS_24H) return time
  const kyivDate = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Kyiv" })
  )
  const day = String(kyivDate.getDate()).padStart(2, "0")
  const month = String(kyivDate.getMonth() + 1).padStart(2, "0")
  return `${time} ${day}.${month}`
}

function formatDuration(from, to) {
  const diffMs = to.getTime() - from.getTime()
  if (diffMs < 0) return "невідомо"

  const totalMinutes = Math.floor(diffMs / 60000)

  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts = []

  if (days > 0) parts.push(`${days} д`)
  if (hours > 0) parts.push(`${hours} год`)
  if (minutes > 0) parts.push(`${minutes} хв`)

  return parts.length ? parts.join(" ") : "0 хв"
}

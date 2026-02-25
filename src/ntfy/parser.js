/**
 * Parse an ntfy event to extract alias and direction (UP/DOWN).
 *
 * Expected format: "🔴 Alias is DOWN (...)" or "🟢 Alias is UP"
 * The alias is between the optional emoji and "is DOWN"/"is UP".
 * Everything after DOWN/UP (e.g. parenthetical reason) is ignored.
 *
 * If title is present, it takes precedence over message.
 */
export function parseNtfyEvent(event) {
  const text = event.title || event.message
  if (!text) return null

  // Format: optional emoji(s), then alias, then "is UP/DOWN", then optional extra text
  const match = text.match(/^[^\p{L}\d]*(.+?)\s+is\s+(UP|DOWN)\b/iu)
  if (match) {
    return {
      alias: match[1].trim(),
      direction: match[2].toUpperCase(),
    }
  }

  return null
}

import { NTFY_URL, NTFY_TOPIC, NTFY_AUTH_TOKEN } from "../constants.js"
import { parseNtfyEvent } from "./parser.js"

const RECONNECT_DELAY_MS = 5000

/**
 * Subscribe to the ntfy JSON stream and dispatch events.
 *
 * @param {{ onDown: (alias: string) => Promise<void>, onUp: (alias: string) => Promise<void> }} handlers
 */
export function startNtfyListener({ onDown, onUp }) {
  const url = `${NTFY_URL}/${NTFY_TOPIC}/json`

  async function connect() {
    console.log(`🔌 Connecting to ntfy stream: ${url}`)

    try {
      const headers = {}
      if (NTFY_AUTH_TOKEN) {
        headers.Authorization = `Bearer ${NTFY_AUTH_TOKEN}`
      }

      const response = await fetch(url, { headers })

      if (!response.ok) {
        throw new Error(
          `ntfy HTTP ${response.status}: ${response.statusText}`
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const event = JSON.parse(line)

            if (event.event === "open") {
              console.log("✅ ntfy stream connected.")
              continue
            }

            if (event.event === "keepalive") continue

            if (event.event === "message") {
              const parsed = parseNtfyEvent(event)
              if (!parsed) {
                console.log("⚠️ Unrecognized ntfy event format:", line)
                continue
              }

              console.log(
                `📩 ntfy event: ${parsed.direction} ${parsed.alias}`
              )

              if (parsed.direction === "DOWN") {
                await onDown(parsed.alias)
              } else if (parsed.direction === "UP") {
                await onUp(parsed.alias)
              }
            }
          } catch (parseError) {
            console.error(
              "⚠️ Failed to parse ntfy line:",
              line,
              parseError.message
            )
          }
        }
      }

      console.log("🔌 ntfy stream ended. Reconnecting...")
    } catch (error) {
      console.error(`❌ ntfy connection error: ${error.message}`)
    }

    console.log(`⏳ Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`)
    setTimeout(connect, RECONNECT_DELAY_MS)
  }

  connect()
}

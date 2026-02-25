import express from "express"

import healthRoute from "./routes/health.js"

const api = express()

api.use(express.json())
api.use("/health", healthRoute)

export default api

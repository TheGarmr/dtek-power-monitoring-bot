import { Router } from "express"

import { getMonitoredAddresses } from "../store/store.js"

const router = Router()

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    monitored: getMonitoredAddresses().length,
  })
})

export default router

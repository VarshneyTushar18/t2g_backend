import express from "express";
import { notifyEnded, processPending } from "./elevenlabs.fallback.controller.js";

const router = express.Router();

router.post("/notify-ended", notifyEnded);
router.post("/process-pending", processPending);

export default router;

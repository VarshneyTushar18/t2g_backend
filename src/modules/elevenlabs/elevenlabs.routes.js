import express from "express";
import { handleTranscriptWebhook } from "./elevenlabs.controller.js";

const router = express.Router();

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleTranscriptWebhook,
);

export default router;

import express from "express";
import { verifyAdmin, requireSuperAdmin } from "../auth/auth.middleware.js";
import { createKey, listKeys, revokeKey } from "./apiKey.controller.js";

const router = express.Router();

router.get("/keys", verifyAdmin, requireSuperAdmin, listKeys);
router.post("/keys", verifyAdmin, requireSuperAdmin, createKey);
router.delete("/keys/:id", verifyAdmin, requireSuperAdmin, revokeKey);

export default router;

import express from "express";
import { verifyAdmin, requireSuperAdmin } from "../../auth/auth.middleware.js";
import * as controller from "./aiIntegrations.controller.js";

const router = express.Router();

router.get("/settings", verifyAdmin, requireSuperAdmin, controller.getSettings);
router.put("/settings", verifyAdmin, requireSuperAdmin, controller.updateSettings);
router.post("/test", verifyAdmin, requireSuperAdmin, controller.testSettings);

export default router;

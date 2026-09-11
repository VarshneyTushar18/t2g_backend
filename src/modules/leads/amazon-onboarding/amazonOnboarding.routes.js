import express from "express";
import {
  createAmazonOnboarding,
  getAmazonOnboardings,
  getAmazonOnboardingById,
  exportAmazonOnboardings,
  deleteAmazonOnboarding,
} from "./amazonOnboarding.controller.js";
import { guardModuleOrApiKey } from "../../auth/auth.middleware.js";

const router = express.Router();
const adminLeads = guardModuleOrApiKey("leads");

router.post("/", createAmazonOnboarding);
router.get("/", ...adminLeads, getAmazonOnboardings);
router.get("/export", ...adminLeads, exportAmazonOnboardings);
router.get("/:id", ...adminLeads, getAmazonOnboardingById);
router.delete("/:id", ...adminLeads, deleteAmazonOnboarding);

export default router;

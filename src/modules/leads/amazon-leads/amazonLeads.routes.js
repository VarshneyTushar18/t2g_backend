import express from "express";
import {
  createAmazonLead,
  getAmazonLeads,
  getAmazonLeadById,
  exportAmazonLeads,
  deleteAmazonLead,
} from "./amazonLeads.controller.js";
import { guardModuleOrApiKey } from "../../auth/auth.middleware.js";

const router = express.Router();
const adminLeads = guardModuleOrApiKey("leads");

router.post("/", createAmazonLead);
router.get("/", ...adminLeads, getAmazonLeads);
router.get("/export", ...adminLeads, exportAmazonLeads);
router.get("/:id", ...adminLeads, getAmazonLeadById);
router.delete("/:id", ...adminLeads, deleteAmazonLead);

export default router;

import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
    deleteLead
} from "../leads/lead.controller.js";

import { validateLead } from "../../middleware/validation.js";
import { verifyAdmin, requireModule } from "../auth/auth.middleware.js";

const router = express.Router();

// CREATE
router.post("/", validateLead, createLead);

// READ ALL
router.get("/", verifyAdmin, requireModule("leads"), getLeads);

// READ SINGLE
router.get("/:id", verifyAdmin, requireModule("leads"), getLeadById);

// DELETE
router.delete("/:id", verifyAdmin, requireModule("leads"), deleteLead);

export default router;
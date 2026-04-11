import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
    updateLead,
    deleteLead
} from "../leads/lead.controller.js";

import { validateLead } from "../../middleware/validation.js";
import { verifyAdmin } from "../auth/auth.middleware.js";

const router = express.Router();

// CREATE
router.post("/", validateLead, createLead);

// READ ALL
router.get("/", verifyAdmin, getLeads);

// READ SINGLE
router.get("/:id", verifyAdmin, getLeadById);

// UPDATE
router.put("/:id", verifyAdmin, updateLead);

// DELETE
router.delete("/:id", verifyAdmin, deleteLead);

export default router;
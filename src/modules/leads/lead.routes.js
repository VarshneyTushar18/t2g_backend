import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
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


// DELETE
router.delete("/:id", verifyAdmin, deleteLead);

export default router;
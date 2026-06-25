import express from "express";
import {
  createShopifyIntake,
  getShopifyIntakes,
  getShopifyIntakeById,
  exportShopifyIntakes,
  deleteShopifyIntake,
} from "./shopifyIntake.controller.js";
import { guardModule } from "../../auth/auth.middleware.js";

const router = express.Router();
const adminLeads = guardModule("leads");

router.post("/", createShopifyIntake);
router.get("/", ...adminLeads, getShopifyIntakes);
router.get("/export", ...adminLeads, exportShopifyIntakes);
router.get("/:id", ...adminLeads, getShopifyIntakeById);
router.delete("/:id", ...adminLeads, deleteShopifyIntake);

export default router;

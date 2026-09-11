import express from "express";
import {
  loginAdmin,
  logoutAdmin,
  getMe,
  changeMyPassword,
  setUserPassword,
  listUsers,
  createUser,
  updateUserModules,
  setUserStatus,
  revokeUser,
} from "./auth.controller.js";
import { verifyAdmin, requireSuperAdmin } from "./auth.middleware.js";

const router = express.Router();

router.post("/login", loginAdmin);
router.post("/logout", logoutAdmin);

router.get("/me", verifyAdmin, getMe);
router.patch("/me/password", verifyAdmin, requireSuperAdmin, changeMyPassword);

router.get("/users", verifyAdmin, requireSuperAdmin, listUsers);
router.post("/users", verifyAdmin, requireSuperAdmin, createUser);
router.patch("/users/:id/modules", verifyAdmin, requireSuperAdmin, updateUserModules);
router.patch("/users/:id/password", verifyAdmin, requireSuperAdmin, setUserPassword);
router.patch("/users/:id/status", verifyAdmin, requireSuperAdmin, setUserStatus);
router.delete("/users/:id", verifyAdmin, requireSuperAdmin, revokeUser);

export default router;

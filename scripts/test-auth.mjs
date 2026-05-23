/**
 * Quick RBAC auth smoke test (no server). Run from backend folder:
 *   node scripts/test-auth.mjs
 */
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const ADMIN_MODULES = [
  "leads",
  "portfolio",
  "career",
  "life",
  "testimonials",
  "case_studies",
];

const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const password = process.env.ADMIN_PASSWORD;

console.log("--- RBAC auth smoke test ---\n");
console.log("ADMIN_EMAIL:", email || "(missing)");
console.log("ADMIN_PASSWORD:", password ? "(set)" : "(missing)");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "(set)" : "(missing)");

if (!email || !password || !process.env.JWT_SECRET) {
  console.error("\nFAIL: Set ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET in .env");
  process.exit(1);
}

const authUser = {
  id: 0,
  email,
  role: "super_admin",
  modules: [...ADMIN_MODULES],
};

const token = jwt.sign(
  {
    sub: authUser.id,
    email: authUser.email,
    role: authUser.role,
    modules: authUser.modules,
  },
  process.env.JWT_SECRET,
  { expiresIn: "8h" },
);

const decoded = jwt.verify(token, process.env.JWT_SECRET);

console.log("\nEnv super-admin payload:", authUser);
console.log("\nJWT decode OK:", {
  sub: decoded.sub,
  role: decoded.role,
  moduleCount: decoded.modules?.length,
});

console.log("\nPASS: Auth token logic works.");
console.log("\nNext steps:");
console.log("  1. Start MySQL (XAMPP/Laragon) and import sql/admin_rbac.sql");
console.log("  2. npm run dev  →  should see 'MySQL connected successfully'");
console.log("  3. POST http://localhost:5000/api/auth/login with admin credentials");
console.log("  4. npm run dev in admin panel → login → /admin/dashboard");

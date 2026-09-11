-- =============================================================================
-- PRODUCTION: Run once on your live MySQL database (e.g. tech2globe)
-- Safe to re-run: uses IF NOT EXISTS / checks where possible
-- Does NOT delete or change existing content tables (leads, jobs, portfolio, etc.)
-- =============================================================================

-- 1) REQUIRED — stores exact modules super admin assigns (fixes "3 modules when I picked 1")
ALTER TABLE `admin_users`
  ADD COLUMN IF NOT EXISTS `granted_modules` JSON DEFAULT NULL
  COMMENT 'Module keys: leads, portfolio, career, life, testimonials, case_studies';

-- If your MySQL version does not support ADD COLUMN IF NOT EXISTS, use:
-- ALTER TABLE `admin_users` ADD COLUMN `granted_modules` JSON DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 2) OPTIONAL — only if admin_users table does not exist yet
--    (Skip if you already have admin_users with super_admin / hr / digital_marketing)
-- -----------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `admin_users` (
--   `id` int(11) NOT NULL AUTO_INCREMENT,
--   `full_name` varchar(120) NOT NULL,
--   `email` varchar(190) NOT NULL,
--   `password_hash` varchar(255) NOT NULL,
--   `role` enum('super_admin','hr','digital_marketing') NOT NULL DEFAULT 'hr',
--   `is_active` tinyint(1) NOT NULL DEFAULT 1,
--   `granted_modules` JSON DEFAULT NULL,
--   `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
--   `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `email` (`email`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- 3) OPTIONAL — fine-grained module storage (code works without this if granted_modules exists)
-- -----------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `admin_user_modules` (
--   `id` int(11) NOT NULL AUTO_INCREMENT,
--   `user_id` int(11) NOT NULL,
--   `module_key` varchar(50) NOT NULL,
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `unique_user_module` (`user_id`,`module_key`),
--   CONSTRAINT `admin_user_modules_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- 4) RECOMMENDED — set granted_modules for existing staff (adjust per user)
-- -----------------------------------------------------------------------------
-- Super admin: all modules (usually role = super_admin; JWT already gives all)
-- UPDATE `admin_users` SET `granted_modules` = '["leads","portfolio","career","life","testimonials","case_studies"]' WHERE `role` = 'super_admin';

-- HR: career only
-- UPDATE `admin_users` SET `granted_modules` = '["career"]' WHERE `email` = 'hr@tech2globe.com';

-- Digital marketing: only what they should see (example: portfolio only)
-- UPDATE `admin_users` SET `granted_modules` = '["portfolio"]' WHERE `email` = 'digital@tech2globe.com';

-- -----------------------------------------------------------------------------
-- Module keys (must match exactly):
--   leads | portfolio | career | life | testimonials | case_studies
-- -----------------------------------------------------------------------------

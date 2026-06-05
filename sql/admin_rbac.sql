-- =============================================================================
-- Tech2Globe admin RBAC — run manually in phpMyAdmin / MySQL (database: tech2globe)
-- The backend does NOT create or seed these tables on startup.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('super_admin','staff') NOT NULL DEFAULT 'staff',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `admin_user_modules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `module_key` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_module` (`user_id`,`module_key`),
  CONSTRAINT `admin_user_modules_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- Example: super admin (generate password_hash with bcrypt, 12 rounds)
--   node -e "import('bcryptjs').then(b=>b.hash('YourPassword',12).then(console.log))"
-- -----------------------------------------------------------------------------
-- INSERT INTO `admin_users` (`email`, `password_hash`, `role`) VALUES
-- ('admin@tech2globe.com', '$2a$12$REPLACE_WITH_BCRYPT_HASH', 'super_admin');

-- -----------------------------------------------------------------------------
-- Example: HR staff — career module only
-- -----------------------------------------------------------------------------
-- INSERT INTO `admin_users` (`email`, `password_hash`, `role`) VALUES
-- ('hr@gmail.com', '$2a$12$REPLACE_WITH_BCRYPT_HASH', 'staff');
-- INSERT INTO `admin_user_modules` (`user_id`, `module_key`) VALUES
-- (LAST_INSERT_ID(), 'career');

-- -----------------------------------------------------------------------------
-- Required on existing admin_users table (stores exact modules super admin picks):
-- -----------------------------------------------------------------------------
-- ALTER TABLE `admin_users`
--   ADD COLUMN `granted_modules` JSON DEFAULT NULL
--   COMMENT 'Exact module keys assigned by super admin';

-- -----------------------------------------------------------------------------
-- Module keys:
--   leads | portfolio | career | life | testimonials | case_studies
-- -----------------------------------------------------------------------------

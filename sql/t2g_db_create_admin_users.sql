-- =============================================================================
-- VPS production database: t2g_db
-- Run in mysql:  USE t2g_db;   then paste this file
-- Error you had: admin_users did not exist — this CREATES the table + users
-- =============================================================================

USE t2g_db;

-- 1) Create admin users table (matches your app code)
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('super_admin','hr','digital_marketing') NOT NULL DEFAULT 'hr',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `granted_modules` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`granted_modules`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2) Super admin — password: admin123  (CHANGE after first login)
INSERT INTO `admin_users` (`full_name`, `email`, `password_hash`, `role`, `granted_modules`)
VALUES (
  'Super Admin',
  'admin@tech2globe.com',
  '$2b$10$R39Dk6eveR/LUP9qnsvmIue6EN7BiMR46.Dx2WAMPufslO2doSH.m',
  'super_admin',
  '["leads","portfolio","career","life","testimonials","case_studies"]'
)
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `role` = 'super_admin',
  `granted_modules` = VALUES(`granted_modules`),
  `is_active` = 1;

-- 3) HR — password: hr123
INSERT INTO `admin_users` (`full_name`, `email`, `password_hash`, `role`, `granted_modules`)
VALUES (
  'HR User',
  'hr@tech2globe.com',
  '$2b$10$/nUBQh.gnj.wDN3F3K4rEufeI8NpbxaUmp28lgbFde4j/SpIyhl/a',
  'hr',
  '["career"]'
)
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `role` = 'hr',
  `granted_modules` = VALUES(`granted_modules`),
  `is_active` = 1;

-- 4) Digital marketing — password: hr123 (change in Manage Users later)
--    Only portfolio: use '["portfolio"]' instead of 3 modules below
INSERT INTO `admin_users` (`full_name`, `email`, `password_hash`, `role`, `granted_modules`)
VALUES (
  'Digital Marketing',
  'digital@tech2globe.com',
  '$2b$10$/nUBQh.gnj.wDN3F3K4rEufeI8NpbxaUmp28lgbFde4j/SpIyhl/a',
  'digital_marketing',
  '["portfolio","testimonials","case_studies"]'
)
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `role` = 'digital_marketing',
  `granted_modules` = VALUES(`granted_modules`),
  `is_active` = 1;

-- 5) Verify
SELECT id, email, role, is_active, granted_modules FROM admin_users ORDER BY id;

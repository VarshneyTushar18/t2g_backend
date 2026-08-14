-- =============================================================================
-- Tech2Globe admin API keys — run manually in MySQL (database: tech2globe)
-- Used by Connect workroom to generate keys for ChatGPT, scripts, automations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `admin_api_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `key_prefix` varchar(20) NOT NULL COMMENT 'Display prefix e.g. t2g_sk_ab12cd34',
  `key_hash` char(64) NOT NULL COMMENT 'SHA-256 of full key',
  `modules` json NOT NULL COMMENT 'Allowed module keys e.g. ["leads","blog"]',
  `read_only` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `revoked_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_hash` (`key_hash`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

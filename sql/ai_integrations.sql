CREATE TABLE IF NOT EXISTS ai_integrations (
  id TINYINT PRIMARY KEY DEFAULT 1,
  provider VARCHAR(64) NOT NULL DEFAULT 'openrouter',
  api_key_enc TEXT NULL,
  api_key_hint VARCHAR(32) NULL,
  base_url VARCHAR(500) NULL,
  default_model VARCHAR(255) NOT NULL DEFAULT 'openai/gpt-4o-mini',
  image_model VARCHAR(255) NULL,
  site_url VARCHAR(500) NULL,
  site_name VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by VARCHAR(128) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO ai_integrations
  (id, provider, default_model, enabled)
VALUES
  (1, 'openrouter', 'openai/gpt-4o-mini', 1);

-- Blog 2.0 — Bright CRM / MailerLite project (blog DB)
-- Isolated from Tech2Globe agent_automations tables

CREATE TABLE IF NOT EXISTS blog_2_0_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  project_name VARCHAR(120) NOT NULL DEFAULT 'Bright CRM',
  client_site_url VARCHAR(500) NULL,
  website_mode ENUM('cms_draft', 'mailerlite_manual') NOT NULL DEFAULT 'cms_draft',
  newsletter_mode ENUM('full_html', 'excerpt_link') NOT NULL DEFAULT 'full_html',
  mailerlite_enabled TINYINT(1) NOT NULL DEFAULT 0,
  mailerlite_api_key_enc TEXT NULL,
  mailerlite_api_key_hint VARCHAR(32) NULL,
  mailerlite_from_email VARCHAR(255) NULL,
  mailerlite_from_name VARCHAR(255) NULL,
  mailerlite_group_id VARCHAR(64) NULL,
  approval_emails JSON NULL,
  teams_webhook_url VARCHAR(500) NULL,
  notes TEXT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NULL
);

INSERT INTO blog_2_0_settings (id, project_name)
VALUES (1, 'Bright CRM')
ON DUPLICATE KEY UPDATE project_name = project_name;

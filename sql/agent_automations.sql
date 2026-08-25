CREATE TABLE IF NOT EXISTS agent_automations_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  window_start DATETIME NULL,
  window_end DATETIME NULL,
  run_time CHAR(5) NOT NULL DEFAULT '10:00',
  run_days JSON NULL,
  posts_per_run INT NOT NULL DEFAULT 1,
  mode ENUM('draft_only', 'pending_email', 'auto_publish') NOT NULL DEFAULT 'pending_email',
  approval_emails JSON NULL,
  last_run_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO agent_automations_settings
  (id, enabled, timezone, run_time, run_days, posts_per_run, mode, approval_emails)
VALUES
  (1, 0, 'Asia/Kolkata', '10:00', JSON_ARRAY(1,2,3,4,5), 1, 'pending_email', JSON_ARRAY());

CREATE TABLE IF NOT EXISTS agent_automations_topics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  topic VARCHAR(500) NOT NULL,
  notes TEXT NULL,
  author_name VARCHAR(255) NULL,
  category_ids JSON NULL,
  tags JSON NULL,
  priority INT NOT NULL DEFAULT 0,
  scheduled_for DATETIME NULL,
  status ENUM('queued', 'processing', 'draft_ready', 'failed') NOT NULL DEFAULT 'queued',
  generated_post_id INT NULL,
  generated_slug VARCHAR(255) NULL,
  generated_title VARCHAR(500) NULL,
  error_message TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_processed_at DATETIME NULL,
  created_by VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent_automations_topics_status (status, is_active),
  INDEX idx_agent_automations_topics_scheduled (scheduled_for),
  INDEX idx_agent_automations_topics_priority (priority, created_at)
);

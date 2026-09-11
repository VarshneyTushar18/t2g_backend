-- Career Agent HR email approval (main DB: t2g_db)
-- Run once on production if auto-migrate fails.

ALTER TABLE jobs
  MODIFY COLUMN status ENUM('active', 'inactive', 'pending_approval', 'rejected')
  NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS career_agent_approval_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  require_hr_approval TINYINT(1) NOT NULL DEFAULT 1,
  approval_emails JSON NULL,
  reminder_hours INT NOT NULL DEFAULT 24,
  max_reminders INT NOT NULL DEFAULT 2,
  expiry_hours INT NOT NULL DEFAULT 168,
  updated_by VARCHAR(128) NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO career_agent_approval_settings (id, enabled, require_hr_approval)
VALUES (1, 1, 1)
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS career_job_approvals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  decision ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
  requested_by VARCHAR(191) NULL,
  requester_email VARCHAR(191) NULL,
  hr_emails JSON NULL,
  reminder_count INT NOT NULL DEFAULT 0,
  last_reminded_at DATETIME NULL,
  decided_at DATETIME NULL,
  decided_by_email VARCHAR(191) NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_career_approval_token (token_hash),
  KEY idx_career_approval_job (job_id),
  KEY idx_career_approval_pending (decision, expires_at, last_reminded_at, reminder_count)
);

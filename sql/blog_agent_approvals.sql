-- Blog Agent Automations: email Yes/No publish approvals (blog DB)

CREATE TABLE IF NOT EXISTS blog_agent_approvals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  post_id INT NOT NULL,
  topic_id INT NULL,
  token_hash CHAR(64) NOT NULL,
  decision ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
  requested_by VARCHAR(191) NULL,
  requester_email VARCHAR(191) NULL,
  approval_emails JSON NULL,
  reminder_count INT NOT NULL DEFAULT 0,
  last_reminded_at DATETIME NULL,
  decided_at DATETIME NULL,
  decided_by_email VARCHAR(191) NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_blog_approval_token (token_hash),
  KEY idx_blog_approval_post (post_id),
  KEY idx_blog_approval_pending (decision, expires_at)
);

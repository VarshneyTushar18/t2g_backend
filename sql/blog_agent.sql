-- Blog Agent: threads, messages, feedback, brand guidelines (blog DB)

CREATE TABLE IF NOT EXISTS blog_agent_threads (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  user_email VARCHAR(255) DEFAULT NULL,
  title VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_blog_agent_threads_user (user_id),
  INDEX idx_blog_agent_threads_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS blog_agent_messages (
  id CHAR(36) PRIMARY KEY,
  thread_id CHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content LONGTEXT NOT NULL,
  tool_output JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_blog_agent_messages_thread (thread_id),
  CONSTRAINT fk_blog_agent_messages_thread
    FOREIGN KEY (thread_id) REFERENCES blog_agent_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blog_agent_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  thread_id CHAR(36) NOT NULL,
  message_id CHAR(36) DEFAULT NULL,
  rating TINYINT DEFAULT NULL,
  comment TEXT DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_blog_agent_feedback_thread (thread_id),
  CONSTRAINT fk_blog_agent_feedback_thread
    FOREIGN KEY (thread_id) REFERENCES blog_agent_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blog_agent_guidelines (
  id INT PRIMARY KEY DEFAULT 1,
  content LONGTEXT NOT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO blog_agent_guidelines (id, content)
VALUES (
  1,
  'Tech2Globe Blog Agent — brand voice:\n- Professional, helpful, educational (not overly salesy)\n- Topics: ecommerce, Amazon PPC, Shopify, digital marketing, IT services\n- Default author: Tech2Globe Digital Team (override when user names an author)\n- SEO: clear H2 structure, meta description 120-160 chars, focus keyword in title\n- Length: 400-900 words for full posts unless user asks for short\n- Always prefer draft first if user is unsure; publish when explicitly asked'
);

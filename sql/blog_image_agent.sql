-- Blog Image Agent: tag threads + store generated Cloudinary uploads

ALTER TABLE blog_agent_threads
  ADD COLUMN IF NOT EXISTS agent_type VARCHAR(32) NOT NULL DEFAULT 'writer';

CREATE INDEX IF NOT EXISTS idx_blog_agent_threads_type
  ON blog_agent_threads (user_id, agent_type);

CREATE TABLE IF NOT EXISTS blog_agent_images (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  thread_id CHAR(36) DEFAULT NULL,
  prompt TEXT,
  cloudinary_url VARCHAR(1000) NOT NULL,
  public_id VARCHAR(255) DEFAULT NULL,
  width INT DEFAULT NULL,
  height INT DEFAULT NULL,
  post_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_blog_agent_images_user (user_id),
  INDEX idx_blog_agent_images_created (created_at)
);

INSERT IGNORE INTO blog_agent_guidelines (id, content)
VALUES (
  2,
  'Tech2Globe Blog Image Agent:\n- Generate professional blog cover and in-article images\n- Style: clean, modern, business/tech, no text in the image unless asked\n- Always upload to Cloudinary (never leave as a temp AI URL)\n- Default 16:9 landscape for featured/cover images\n- After generate, return the Cloudinary URL so it can be used as featured_image or pasted into a post'
);

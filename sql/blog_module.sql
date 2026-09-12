-- Blog module tables (run against BLOG_DB_NAME only — not the main tech2globe DB)

CREATE TABLE IF NOT EXISTS blog_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_blog_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blog_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  excerpt TEXT,
  content LONGTEXT NOT NULL,
  featured_image VARCHAR(1000) DEFAULT NULL,
  featured_image_title VARCHAR(500) DEFAULT NULL,
  featured_image_alt VARCHAR(500) DEFAULT NULL,
  meta_title VARCHAR(500) DEFAULT NULL,
  meta_description TEXT DEFAULT NULL,
  focus_keyword VARCHAR(255) DEFAULT NULL,
  canonical_url VARCHAR(1000) DEFAULT NULL,
  robots_noindex TINYINT(1) NOT NULL DEFAULT 0,
  robots_nofollow TINYINT(1) NOT NULL DEFAULT 0,
  og_title VARCHAR(500) DEFAULT NULL,
  og_description TEXT DEFAULT NULL,
  og_image VARCHAR(1000) DEFAULT NULL,
  twitter_title VARCHAR(500) DEFAULT NULL,
  twitter_description TEXT DEFAULT NULL,
  twitter_image VARCHAR(1000) DEFAULT NULL,
  tags JSON DEFAULT NULL,
  status ENUM('draft', 'publish', 'pending') NOT NULL DEFAULT 'draft',
  author_name VARCHAR(255) NOT NULL DEFAULT 'Tech2globe',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  view_count INT NOT NULL DEFAULT 0,
  published_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_blog_posts_slug (slug),
  KEY idx_blog_posts_status (status),
  KEY idx_blog_posts_published_at (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blog_post_categories (
  post_id INT NOT NULL,
  category_id INT NOT NULL,
  PRIMARY KEY (post_id, category_id),
  CONSTRAINT fk_bpc_post FOREIGN KEY (post_id) REFERENCES blog_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_bpc_category FOREIGN KEY (category_id) REFERENCES blog_categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blog_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

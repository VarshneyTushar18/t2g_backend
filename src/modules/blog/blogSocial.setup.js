import blogDb from "../../config/blogDb.js";

async function tableExists(name) {
  const [rows] = await blogDb.query("SHOW TABLES LIKE ?", [name]);
  return rows.length > 0;
}

async function ensureColumn(col, sql) {
  const [rows] = await blogDb.query("SHOW COLUMNS FROM blog_posts LIKE ?", [col]);
  if (!rows.length) await blogDb.query(sql);
}

export async function ensureBlogSocialTables() {
  await ensureColumn(
    "social_share",
    "ALTER TABLE blog_posts ADD COLUMN social_share JSON DEFAULT NULL AFTER tags",
  );

  if (!(await tableExists("blog_social_accounts"))) {
    await blogDb.query(`
      CREATE TABLE blog_social_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(32) NOT NULL,
        account_label VARCHAR(255) DEFAULT NULL,
        account_id VARCHAR(255) DEFAULT NULL,
        access_token_enc TEXT DEFAULT NULL,
        refresh_token_enc TEXT DEFAULT NULL,
        token_expires_at DATETIME DEFAULT NULL,
        metadata JSON DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        connected_at DATETIME DEFAULT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_blog_social_platform (platform)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  if (!(await tableExists("blog_social_shares"))) {
    await blogDb.query(`
      CREATE TABLE blog_social_shares (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        platform VARCHAR(32) NOT NULL,
        status ENUM('pending','success','failed','skipped') NOT NULL DEFAULT 'pending',
        external_id VARCHAR(255) DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        shared_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_blog_post_platform (post_id, platform),
        KEY idx_blog_social_shares_post (post_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }
}

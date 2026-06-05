#!/bin/bash
# Run ON THE VPS after uploading SQL dumps to sql/exports/
#
# Upload via FileZilla / scp:
#   main_tech2globe.sql
#   blog_tech2globe_blog.sql
#
# Usage (from project root on VPS):
#   export MYSQL_USER=your_user
#   export MYSQL_PWD=your_password
#   export MAIN_DB=t2g_db          # optional — VPS database names
#   export BLOG_DB=t2g_blog
#   bash scripts/vps-import-databases.sh

set -e

MAIN_DB="${MAIN_DB:-t2g_db}"
BLOG_DB="${BLOG_DB:-t2g_blog}"
MYSQL_USER="${MYSQL_USER:-root}"
EXPORT_DIR="${EXPORT_DIR:-./sql/exports}"

MAIN_SQL="${EXPORT_DIR}/main_tech2globe.sql"
BLOG_SQL="${EXPORT_DIR}/blog_tech2globe_blog.sql"

if [ ! -f "$MAIN_SQL" ]; then
  echo "Missing $MAIN_SQL"
  echo "Export on Windows: scripts\\export-for-vps.bat"
  exit 1
fi

if [ ! -f "$BLOG_SQL" ]; then
  echo "Missing $BLOG_SQL — blog dump required if you use /api/blog"
  exit 1
fi

echo "=== Creating databases ==="
mysql -u "$MYSQL_USER" -e "CREATE DATABASE IF NOT EXISTS \`${MAIN_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u "$MYSQL_USER" -e "CREATE DATABASE IF NOT EXISTS \`${BLOG_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "=== Importing MAIN ($MAIN_DB) — leads, auth, portfolio, career, life, etc. ==="
sed -e "s/\`tech2globe\`/\`${MAIN_DB}\`/g" \
    -e "s/USE \`tech2globe\`/USE \`${MAIN_DB}\`/g" \
    "$MAIN_SQL" | mysql -u "$MYSQL_USER" "$MAIN_DB"

echo "=== Importing BLOG ($BLOG_DB) — posts, categories, SEO ==="
sed -e "s/\`tech2globe_blog\`/\`${BLOG_DB}\`/g" \
    -e "s/USE \`tech2globe_blog\`/USE \`${BLOG_DB}\`/g" \
    "$BLOG_SQL" | mysql -u "$MYSQL_USER" "$BLOG_DB"

echo ""
echo "=== Import complete ==="
echo "Update backend .env on VPS:"
echo "  DB_HOST=localhost"
echo "  DB_NAME=$MAIN_DB"
echo "  DB_USER=$MYSQL_USER"
echo "  DB_PASSWORD=***"
echo "  BLOG_DB_NAME=$BLOG_DB"
echo "  BLOG_DB_USER=$MYSQL_USER"
echo "  BLOG_DB_PASSWORD=(same)"
echo ""
echo "Then restart API: pm2 restart all  (or your process name)"

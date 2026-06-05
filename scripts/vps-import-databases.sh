#!/bin/bash
# Run ON THE VPS after uploading SQL dumps to ~/sql/exports/ (or project sql/exports/)
#
# Usage:
#   export MAIN_DB=t2g_db
#   export BLOG_DB=t2g_blog
#   export MYSQL_USER=your_mysql_user
#   export MYSQL_PWD=your_mysql_password
#   bash scripts/vps-import-databases.sh

set -e

MAIN_DB="${MAIN_DB:-t2g_db}"
BLOG_DB="${BLOG_DB:-t2g_blog}"
MYSQL_USER="${MYSQL_USER:-root}"
EXPORT_DIR="${EXPORT_DIR:-./sql/exports}"

MAIN_SQL="${EXPORT_DIR}/main_tech2globe.sql"
BLOG_SQL="${EXPORT_DIR}/blog_tech2globe_blog.sql"

if [ ! -f "$MAIN_SQL" ]; then
  echo "Missing $MAIN_SQL — upload from local scripts/export-for-vps.bat"
  exit 1
fi

if [ ! -f "$BLOG_SQL" ]; then
  echo "Missing $BLOG_SQL — upload blog dump"
  exit 1
fi

echo "=== Creating databases if needed ==="
mysql -u "$MYSQL_USER" -e "CREATE DATABASE IF NOT EXISTS \`${MAIN_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u "$MYSQL_USER" -e "CREATE DATABASE IF NOT EXISTS \`${BLOG_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "=== Importing MAIN ($MAIN_DB) — testimonials, leads, auth, etc. ==="
sed -e "s/\`tech2globe\`/\`${MAIN_DB}\`/g" \
    -e "s/USE \`tech2globe\`/USE \`${MAIN_DB}\`/g" \
    "$MAIN_SQL" | mysql -u "$MYSQL_USER" "$MAIN_DB"

echo "=== Importing BLOG ($BLOG_DB) — blog_posts only ==="
sed -e "s/\`tech2globe_blog\`/\`${BLOG_DB}\`/g" \
    -e "s/USE \`tech2globe_blog\`/USE \`${BLOG_DB}\`/g" \
    "$BLOG_SQL" | mysql -u "$MYSQL_USER" "$BLOG_DB"

echo "=== Done ==="
echo "Set backend .env on VPS:"
echo "  DB_NAME=$MAIN_DB"
echo "  BLOG_DB_NAME=$BLOG_DB"
echo "Then: pm2 restart t2g_backend"

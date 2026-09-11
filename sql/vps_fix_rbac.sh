#!/bin/bash
# Run on VPS after SSH login:
#   chmod +x vps_fix_rbac.sh
#   ./vps_fix_rbac.sh
#
# Or set vars and run one-liner mysql:
#   DB_NAME=tech2globe DB_USER=root DB_PASS='yourpassword' ./vps_fix_rbac.sh

DB_NAME="${DB_NAME:-tech2globe}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"

MYSQL_CMD="mysql -u${DB_USER}"
[ -n "$DB_PASS" ] && MYSQL_CMD="mysql -u${DB_USER} -p${DB_PASS}"

echo "=== Fixing RBAC on database: $DB_NAME ==="

$MYSQL_CMD "$DB_NAME" <<'EOSQL'
-- Add column (ignore error if already exists — run SELECT at end to verify)
ALTER TABLE admin_users ADD COLUMN granted_modules JSON DEFAULT NULL;

UPDATE admin_users
SET granted_modules = '["leads","portfolio","career","life","testimonials","case_studies"]'
WHERE role = 'super_admin';

UPDATE admin_users
SET granted_modules = '["career"]'
WHERE email = 'hr@tech2globe.com';

UPDATE admin_users
SET granted_modules = '["portfolio","testimonials","case_studies"]'
WHERE email = 'digital@tech2globe.com';

SELECT id, email, role, is_active, granted_modules FROM admin_users ORDER BY id;
EOSQL

echo "=== Done. If ALTER failed with 'Duplicate column', that is OK — check SELECT output above. ==="

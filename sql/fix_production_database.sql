-- =============================================================================
-- PRODUCTION VPS: database name is usually t2g_db (not tech2globe)
-- If admin_users does NOT exist, run:  t2g_db_create_admin_users.sql  instead
-- =============================================================================
USE t2g_db;

-- Step 1 — Add column (skip this line if you get "Duplicate column name")
ALTER TABLE admin_users
  ADD COLUMN granted_modules JSON DEFAULT NULL;

-- Step 2 — Set modules per user (edit emails if yours differ)
UPDATE admin_users
SET granted_modules = '["leads","portfolio","career","life","testimonials","case_studies"]'
WHERE role = 'super_admin';

UPDATE admin_users
SET granted_modules = '["career"]'
WHERE email = 'hr@tech2globe.com';

UPDATE admin_users
SET granted_modules = '["portfolio","testimonials","case_studies"]'
WHERE email = 'digital@tech2globe.com';

-- Optional: only portfolio for digital user
-- UPDATE admin_users SET granted_modules = '["portfolio"]' WHERE email = 'digital@tech2globe.com';

-- Step 3 — Verify
SELECT id, email, role, is_active, granted_modules FROM admin_users ORDER BY id;

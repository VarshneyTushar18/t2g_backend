-- Fix local tech2globe database for RBAC (run once)
USE tech2globe;

-- Super admin: all modules
UPDATE admin_users
SET granted_modules = '["leads","portfolio","career","life","testimonials","case_studies","blog"]'
WHERE role = 'super_admin';

-- HR: career only
UPDATE admin_users
SET granted_modules = '["career"]'
WHERE email = 'hr@tech2globe.com';

-- Digital marketing (change to ["portfolio"] only if you prefer)
UPDATE admin_users
SET granted_modules = '["portfolio","testimonials","case_studies","blog"]'
WHERE email = 'digital@tech2globe.com';

-- HR login password: hr123
UPDATE admin_users
SET password_hash = '$2b$10$EpHjWl6mJe6fLso9mkAbqeLLkTo.TVdL7xZc8VIeWMd.YSpiOgs2S'
WHERE email = 'hr@tech2globe.com';

SELECT id, email, role, is_active, granted_modules FROM admin_users ORDER BY id;

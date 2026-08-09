-- Migration 005: Reset non-admin accounts to 'inactive' (Sin Suscripción) and volitancrooss@gmail.com to 'sin_limite'
UPDATE company_settings
SET subscription_status = 'inactive', plan_id = 'basico'
WHERE user_id NOT IN (
  SELECT id FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com'
);

UPDATE company_settings
SET subscription_status = 'active', plan_id = 'sin_limite'
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com'
);

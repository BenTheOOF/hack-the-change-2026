-- Make an existing account an admin. Run with psql as the database administrator.
-- Use this when the first admin signs in with email and password: ADMIN_EMAILS only grants
-- admin to Google-verified accounts, because password sign-ups are not email-confirmed here.
-- psql "$DATABASE_URL" -v user_id="<auth uuid>" -f admin-grant.sql
update public.care_profiles set is_admin = true where id = :'user_id'::uuid;

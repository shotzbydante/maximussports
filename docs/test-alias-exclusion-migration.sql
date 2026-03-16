-- Migration: Exclude test alias accounts from suggestions
--
-- Creates a function that returns user IDs matching a given email pattern
-- from auth.users. Used by the discover endpoint to filter out test accounts
-- created with Gmail + aliasing (e.g., dantedicicco+test@gmail.com).
--
-- SECURITY DEFINER runs as the function owner (superuser) which has access
-- to auth.users. Only callable with the service role key.

CREATE OR REPLACE FUNCTION public.get_test_alias_user_ids(email_pattern text)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT au.id FROM auth.users au WHERE au.email LIKE email_pattern;
$$;

REVOKE ALL ON FUNCTION public.get_test_alias_user_ids(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_alias_user_ids(text) TO service_role;

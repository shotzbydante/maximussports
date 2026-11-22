-- social_posts: allow lifecycle_status = 'skipped'.
--
-- The MLB autopost job records the days it deliberately does not post (no
-- games, offseason) with lifecycle_status 'skipped'. The check constraint only
-- allows draft / pending / posted / failed, so those rows have been rejected
-- since the feature shipped and there is no record of skipped days.
--
-- Additive and safe to run more than once.

alter table public.social_posts
  drop constraint if exists social_posts_lifecycle_status_check;

alter table public.social_posts
  add constraint social_posts_lifecycle_status_check
  check (lifecycle_status = any (array['draft', 'pending', 'posted', 'failed', 'skipped']));

-- ============================================================================
-- 18_external_releases.sql — releases are external download URLs only.
--
-- Run AFTER 17_gcash_only.sql. Idempotent — safe to re-run.
--
-- The admin Downloads module no longer accepts uploaded installer files: every
-- release must point at an external http(s) URL. That URL is now NOT NULL, so
-- the requirement is enforced by the database and not just the form.
--
-- Legacy rows are protected: the preflight below refuses to run while any row
-- has no download_url, instead of silently deleting releases. Open Downloads and
-- paste each release's external URL, then re-run this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Preflight — never drop file_path while a row still depends on it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
  from public.pos_releases
  where download_url is null or btrim(download_url) = '';

  if v_missing > 0 then
    raise exception
      'Cannot migrate: % release row(s) have no download_url. Open Downloads, add an external URL for each, then re-run 18_external_releases.sql.',
      v_missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop the uploaded-file column and its "file or url" source constraint.
-- ---------------------------------------------------------------------------
alter table public.pos_releases drop constraint if exists pos_releases_source_check;
alter table public.pos_releases drop column if exists file_path;

-- ---------------------------------------------------------------------------
-- 3. The external URL is required and must be a real http(s) link.
-- ---------------------------------------------------------------------------
alter table public.pos_releases alter column download_url set not null;

alter table public.pos_releases drop constraint if exists pos_releases_download_url_check;
alter table public.pos_releases
  add constraint pos_releases_download_url_check
  check (download_url ~* '^https?://[^[:space:]]+$');

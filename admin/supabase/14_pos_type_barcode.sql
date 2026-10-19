-- ============================================================================
-- Central POS — 14_pos_type_barcode.sql
-- Optional per-POS-type BARCODE SCANNER feature flag.
--
-- The admin dashboard toggles "Barcode scanner" when creating/editing a POS
-- type; the client POS reads the flag through the cached pos_types catalog and
-- enables or hides its scanning UI accordingly. Off by default so existing POS
-- types keep their current behaviour.
--
-- Run AFTER 01 -> 13. Idempotent — safe to run multiple times.
--
-- Security: no new policies are required.
--   * Writes are already gated to admins by "pos_types_write_admin" (02_rls.sql).
--   * Reads of active rows (including this column) are already public via
--     "pos_types_select_public" (09_pos_type_public_read.sql).
-- ============================================================================

alter table public.pos_types
  add column if not exists barcode_enabled boolean not null default false;

comment on column public.pos_types.barcode_enabled is
  'Admin-controlled: whether the client POS for this type offers barcode scanning (camera / USB).';

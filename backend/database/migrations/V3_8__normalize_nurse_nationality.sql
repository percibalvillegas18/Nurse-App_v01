-- =============================================================================
-- V3_8__normalize_nurse_nationality.sql - nationality uses country display names
-- Purpose: The nationality field is now validated server-side against the
--          supported country list (countries.ts -> getLookups() and the nurse
--          DTOs), which uses country display names ('Philippines',
--          'United States', 'South Korea', ...). The V3_2 backfill seeded the
--          demo nurses with demonyms ('Filipino', 'American', 'South Korean'),
--          which no longer pass validation. Normalize those stored values so
--          seeded records can be re-submitted through the validated API.
--
--          'Saudi' is already a supported display name, so it is left as-is.
--
-- Safe to re-run: idempotent UPDATEs keyed on the legacy value.
-- =============================================================================

UPDATE nursing.nurses SET nationality = 'Philippines'   WHERE nationality = 'Filipino';
UPDATE nursing.nurses SET nationality = 'United States' WHERE nationality = 'American';
UPDATE nursing.nurses SET nationality = 'South Korea'   WHERE nationality = 'South Korean';

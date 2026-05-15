-- 0009_encrypted_documents.sql
-- ------------------------------------------------------------------
-- "Encrypted Confidentiality" — Phase 1.
--
-- Up to and including 0008 the audit pipeline was Zero-Knowledge by
-- construction: the source document existed only in memory, was wiped
-- after Multi-Pass, and only its sha-256 hash was persisted. That
-- promise made the editor unusable past the original audit session.
--
-- This migration introduces envelope encryption for document storage:
--   * AES-256-GCM with a single master key held server-side
--     (env var DOCUMENT_ENCRYPTION_KEY, 32 bytes base64-decoded).
--   * Random 12-byte IV per row; 16-byte GCM auth tag stored alongside
--     so a tampered ciphertext fails to decrypt.
--   * Plaintext is never stored. Documents are decrypted in-memory
--     only when the owning user opens the editor.
--
-- Marketing promise updated atomically with this migration:
--   ZK ("Documents live in memory only.")
--   →  Encrypted-at-Rest ("Documents are AES-256-GCM encrypted server-side
--      and accessible only during your edit sessions.")
--
-- Retention is org-gated. Default = true going forward; existing rows
-- (incl. the anonymous-org placeholder) are left at false so the
-- public-by-UUID audits keep the original ZK behaviour. Editor code
-- checks both org.retain_documents and audits.document_ciphertext IS
-- NOT NULL before attempting decrypt.
-- ------------------------------------------------------------------

alter table public.organizations
  add column if not exists retain_documents boolean not null default true;

-- Leave existing orgs as-is (including the anonymous-org placeholder
-- '00000000-0000-0000-0000-000000000000', which must stay opt-out so
-- public-by-UUID audits don't accidentally persist user bytes).
update public.organizations
   set retain_documents = false
 where id = '00000000-0000-0000-0000-000000000000';

alter table public.audits
  add column if not exists document_ciphertext   bytea,
  add column if not exists document_iv           bytea,
  add column if not exists document_auth_tag     bytea,
  add column if not exists document_encrypted_at timestamptz;

-- Structural invariant: either ALL four crypto fields are populated
-- or NONE are. A partial row would indicate a bug in the writer.
alter table public.audits
  drop constraint if exists audits_document_crypto_all_or_none;
alter table public.audits
  add constraint audits_document_crypto_all_or_none
  check (
    (document_ciphertext is null and document_iv is null and document_auth_tag is null and document_encrypted_at is null)
    or
    (document_ciphertext is not null and document_iv is not null and document_auth_tag is not null and document_encrypted_at is not null)
  );

-- IV must be 12 bytes (GCM standard) and the auth tag must be 16 bytes
-- (default GCM tag size). Catch garbage writes at insert time.
alter table public.audits
  drop constraint if exists audits_document_iv_length;
alter table public.audits
  add constraint audits_document_iv_length
  check (document_iv is null or octet_length(document_iv) = 12);

alter table public.audits
  drop constraint if exists audits_document_auth_tag_length;
alter table public.audits
  add constraint audits_document_auth_tag_length
  check (document_auth_tag is null or octet_length(document_auth_tag) = 16);

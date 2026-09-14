-- Keep name resolution scoped to this function. The persistence body uses
-- explicit table aliases for evidence validation; this setting exists only so
-- the mention_detection_runs primary-key ON CONFLICT target resolves as table
-- columns rather than PL/pgSQL identifiers.
alter function app_private.persist_mention_detection(uuid, uuid, uuid, jsonb)
  set plpgsql.variable_conflict = 'use_column';

-- D2 entity alias catalog fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'alias-owner@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'alias-member@example.test'),
  ('f1000000-0000-4000-8000-000000000003', 'alias-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001', 'Alias Agency', 'f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'Other Alias Agency', 'f1000000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner'),
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'member'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  (
    'f3000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'Alias Client',
    'alias.example.com',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000002',
    'Other Alias Client',
    'other-alias.example.com',
    'f1000000-0000-4000-8000-000000000003'
  );

select ok(has_table_privilege('authenticated', 'public.entity_alias_catalogs', 'select'),
  'authenticated role has explicit catalog read access');
select ok(has_table_privilege('authenticated', 'public.entity_alias_entities', 'select'),
  'authenticated role has explicit entity read access');
select ok(has_table_privilege('authenticated', 'public.entity_alias_entries', 'select'),
  'authenticated role has explicit alias read access');
select ok(not has_table_privilege('authenticated', 'public.entity_alias_catalogs', 'insert'),
  'authenticated callers cannot directly insert catalogs');
select ok(not has_table_privilege('service_role', 'public.entity_alias_catalogs', 'insert'),
  'service role cannot directly insert catalogs');
select ok(not has_table_privilege('service_role', 'public.entity_alias_entries', 'update'),
  'service role cannot directly mutate aliases');
select ok(has_function_privilege(
  'authenticated',
  'public.persist_entity_alias_catalog(uuid,uuid,uuid,jsonb)',
  'execute'
), 'authenticated members persist through the narrow RPC');
select ok(not has_function_privilege(
  'anon',
  'public.persist_entity_alias_catalog(uuid,uuid,uuid,jsonb)',
  'execute'
), 'anonymous callers cannot persist alias catalogs');
select ok(not has_function_privilege(
  'service_role',
  'public.persist_entity_alias_catalog(uuid,uuid,uuid,jsonb)',
  'execute'
), 'service role cannot bypass actor authorization through the alias RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);

select is(
  public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'methodVersion', 'entity-alias-v1',
      'entities', jsonb_build_array(
        jsonb_build_object(
          'entityKind', 'company',
          'canonicalName', 'Acme Corporation',
          'aliases', jsonb_build_array(
            jsonb_build_object(
              'aliasText', 'Acme Corp',
              'normalizedAlias', 'acme corp',
              'matchState', 'eligible'
            ),
            jsonb_build_object(
              'aliasText', 'ＡＣＭＥ',
              'normalizedAlias', 'acme',
              'matchState', 'eligible'
            )
          )
        ),
        jsonb_build_object(
          'entityKind', 'product',
          'canonicalName', 'Acme Lens',
          'aliases', jsonb_build_array(
            jsonb_build_object(
              'aliasText', 'Lens',
              'normalizedAlias', 'lens',
              'matchState', 'eligible'
            ),
            jsonb_build_object(
              'aliasText', 'Shared',
              'normalizedAlias', 'shared',
              'matchState', 'ambiguous'
            )
          )
        ),
        jsonb_build_object(
          'entityKind', 'product',
          'canonicalName', 'Acme Shared',
          'aliases', jsonb_build_array(
            jsonb_build_object(
              'aliasText', 'shared',
              'normalizedAlias', 'shared',
              'matchState', 'ambiguous'
            )
          )
        )
      )
    )
  ) ->> 'replayed',
  'false',
  'first alias catalog persistence is not a replay'
);

select is((select count(*) from public.entity_alias_catalogs), 1::bigint,
  'owner can read the persisted catalog through membership RLS');
select is((select count(*) from public.entity_alias_entities), 3::bigint,
  'catalog preserves all explicit entity occurrences');
select is((select count(*) from public.entity_alias_entries), 5::bigint,
  'catalog preserves all explicit alias occurrences');
select is((
  select count(*)
  from public.entity_alias_entries
  where normalized_alias = 'shared' and match_state = 'ambiguous'
), 2::bigint, 'cross-entity normalized collisions remain explicitly ambiguous');
select is((
  select count(*)
  from public.entity_alias_entries
  where match_state = 'eligible'
), 3::bigint, 'non-colliding aliases remain eligible');
select is((
  select normalized_alias
  from public.entity_alias_entries
  where alias_text = 'ＡＣＭＥ'
), 'acme', 'database independently validates NFKC and lowercase normalization');

select is(
  public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'methodVersion', 'entity-alias-v1',
      'entities', jsonb_build_array(
        jsonb_build_object(
          'entityKind', 'company',
          'canonicalName', 'Acme Corporation',
          'aliases', jsonb_build_array(
            jsonb_build_object('aliasText', 'Acme Corp', 'normalizedAlias', 'acme corp', 'matchState', 'eligible'),
            jsonb_build_object('aliasText', 'ＡＣＭＥ', 'normalizedAlias', 'acme', 'matchState', 'eligible')
          )
        ),
        jsonb_build_object(
          'entityKind', 'product',
          'canonicalName', 'Acme Lens',
          'aliases', jsonb_build_array(
            jsonb_build_object('aliasText', 'Lens', 'normalizedAlias', 'lens', 'matchState', 'eligible'),
            jsonb_build_object('aliasText', 'Shared', 'normalizedAlias', 'shared', 'matchState', 'ambiguous')
          )
        ),
        jsonb_build_object(
          'entityKind', 'product',
          'canonicalName', 'Acme Shared',
          'aliases', jsonb_build_array(
            jsonb_build_object('aliasText', 'shared', 'normalizedAlias', 'shared', 'matchState', 'ambiguous')
          )
        )
      )
    )
  ) ->> 'replayed',
  'true',
  'identical alias catalog replay is idempotent'
);

select throws_ok(
  $$select public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    '{"methodVersion":"entity-alias-v1","entities":[{"entityKind":"company","canonicalName":"Changed","aliases":[{"aliasText":"Changed","normalizedAlias":"changed","matchState":"eligible"}]}]}'::jsonb
  )$$,
  '22023',
  'Entity alias catalog idempotency conflict',
  'same idempotency key cannot be reused with a changed catalog'
);

select throws_ok(
  $$select public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000002',
    '{"methodVersion":"entity-alias-v1","entities":[{"entityKind":"company","canonicalName":"Acme","aliases":[{"aliasText":"ＡＣＭＥ","normalizedAlias":"wrong","matchState":"eligible"}]}]}'::jsonb
  )$$,
  '22023',
  'Invalid entity alias catalog payload',
  'callers cannot forge the normalized alias value'
);

select throws_ok(
  $$select public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000003',
    '{"methodVersion":"entity-alias-v1","entities":[{"entityKind":"company","canonicalName":"Acme","aliases":[{"aliasText":"Acme","normalizedAlias":"acme","matchState":"eligible"},{"aliasText":"ＡＣＭＥ","normalizedAlias":"acme","matchState":"eligible"}]}]}'::jsonb
  )$$,
  '22023',
  'Invalid entity alias catalog payload',
  'same-entity normalized duplicates fail closed'
);

select throws_ok(
  $$select public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000004',
    '{"methodVersion":"entity-alias-v1","entities":[{"entityKind":"company","canonicalName":"Acme","aliases":[{"aliasText":"Shared","normalizedAlias":"shared","matchState":"eligible"}]},{"entityKind":"product","canonicalName":"Product","aliases":[{"aliasText":"shared","normalizedAlias":"shared","matchState":"eligible"}]}]}'::jsonb
  )$$,
  '22023',
  'Invalid entity alias catalog payload',
  'cross-entity collisions cannot be mislabeled eligible'
);

select throws_ok(
  $$select public.persist_entity_alias_catalog(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000002',
    'f4000000-0000-4000-8000-000000000005',
    '{"methodVersion":"entity-alias-v1","entities":[{"entityKind":"company","canonicalName":"Other","aliases":[{"aliasText":"Other","normalizedAlias":"other","matchState":"eligible"}]}]}'::jsonb
  )$$,
  '42501',
  'Project access denied',
  'workspace/project identity cannot be crossed through the RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.entity_alias_catalogs), 1::bigint,
  'another member of the workspace can read the catalog');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.entity_alias_catalogs), 0::bigint,
  'outsider cannot read alias catalogs from another workspace');
select is((select count(*) from public.entity_alias_entries), 0::bigint,
  'outsider cannot read alias entries from another workspace');

reset role;
set local role service_role;
select throws_ok(
  $$insert into public.entity_alias_catalogs (
    workspace_id, project_id, idempotency_key, method_version,
    request_fingerprint, entity_count, alias_count, created_by
  ) values (
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000099',
    'entity-alias-v1', repeat('a', 64), 1, 1,
    'f1000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'service role cannot bypass the authenticated RPC with direct table inserts'
);

reset role;
select throws_ok(
  $$update public.entity_alias_entries set match_state = 'eligible' where normalized_alias = 'shared'$$,
  '22023',
  'Entity alias snapshots are immutable',
  'stored ambiguity state cannot be rewritten after snapshot creation'
);

select * from finish();
rollback;

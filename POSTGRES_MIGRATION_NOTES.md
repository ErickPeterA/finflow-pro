# PostgreSQL migration notes

## Generated files

- `supabase/migrations/20260902170000_initial_postgres_schema.sql`
- This is a consolidated baseline for a new empty PostgreSQL 17 database.
- No migration was executed and no remote database was contacted.
- `supabase/migrations_backup/` was left untouched.

## Dependencies found in the old migrations

- Foreign keys to `auth.users` in `profiles`, `user_roles`, `empresas`, `importacoes`, `planos_acao`, `periodos_fechados`, `relatorios`, `projeto_usuarios`, NIBO sync tables, and cash-flow tables.
- Defaults and policies using `auth.uid()`.
- Grants and policies targeting platform roles `authenticated`, `anon`, and `service_role`.
- A trigger on external auth user creation that populated `profiles` and `user_roles`.
- Row Level Security policies scoped by `public.has_role(auth.uid(), ...)` and `public.can_access_empresa(auth.uid(), ...)`.

No old migration referenced `storage.objects`, `storage.buckets`, or platform realtime objects.

## What changed in the new baseline

- Added a minimal `public.users` table to replace the relational dependency on external auth users.
- Repointed user foreign keys from `auth.users(id)` to `public.users(id)`.
- Removed defaults that depended on request/session helpers. Columns such as `created_by`, `informado_por`, and `updated_by` now have no implicit current-user default.
- Removed the external auth creation trigger and its helper function. User/profile/role creation should be handled later by the API/backend.
- Removed all grants to platform roles.
- Removed RLS enablement and policies that depended on external JWT/session behavior. Authorization must be implemented later by the API/backend.
- Preserved normal PostgreSQL structures: enums, tables, UUID defaults, primary keys, foreign keys, unique constraints, check constraints, indexes, pure SQL/plpgsql functions, and update triggers.
- Added `pgcrypto` because the schema uses `gen_random_uuid()`.

## User model decision

The baseline uses `public.users` only as a safe relational anchor:

- It stores `id`, optional unique `email`, `nome`, `ativo`, and timestamps.
- It does not store passwords.
- It does not implement login, sessions, token issuance, password reset, or permission enforcement.
- `public.profiles.id` references `public.users.id`, preserving the old one-to-one shape.
- `public.user_roles.user_id` and all audit/user ownership columns now reference `public.users.id`.

## Code that still needs future migration

- Supabase client setup remains in:
  - `src/integrations/supabase/client.ts`
  - `src/integrations/supabase/client.server.ts`
  - `src/integrations/supabase/auth-middleware.ts`
  - `src/integrations/supabase/auth-attacher.ts`
  - `src/integrations/supabase/types.ts`
  - `src/start.ts`
- Auth/session usage remains in:
  - `src/routes/auth.tsx`
  - `src/routes/index.tsx`
  - `src/routes/_authenticated/route.tsx`
  - `src/components/TopBar.tsx`
  - `src/lib/data.ts`
  - `src/routes/_authenticated/projetos.tsx`
  - `src/routes/_authenticated/gerenciamento.tsx`
  - `src/integrations/nibo/database.ts`
- Query/mutation calls using the Supabase client remain across:
  - `src/lib/data.ts`
  - `src/lib/importacao/importer.ts`
  - `src/lib/importacao/types.ts`
  - `src/routes/_authenticated/importacao.tsx`
  - `src/routes/_authenticated/fluxo-caixa.tsx`
  - `src/routes/_authenticated/plano-acao.tsx`
  - `src/routes/_authenticated/projetos.tsx`
  - `src/routes/_authenticated/gerenciamento.tsx`
  - `src/integrations/nibo/sync.ts`
  - `src/integrations/nibo/types.ts`
  - `src/integrations/nibo/database.ts`
- Project configuration still exposes platform URL/key variables in `.env.example`.
- `docs/NIBO_CODEX_CLOUD_SETUP.md` still documents the old platform environment variables and migration references.
- `package.json` still depends on `@supabase/supabase-js`.

I did not find usage of storage, realtime channels, or edge functions in `src/`.

## Review before running

- Confirm whether `public.users` should remain minimal or later gain additional non-secret identity fields.
- Confirm whether application database roles/grants should be added once the Docker/API deployment model is defined.
- Confirm that authorization will be enforced by the backend before exposing this database to users.
- Review the two indexes on `lancamentos(empresa_id, external_source, external_id)`: the baseline preserves both the older partial unique index and the later full unique index because both exist in the final migration history.
- The title default in `relatorios.titulo` was normalized to ASCII as `Relatorio Mensal` to avoid preserving mojibake from the old migration file.

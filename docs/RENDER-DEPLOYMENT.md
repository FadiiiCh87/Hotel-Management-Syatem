# PK-Hotels deployment (Render + Supabase)

Deploy only from `feature/pk-hotels-phase2-billing` until the release is verified.

## Backend: Render Web Service
- Name: `pk-hotels-api`
- Region: Frankfurt
- Runtime: Node 22
- Plan: Free (if offered)
- Repository: `https://github.com/FadiiiCh87/Hotel-Management-Syatem`
- Build: `npm install --no-audit --no-fund && npm run build -w @hms/api`
- Start: `npm run start -w @hms/api`
- Health check: `/api/v1/health`

Required backend environment variables:
- `DATABASE_URL`: **secret**, dedicated `pk-hotels-hms` Supabase Postgres connection string, with SSL configured according to Supabase's connection instructions.
- `JWT_SECRET`: **secret**, cryptographically random, at least 32 characters.
- `WEB_ORIGIN`: exact HTTPS origin of the deployed frontend.
- `NODE_ENV=production`
- `PGSSL`: configure after verifying Supabase connection certificate mode. Do not disable certificate validation without reviewing the connection configuration.

Never commit actual credentials or a Supabase service role key. This NestJS API uses direct PostgreSQL connections and does not need a Supabase service-role key.

## Frontend: Render Web Service
- Name: `pk-hotels-web`
- Runtime: Node 22
- Plan: Free (if offered)
- Build: `npm install --no-audit --no-fund && npm run build -w @hms/web`
- Start: `npm run start -w @hms/web`
- Environment: `NEXT_PUBLIC_API_BASE_URL` must be set to the deployed API origin if the frontend code expects it. Confirm the frontend's actual variable name before configuring.

## Release gates
1. GitHub Actions API build succeeds.
2. API health endpoint returns HTTP 200.
3. Supabase connectivity verified with an authenticated, read-only API operation.
4. Admin bootstrap performed securely; no default/shared passwords.
5. Verify login, rooms, reservation conflict, folio and payments in a test environment.
6. Check frontend login and key flows on mobile and desktop.
7. Keep tax invoice issuance disabled until VAT registration/treatment is verified.

Current status: database migrations and seed applied, but app build/deployment not yet verified.

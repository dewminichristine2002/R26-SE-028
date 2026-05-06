# Database Migrations

This backend now uses `node-pg-migrate` for schema versioning.

## Commands

- `npm run db:migrate` - apply pending migrations
- `npm run db:migrate:down` - rollback one migration

## Connection

Migration runner uses:

1. `DATABASE_URL` when present, otherwise
2. `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

## Notes

- Runtime auto schema sync is deprecated.
- Run migrations before starting the backend on a fresh environment.

# Database backup and restore

These commands create PostgreSQL custom-format backups for Supabase and restore them with checksum verification. Install PostgreSQL client tools so `pg_dump` and `pg_restore` are available, using the same or a newer major version than the Supabase server.

## Backup

Use Supabase's direct database connection URL, not the transaction pooler URL:

```bash
BACKUP_DATABASE_URL="postgresql://..." npm run db:backup -- --output=backups/documind.dump
```

The command writes the dump atomically and creates `documind.dump.json` containing its SHA-256 checksum. Existing backups are not overwritten unless `--force` is supplied. Store both files in encrypted off-site storage with restricted access; the repository ignores `backend/backups/`.

## Restore drill

Always rehearse against a separate Supabase project or disposable PostgreSQL database first. Restore intentionally uses a separate variable so it cannot silently fall back to the production application connection:

```bash
RESTORE_DATABASE_URL="postgresql://.../documind_restore" npm run db:restore -- --input=backups/documind.dump --confirm=documind_restore
```

The command verifies the checksum when the metadata file is present, validates the archive with `pg_restore --list`, then restores with `--clean --if-exists --exit-on-error`.

For a production restore, set `NODE_ENV=production` and add `--allow-production` after confirming maintenance mode, the exact target database, a fresh backup, and an approved rollback plan.

## Schedule and retention

- Daily backup, retained for 14 days.
- Weekly backup, retained for 8 weeks.
- Monthly backup, retained for 12 months.
- Run a restore drill at least monthly and record the achieved RPO/RTO.
- Alert when a scheduled backup is missing, exits non-zero, or its artifact/checksum cannot be uploaded.

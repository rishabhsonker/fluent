# D1 Database Migrations

## How D1 Migrations Work

D1 uses a simple migration system:

1. **Numbered migrations**: Name files sequentially (0001_name.sql, 0002_name.sql)
2. **Apply in order**: Run migrations in numerical order
3. **Track applied**: Keep track of which migrations have been applied

## Applying Migrations

### Local Development
```bash
# Apply all migrations
wrangler d1 execute translator-dev --local --file=./migrations/0001_initial_schema.sql

# Check tables
wrangler d1 execute translator-dev --local --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### Production
```bash
# Apply to production
wrangler d1 execute translator --file=./migrations/0001_initial_schema.sql
```

## Creating New Migrations

When you need to modify the schema:

1. Create a new migration file: `migrations/0002_add_feature.sql`
2. Write ONLY the changes (ALTER TABLE, CREATE INDEX, etc.)
3. Never modify existing migration files
4. Test locally first

Example migration:
```sql
-- Migration: 0002_add_user_timezone.sql
-- Created: 2025-07-15
-- Description: Add timezone field to user preferences

ALTER TABLE user_preferences ADD COLUMN timezone TEXT DEFAULT 'UTC';
```

## Best Practices

1. **One-way only**: Migrations should only go forward
2. **Small changes**: Each migration should do one thing
3. **Test first**: Always test on translator-dev before production
4. **Keep history**: Never delete applied migrations
5. **Document well**: Explain what and why in comments
Unzip this package in the folder that contains your `church-platform` directory:

  unzip -o church-platform-flow-scope-update.zip

Then run the new migration:

  supabase db push

If you apply migrations manually, run:

  supabase/migrations/024_flow_scope_safe_backfill.sql

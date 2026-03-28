Unzip this from the folder that contains your existing church-platform directory:

unzip -o church-platform-system-users-across-churches-fix.zip

This replaces:
- app/(app)/[churchSlug]/settings/system-setup/users/page.tsx

What it changes:
- makes "Users Across Churches" a real cross-church directory instead of a global-admin-only list
- shows System Admin badges for users in global_admins
- shows church membership badges for each user across churches
- adds simple filters for all users, system admins, church admins, and church users

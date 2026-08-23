# Detach and Relaunch DocuMind

## Goal
Create a clean private-repository-ready copy of DocuMind for `documind.icu`, without old Git history or live database/deployment credentials.

## Tasks
- [x] Inventory nested Git repositories and tracked secret/config files.
- [x] Replace local environment values with safe empty placeholders while preserving required keys.
- [x] Replace old Render/Vercel URLs and deployment guidance with `documind.icu` production placeholders.
- [x] Preserve Prisma schema and migrations and document applying them to a new Supabase project.
- [x] Remove old Git metadata, initialize one new repository, and create an initial commit.
- [x] Create the private GitHub repository `Documind` and push when GitHub authorization is available.
- [x] Verify no old connection strings/domains or secrets remain, then run lint/build checks.

## Done When
- [x] The workspace has one fresh Git history, contains no live `.env` files in tracking, and is ready for a new Supabase and production host.

## Notes
No remote Supabase, Render, Vercel, or other provider resources will be deleted.

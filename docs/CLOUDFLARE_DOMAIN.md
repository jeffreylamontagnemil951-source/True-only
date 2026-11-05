# Cloudflare hosting and connection

TrueOnly uses the free Cloudflare `workers.dev` hostname for its initial development deployment. **No paid domain is required.**

## Connected Cloudflare resources

The Cloudflare account connection was verified. The account's existing Workers subdomain is:

`growref-admin.workers.dev`

The TrueOnly Worker name in `wrangler.jsonc` is `trueonly-student-finder`. Its expected URL after deployment is:

`https://trueonly-student-finder.growref-admin.workers.dev`

This hostname is not active until the Worker is deployed.

A dedicated D1 database named `trueonly-db` has been created and its UUID is connected in `wrangler.jsonc`. The database currently has no schema; migrations have not yet been applied.

## Cloudflare Access

The connected Zero Trust tenant is:

`wandering-bar-0ae9.cloudflareaccess.com`

This tenant domain is configured as `ACCESS_TEAM_DOMAIN` in Wrangler. The TrueOnly-specific Access application and its audience value are not yet configured.

Before deployment:

1. In Cloudflare Zero Trust, create a self-hosted Access application for `trueonly-student-finder.growref-admin.workers.dev`.
2. Create an allow policy limited to verified school staff identities. Do not select Everyone or broadly allow all account users.
3. Enable MFA where available and choose a reasonable session duration.
4. Copy the application's AUD tag into `ACCESS_AUD` in `wrangler.jsonc`.
5. Confirm unauthenticated users are denied and only approved staff can sign in.
6. Ensure each approved identity has an active administrator record in D1, scoped to the correct school.

The account's existing identity provider is restricted to Cloudflare account members. Do not assume that this automatically covers school staff; choose and test an identity method appropriate for the school before allowing access.

Official guide: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## Database and bindings

The D1 database binding is `DB`. The Worker also declares the static assets binding `ASSETS` and Durable Object binding `SUPPORT_ROOMS`.

The manual deployment workflow applies the checked-in migrations before deploying. Do not apply schema migrations manually outside the workflow unless the migration history is tracked consistently.

## Manual deployment

The workflow at `.github/workflows/deploy.yml` is triggered manually from GitHub Actions. Before using it:

1. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. The API token should have only the account permissions needed for Workers Scripts and D1 database operations.
3. Configure the dedicated Access app and set `ACCESS_AUD` in `wrangler.jsonc`.
4. Add the initial school and Super Admin using the secure bootstrap procedure.
5. Complete school authorization, safeguarding, privacy and independent security checks.
6. Run the manual workflow only when the deployment is approved.

No Worker has been deployed by this setup. The D1 database is currently empty and no real student data should be entered.

## Important safeguards

- Use synthetic test records only during development.
- Enforce school-level authorization server-side.
- Student-to-student messaging is disabled.
- Private file attachments are not implemented; do not create public R2 buckets or public object URLs.
- Keep credentials and student records out of GitHub.
- Cloudflare's `workers.dev` hostname is appropriate for development and hobby use, not a guarantee of suitability for business-critical student information systems.

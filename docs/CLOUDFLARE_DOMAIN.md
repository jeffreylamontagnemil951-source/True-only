# Cloudflare domain and hosting setup

TrueOnly will use Cloudflare's free `workers.dev` subdomain for its initial development hostname. **Do not buy a domain or register a paid `.dev` domain for this setup.**

## Free hostname

Cloudflare Workers accounts include a configurable `workers.dev` subdomain. Each Worker receives an address in this format:

`https://<YOUR_WORKER_NAME>.<YOUR_ACCOUNT_SUBDOMAIN>.workers.dev`

For this repository, the Worker name in `wrangler.jsonc` is `trueonly-student-finder`, so the eventual URL format is:

`https://trueonly-student-finder.<YOUR_ACCOUNT_SUBDOMAIN>.workers.dev`

The account subdomain must be selected or confirmed in the Cloudflare dashboard. The exact URL is not active until the Worker is deployed. A `workers.dev` address is a Cloudflare-provided subdomain, not a registered `.dev` domain.

## Configure the account subdomain

1. Sign in to the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Find **Your subdomain** and choose **Change** if you want to set or change the account subdomain.
4. Choose an available subdomain and save it.
5. Keep the Worker name as `trueonly-student-finder` unless the project configuration is deliberately changed.

Official guide: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## Protect the application

A `workers.dev` address can be publicly reachable. Before exposing any application data:

1. Configure a Cloudflare Access application and an allow-list policy for approved school staff.
2. Confirm that Access protects the Worker hostname and that unauthenticated requests cannot reach protected application routes.
3. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in the Worker configuration to the exact values for that Access application.
4. Create the initial administrator using the immutable identity subject from the approved identity provider.
5. Test with synthetic accounts for each role and verify school-level data isolation.

Cloudflare documents Access protection for `workers.dev` hostnames here: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## D1 and Worker configuration

1. Create the D1 database named `trueonly-db`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the actual database ID.
3. Apply migrations with `npx wrangler d1 migrations apply trueonly-db --remote`.
4. Confirm the `DB`, `ASSETS`, and `SUPPORT_ROOMS` bindings are present.
5. Configure the Access variables with actual values; do not leave placeholder strings in a live deployment.

## Production and student-data safeguards

Cloudflare describes `workers.dev` as intended for personal or hobby projects, not business-critical production. Before real student data is considered, an authorized school must decide whether this hosting choice is appropriate and complete privacy, safeguarding, legal, and security reviews. A future custom domain may be considered only if the school authorizes it; it is not required for this initial development setup.

- Use synthetic test records only during development.
- Keep school-level authorization enforced server-side.
- Do not enable student-to-student private messaging.
- Private attachments are not implemented. Do not create a public R2 bucket or public attachment URLs.
- Never commit credentials, student records, real student photos, or production database exports.

No domain has been registered, no Worker has been deployed, and no Cloudflare resources have been provisioned by this documentation change.

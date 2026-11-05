# TrueOnly Student Finder

A privacy-first school directory and staff support workspace built with Cloudflare Workers, D1, Durable Objects and Cloudflare Access.

## Current status

- Cloudflare account connection verified.
- Cloudflare D1 database `trueonly-db` created and its ID connected in `wrangler.jsonc`.
- Account `workers.dev` subdomain confirmed as `growref-admin`.
- Worker is configured to use `workers.dev`, but **has not been deployed**.
- D1 schema migrations have **not** been applied.
- Dedicated TrueOnly Cloudflare Access application created in default-deny mode; approved staff identity provider and allow-list still need setup.
- Use synthetic records only. Do not enter real student information.

## Hosting address

After a safe deployment, the expected URL is:

`https://trueonly-student-finder.growref-admin.workers.dev`

This is a Cloudflare-provided `workers.dev` subdomain. No paid domain is needed.

## Stack

- Cloudflare Worker API and static frontend
- Cloudflare D1 relational database
- SQLite-backed Durable Objects for per-ticket real-time notifications
- Cloudflare Access for identity-gated staff sign-in
- GitHub Actions for tests and manual deployment
- No public file storage or student-to-student private messaging

## Checks

```sh
npm test
```

GitHub Actions runs the test suite on pushes to `main` and pull requests.

## Cloudflare deployment readiness

Read [Cloudflare setup](docs/CLOUDFLARE_DOMAIN.md) and [Security baseline](docs/SECURITY.md).

The D1 database exists but is empty. Migrations are applied by the manual deployment workflow. Before deploying:

1. Create a dedicated Cloudflare Access application for the expected `workers.dev` hostname.
2. Configure a restrictive allow policy for verified, authorized school staff only. Do not use an Everyone policy.
3. Add an approved identity provider and staff-only allow policy to the TrueOnly Access application. Its AUD value is already configured in `wrangler.jsonc`.
4. Create the initial school and Super Admin records using the documented secure bootstrap procedure and verified identity subject.
5. Add GitHub repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` with least-privilege access.
6. Complete school authorization, safeguarding, privacy, legal and independent security reviews.
7. Change `ACCESS_POLICY_READY` to `true` in `wrangler.jsonc` only after the staff allow policy is reviewed.
8. Run the manual deployment workflow only after all checks are complete.

The deployment workflow is manual only; pushes to `main` do not deploy.

## Student safety and privacy

This is a development implementation, not a certified student information system. Student records are sensitive, especially when they concern minors. Obtain school authorization, establish an appropriate lawful basis and consent process, minimize collected data, define retention and deletion rules, and independently test access controls before any real-world use.

Never commit API tokens, Access secrets, student information, real student photos, or production database exports. Private attachments and student-to-student direct messaging are not implemented.

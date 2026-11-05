# TrueOnly Student Finder

A privacy-first school directory and staff support workspace built for Cloudflare Workers, D1 and Durable Objects.

## Status

Development scaffold. Do not use with real student records until an authorized school has completed privacy, safeguarding and security reviews and configured identity access. No Cloudflare resources have been provisioned and no deployment has been performed.

## Stack

- Cloudflare Worker API and static frontend
- Cloudflare D1 for relational records
- Durable Objects for per-ticket real-time notifications
- Cloudflare Access for identity-gated access
- Cloudflare `workers.dev` subdomain for the initial free hostname
- GitHub for source control and CI
- Private R2 attachments are not implemented or bound

## Local checks

```sh
npm test
```

## Cloudflare setup

Read [Cloudflare domain and hosting setup](docs/CLOUDFLARE_DOMAIN.md) before configuring a hostname.

1. Use the account's Cloudflare-managed `workers.dev` subdomain; no domain purchase is required for this initial setup.
2. Create a D1 database and set its ID in `wrangler.jsonc`.
3. Apply all migrations with `npx wrangler d1 migrations apply trueonly-db --remote`.
4. Configure the Worker bindings declared in `wrangler.jsonc`: `DB`, `ASSETS`, and `SUPPORT_ROOMS`.
5. Configure Cloudflare Access to protect the Worker hostname. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` to the values from the Access application.
6. Create an initial administrator record in D1 using the immutable identity subject from the approved identity provider. Assign only the minimum required role.
7. Confirm the Access policy protects the `workers.dev` hostname and test with synthetic accounts before any public use.
8. Complete safeguarding, privacy, authorization, and security reviews before any production deployment.

The Worker name is currently `trueonly-student-finder`. Once deployed and the account subdomain is configured, the URL format will be:

`https://trueonly-student-finder.<YOUR_ACCOUNT_SUBDOMAIN>.workers.dev`

Never commit API tokens, Access secrets, student information, real student photos, or production database exports. Do not create public object URLs for future private attachments.

## Important

Cloudflare describes `workers.dev` as suitable for personal or hobby projects rather than business-critical production. This repository is a starting implementation, not a certified student information system. Student data is sensitive, especially information about minors. Obtain school authorization, establish a lawful basis and consent process where required, minimize collected data, set retention rules, and test access controls before production use.

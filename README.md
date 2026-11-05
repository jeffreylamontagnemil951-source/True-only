# TrueOnly Student Finder

A privacy-first school directory and staff support workspace built for Cloudflare Workers, D1 and Durable Objects. Private R2 storage is reserved for a future attachment feature.

## Status

Initial implementation scaffold. Do not use with real student records until an authorized school has completed the privacy, safeguarding and security review and configured identity access.

## Stack

- Cloudflare Worker API and static frontend
- Cloudflare D1 for relational records
- Durable Objects for per-ticket real-time notifications\n- R2 attachments are not implemented or bound yet
- Cloudflare Access for identity-gated access
- GitHub for source control and CI

## Local checks

```sh
npm test
```

## Cloudflare setup

1. Create a D1 database and apply `migrations/0001_initial_schema.sql`.
2. Create a private R2 bucket for approved profile images and support attachments.
3. Configure the Worker bindings named `DB` and `PRIVATE_FILES`.
4. Configure Cloudflare Access for the application hostname. Set Worker variables `ACCESS_TEAM_DOMAIN` (for example, `school.cloudflareaccess.com`) and `ACCESS_AUD` (the Access application audience tag).
5. Create an initial administrator record in D1 using the immutable identity subject from your Access identity provider. Assign only the minimum required role.
6. Deploy the Worker and static assets using the current Cloudflare dashboard or the Cloudflare CLI workflow for your account.

Never commit API tokens, Access secrets, student information, real student photos, or production database exports. Do not create public object URLs for future private attachments.

## Important

This repository is a starting implementation, not a certified student information system. Student data is sensitive, especially information about minors. Obtain school authorization, establish a lawful basis and consent process where required, minimize collected data, set retention rules, and test access controls before production use.

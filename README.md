# GamePinned backend

Cloudflare Worker source for [GamePinned](https://gamepinned.com/), created by [sudoosama](https://sudoosama.com/). It uses Hono, D1, R2, and Cloudflare rate-limit bindings for licensing, updates, admin pages, and support flows. This is development source, not a production deployment package.

## Why GamePinned ended

The core game blocking worked, but Steam, Epic Games, and Riot Games updates and uninstalls can remove or replace the same game files. Reliably telling them apart to unlock and relock games would have required deeper monitoring or control of the user's PC. That crossed a privacy boundary I was not willing to cross, so development ended on September 19, 2026.

## Local setup

1. Run `npm ci`.
2. Copy `wrangler.toml.example` to `wrangler.toml` and replace the example D1, R2, rate-limit, email, and Polar values with resources you own. The example has no production routes.
3. Create a new D1 database and apply `schema.sql` to that database. Review its SQL before using it on an existing database.
4. Set Cloudflare secrets named `SIGNING_KEY`, `ADMIN_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_API_KEY`, and `RESEND_API_KEY` using `wrangler secret put`. `DEBUG_LOG_PRIVATE_KEY` is optional if you use encrypted support logs. Use the same `SIGNING_KEY` in your Windows service build.
5. Run `node check-syntax.cjs` and `npx wrangler deploy --dry-run` to validate your setup.

The original account IDs, product IDs, admin address, production routes, keys, and deployment scripts are excluded. `wrangler.toml`, `.dev.vars`, and local environment files are ignored. The website lives outside this repository.

Copyright (c) 2026 sudoosama. Licensed under the MIT License. See [LICENSE](LICENSE).

# GamePinned backend

Cloudflare Worker source for GamePinned, created by [sudoosama](https://sudoosama.com/). It uses Hono, D1, R2, and Cloudflare rate-limit bindings for licensing, updates, admin pages, and support flows. Development ended on September 19, 2026. This is development source, not a production deployment package.

## Local setup

1. Run `npm ci`.
2. Copy `wrangler.toml.example` to `wrangler.toml` and replace the example D1, R2, rate-limit, email, and Polar values with resources you own. The example has no production routes.
3. Create a new D1 database and apply `schema.sql` to that database. Review its SQL before using it on an existing database.
4. Set Cloudflare secrets named `SIGNING_KEY`, `ADMIN_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_API_KEY`, and `RESEND_API_KEY` using `wrangler secret put`. `DEBUG_LOG_PRIVATE_KEY` is optional if you use encrypted support logs. Use the same `SIGNING_KEY` in your Windows service build.
5. Run `node check-syntax.cjs` and `npx wrangler deploy --dry-run` to validate your setup.

The original account IDs, product IDs, admin address, production routes, keys, and deployment scripts are excluded. `wrangler.toml`, `.dev.vars`, and local environment files are ignored. The website lives outside this repository.

Copyright (c) 2026 sudoosama. Licensed under the MIT License. See [LICENSE](LICENSE).

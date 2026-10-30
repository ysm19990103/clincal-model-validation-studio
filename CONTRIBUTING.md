# Contributing

Keep changes focused on a concrete research or teaching task. A good contribution explains the current problem, describes the resulting behavior, and includes enough evidence for a reviewer to check it.

Use Node.js 24 and the package-manager version recorded in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`. The computational and database-service tests use Node's standard library and can run without installing framework dependencies:

```sh
npm test
npm run verify
npm run portable
```

Run `pnpm run build` after changes to routes, hosting integration, or the client bundle. For statistical changes, include a known-value example or an independent reference calculation. Fix the cause of a failing check rather than changing an expected value to match an unverified result.

Use generated observations in tests, issues, screenshots, and examples. Never commit real clinical records, direct identifiers, production databases, access tokens, environment files, or account-specific hosting identifiers. Changes to the database need a new, schema-only migration; preserve previously applied migration files.

Update the README and methods when behavior or assumptions change. UI text should explain what the user can do and how to interpret the result in ordinary language. Do not imply that automated preprocessing establishes data quality or clinical readiness.

Open a pull request with the problem, the change, and the checks you ran. See SECURITY.md for sensitive reports. Contributions are provided under the project's MIT license.

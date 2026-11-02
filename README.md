# Clinical Model Validation Studio

A research and teaching application for preparing tabular data and evaluating prediction models. Licensed under MIT. Version 2.0.0.

Clinical Model Validation Studio helps you prepare a dataset and take a closer look at a prediction model. You can choose the outcome, decide what each predictor means, and see how the model ranks outcomes, estimates risk, and performs at different decision thresholds.

Start with a CSV from your computer or try the fictional example. Selecting a file lets you inspect it locally. Choose **Upload & save privately** when you want to keep it in your account and reopen it later. The original file stays unchanged, and preparation results are saved separately.

## Prepare your data

1. Open **Datasets & preparation** and choose a UTF-8 CSV. The current limits are 1 MB, 5,000 rows, and 60 columns.
2. Select the outcome. Its nonmissing values become categories, including values that look like numbers. For a binary outcome, choose which category counts as the event.
3. Review the other columns. They start as predictors, with numeric or categorical types suggested from their values. You can change each type or exclude a column.
4. Choose **Preprocess dataset**. Review the transformation record and the prepared-data preview.
5. Save the preparation, export the prepared CSV and recipe, or fit the baseline model and view held-out validation results.

Preprocessing divides observations into training and holdout sets before learning any transformations. Numeric gaps are filled with training medians, categorical gaps with training modes, categories are one-hot encoded, and numeric predictors are centered and scaled using training statistics. Rows with a missing outcome are excluded. Constant or entirely missing training predictors are excluded and listed. Exact duplicate removal is optional and off by default.

Blank cells, NA, N/A, null, and NaN are treated as missing, without regard to letter case. Non-numeric values in a column selected as numeric become missing and are counted in the audit. Categories retain their text labels; “01” and “1” remain different. The current workflow accepts 2–20 outcome categories; baseline validation requires exactly two. It never quietly turns a multicategory outcome into a binary one.

The baseline is ridge logistic regression, evaluated on held-out rows against a training-prevalence comparator. It is a starting point for evaluation, not an automatic model-selection system. The application shows ROC and precision–recall curves, calibration, decision curves, confusion matrices, and optional bootstrap intervals. Built-in examples remain available for learning and demonstration.

## Your saved workspace

The hosted application uses a Cloudflare D1 database. Each dataset is associated with the site-specific ID of the signed-in user. The server checks ownership for listing, reopening, preparation updates, and archiving. It does not store account email or display name in the dataset tables. Original CSV text and prepared rows are stored as bounded chunks; metadata, configuration, and transformation summaries are stored separately.

Saved datasets can be reopened across sessions. Archiving hides a dataset from the normal list and is reversible; it is not permanent deletion. Revision checks prevent one tab from overwriting another tab's newer settings. Source archives and deployments contain code and schema migrations, not uploaded datasets.

No OpenAI API key or other AI service credential is needed. Do not include patient identifiers or data you lack permission to store. See [privacy and storage](docs/PRIVACY.md) for the scope and limits of these protections.

## Run and develop

The server uses the supplied Sites Vinext starter, with its authentication integration and D1 binding. A live deployment requires your own Sites configuration. GitHub Pages can serve the static demo but cannot host the dataset database or API. Use Node.js 24 or later. Install pnpm at the version recorded in `package.json`, then install the locked dependencies:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run build
```

Apply the local database migration below before saving datasets, then run `pnpm run dev`. Open the URL printed by the development server. In the portable loopback development profile, use its supplied mock sign-in to exercise dataset storage; this identity is excluded from production.

The generic `DB` binding is declared in `.openai/hosting.json`; no existing account or deployment identity is included. Generate a new schema migration with `npm run db:generate`. For a local database, build first, then apply pending SQL files in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_smooth_gladiator.sql
```

Do not replay already-applied migrations. Sites applies production migrations during publication. Authentication in production is provided by Sites; datasets cannot be saved anonymously. The managed preview does not simulate sign-in. The starter's portable loopback development profile includes its documented mock sign-in flow, which is excluded from production.

`npm run portable` creates a single HTML file for local preparation and calculations. It does not provide database storage; use the hosted application for that. `python scripts/serve.py` serves only the client and also has no database API.

## Verification

```sh
npm test
npm run verify
python tests/reference_check.py
python tests/preprocessing_reference_check.py
```

The optional Python checks need NumPy, SciPy, and scikit-learn. They generate fictional observations locally, download no datasets, and compare the JavaScript results with independent implementations. See [verification notes](docs/VERIFICATION.md) for checked behavior and remaining limits.

Run the real-browser dataset workflow with:

```sh
pnpm exec playwright install --with-deps chromium
npm run test:e2e
```

This suite generates fictional CSV files, copies source into a temporary directory, applies the checked migrations to a disposable local D1 database, and starts the existing loopback development sign-in flow. It never connects to a deployment or reuses your development database, uploads, environment files, or browser profile. It removes its temporary server and database when finished. Browser reports, fictional downloads and failure traces go into ignored `test-results/`; the CI job retains these artifacts for seven days. If Chromium cannot run in your environment, the suite fails rather than silently skipping browser coverage. An installed compatible Chrome executable can be selected with `CMVS_BROWSER_PATH`.

## Interpret results carefully

A single random holdout is internal validation. Do not repeatedly tune settings against that holdout and present it as untouched evaluation. Repeated patients, clustered observations, temporal prediction, censoring, case-control sampling, and survey weights need methods beyond this version. Row bootstrap intervals keep model predictions fixed; they do not include model-development uncertainty.

Preprocessing is not de-identification. No automated step verifies that a predictor was available at prediction time, that observations are independent, or that data collection supports the intended clinical question. The studio supports research and education; its results do not establish clinical readiness. [Methods](docs/METHODS.md) explains the calculations.

## Project layout

- `public/studio/`: interface, preprocessing, validation calculations, and local exports.
- `app/api/`: authenticated dataset and session endpoints.
- `lib/dataset-service.mjs`: ownership checks and database operations.
- `db/` and `drizzle/`: schema and migration history.
- `tests/`: metric, preprocessing, storage, and independent reference checks.
- `worker/` and `scripts/`: hosting integration, builds, and verification utilities.

See [contributing](CONTRIBUTING.md), [security](SECURITY.md), [architecture](docs/ARCHITECTURE.md), and [release notes](CHANGELOG.md). Released under the MIT license. No personal research dataset is included.

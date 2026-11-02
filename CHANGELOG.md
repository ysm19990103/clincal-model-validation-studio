# Changelog

## Unreleased

- Fixed selecting the same CSV again after switching datasets: the native file input is reset after capturing the file, so subsequent selections trigger an import.
- Fixed reopening after a cross-tab revision conflict so archive actions use the reopened record's revision while later conflicts still fail safely.
- Added isolated Chromium workflow tests and a CI job covering CSV selection, preparation, private saving, fresh-session reopening, fitting, downloads, and privacy/error paths with fictional data.
- Updated reproducible verification instructions and separated local development checks from deployed-service checks.

## 2.0.0 — 2026-10-30

- Added a dataset workspace with CSV selection and account-scoped database storage.
- Added categorical outcome selection, event-category selection, predictor inclusion, and numeric/categorical type controls.
- Added reproducible training-only preprocessing, an audit record, prepared-data exports, and saved configurations.
- Added ridge logistic baseline fitting with held-out validation and a training-prevalence comparator.
- Added ownership, revision, archive, parsing, and preprocessing tests.
- Prepared an independent source repository with generic hosting configuration, contribution guidance, security reporting guidance, and continuous integration.

## 1.0.0 — 2026-10-30

- Introduced reproducible synthetic examples for discrimination, calibration, decision curves, subgroup summaries, and bootstrap intervals.
- Added standalone HTML delivery, report bundles, and independent metric checks.

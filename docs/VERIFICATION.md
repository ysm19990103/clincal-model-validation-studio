# Verification record

Release: 2.0.0. Checked on 2026-10-30.

## Automated checks

- 34 Node.js tests passed. The suite covers metric definitions, boundary and missing-class cases, CSV parsing, report escaping, ZIP records, training-only preprocessing, categorical outcome coercion, duplicate handling, multicategory safeguards, held-out predictions, authentication, same-origin writes, owner isolation, persistence across requests, revision conflicts, and reversible archiving.
- Storage tests execute the actual service SQL against an in-memory SQLite database initialized with the checked schema migration. They do not mock ownership decisions or database query results.
- 48 metric comparisons agree with scikit-learn to a maximum absolute difference of 6.6e-15. Twenty-two calibration coefficient comparisons agree with SciPy within 1e-5.
- Thirty-six baseline holdout predictions agree with independent SciPy optimization to a maximum probability difference of 8.6e-7. Independently calculated training medians, means, and standard deviations agree within 1e-12.
- The D1 schema migration was generated, inspected, and applied successfully to the local D1 database. The Sites production build passed.
- Syntax checks and the static credential/privacy scan passed. Build and source archives exclude local data and database state.

## Browser checks and limitations

The updated browser interface loaded. The synthetic raw-data example displayed outcome selection, the categorical outcome lock, predictor inclusion, and per-column numeric/categorical selectors. Changing a predictor's type and running preprocessing succeeded. The browser showed the transformation audit and prepared preview, with 192 training and 48 holdout observations. Baseline fitting completed and displayed held-out AUROC 0.796 and Brier score 0.199 for that example.

The CSV file-picker operation stalled in the automated browser, and the browser session then became unresponsive. The final external-file selection path and an authenticated save/reopen workflow could not be completed in that browser. Authentication and persistence were verified through service tests, not a production browser session. The managed preview does not simulate user sign-in. A direct API integration attempt against a loopback address also could not reach the managed preview service; no production or security workaround was used.

The previous release's metric CSV download worked; its report-download event was not confirmed by automation. Report generation, escaping, and ZIP extraction were checked in code. Version 2's prepared CSV and recipe serialization use the same export path, but completed browser download events were not verified. The new standalone HTML was generated and its inline scripts checked; the stalled browser prevented a fresh portable-browser check.

Only generated synthetic observations were used. No personal or hospital dataset was read or uploaded during development. These checks are not a clinical validation study, security certification, or exhaustive browser test.

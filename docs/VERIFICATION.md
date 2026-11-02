# Verification record

## Dataset workflow follow-up — 2026-11-02

Scope: version 2.0.0 plus the unreleased changes in [PR #1](https://github.com/ysm19990103/clincal-model-validation-studio/pull/1). All observations are generated fictional fixtures. No personal or hospital dataset, production database, real account credential, or deployed service was used.

### Environment and reproducibility

The browser suite runs against a disposable **local development service on the GitHub Actions runner**, using the existing portable loopback mock sign-in and the actual Cloudflare local D1 runtime. Neither API responses nor database operations are mocked in these browser tests. It is not a test of a production deployment. The single development identity also does not substitute for a two-account production isolation test.

Use Node 24 and the locked dependencies:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
npm run test:e2e
npm test
npm run verify
npm run build
python tests/reference_check.py
python tests/preprocessing_reference_check.py
```

`test:e2e` creates an isolated source copy, generates a generic local DB binding, applies every checked SQL migration in order to fresh local state, builds the portable HTML, starts Vite on `127.0.0.1` with an ephemeral port, and runs Playwright. Its allowlist excludes `.env`, existing runtime state, uploaded datasets and production configuration. Cleanup stops the server and removes the temporary database. Reports, screenshots, traces and downloaded fictional files are ignored by Git at any directory depth. The CI artifact `fictional-browser-results` has seven-day retention; the assertions and fixture generator remain in `tests/e2e/` for reproduction after it expires.

The authoring container successfully ran the unit/reference tests, production build and local D1 migration, but blocked Chrome's required process socket (`Operation not permitted`). Browser results below come from GitHub Actions, where Chromium launched successfully. No sandbox restriction or authentication guard was relaxed to obtain a browser pass. `CMVS_BROWSER_PATH` optionally selects an already-installed compatible Chrome for machines that support it.

### Browser evidence

**Six of six Chromium tests passed, with zero retries, in 17.3 seconds** in [Actions run 41399956893](https://github.com/ysm19990103/clincal-model-validation-studio/actions/runs/41399956893), testing implementation commit `1b48b074f02a68ad837206d2247a4e44fa34d248`. The runner used Ubuntu 26.04.1, Node 24.22.1, pnpm 11.25.0, Playwright 1.61.1 and Chromium 149.0.7827.55. The same run passed the core checks and production build.

| Browser case | Result |
| --- | --- |
| External CSV → categorical outcome → predictor types → preprocessing → explicit save → fresh-session reopen → fit → result downloads | Passed |
| Select the identical external file again after trying the synthetic example | Passed |
| Malformed CSV, multicategory guard, stale save rejection, reopen/ archive/ restore | Passed |
| Local sign-in rejects forged identity headers and cross-site sign-in | Passed |
| Synthetic example and template downloads | Passed |
| Portable HTML import, preparation, fitting and report download with no HTTP requests | Passed |

The failures before the fixes remain inspectable: [run 41399100335](https://github.com/ysm19990103/clincal-model-validation-studio/actions/runs/41399100335) reproduced same-file selection retaining the synthetic example; [run 41399413319](https://github.com/ysm19990103/clincal-model-validation-studio/actions/runs/41399413319) passed the complete primary workflow and reproduced stale list revisions during archiving. The first run also exposed an incorrect BOM expectation in the test, corrected to compare decoded CSV text.

The main fixture has 121 records and six columns, a UTF-8 BOM and CRLF endings, numeric-looking outcome labels `01` and `1`, one invalid numeric cell, one missing numeric cell, two missing outcomes, one duplicate record, a numeric-coded categorical predictor, a deliberately excluded fictional record code, a constant column and an all-missing column. Selecting the outcome forces categorical treatment without merging `01` and `1`. With seed 73, 30% holdout and duplicate removal, 118 rows remain: 82 training and 36 holdout, with five encoded features. The invalid and missing numeric cells are counted and imputed; constant/all-missing predictors are excluded.

The browser chooses the external file by clicking its label and awaiting the native `filechooser` event, then supplies the generated file. This verifies the web file-selection path; it is not a manual operating-system file-dialog test. File selection and preprocessing issue no dataset writes. After local sign-in, explicit upload saves decoded original CSV text. `Blob.text()` consumes a leading BOM; CRLF, original values and missing tokens are preserved. Preparation settings are saved separately and the stored source is checked after saving.

A new browser context starts without cookies or web storage, is denied anonymous dataset access, signs in through the normal development link, and reopens the record. Outcome/event, types, excluded predictor, seed, split and duplicate settings match. The regenerated recipe and prepared values match the earlier exports. Baseline evaluation uses only 36 holdout observations; downloaded AUROC (`0.29475308641975306`) and Brier score (`0.2847221365933214`) match the tested calculation library. These values describe a mechanical software fixture, not a clinical dataset.

Downloads are tested through both UI steps: generate a file, then click its visible **Save file** link and await the browser download event. Filename, successful completion and content are asserted for prepared CSV, preprocessing recipe JSON, metrics CSV, analysis-settings JSON, report ZIP, synthetic example CSV and the synthetic template CSV. Report ZIP contents are extracted and checked against the settings and displayed metrics; input row codes and executable scripts must be absent. Both downloaded report ZIPs from run 41399413319 were also independently extracted and passed Python `zipfile.testzip()` CRC checks. Its held-out-results screenshot was visually inspected. The portable HTML separately imports, prepares, fits and downloads a report without HTTP requests or database access.

### Reproduced defects

On the original UI, importing a file, choosing the synthetic example and then choosing the identical file path left the synthetic data active (240 rows rather than the expected 121). Chromium did not fire a second `change` event because the native input retained the same selection. The fix captures the `File` and clears the input value before processing. The regression uses the same physical file twice, without rewriting it. First-time selection did not stall in the CI browser; the earlier October automation stall is not claimed to have the same cause.

The cross-tab test found a separate stale-revision bug. After another tab saved preparation, reopening fetched the latest record into the workspace but left the saved-list entry at the old revision. The next archive request still received a conflict. Reopening now synchronizes the list's metadata to the exact record revision fetched. It does not remove revision checks or fetch a newer revision merely to force a write through. The regression first confirms a stale preparation save is rejected, then reopens, archives, restores and checks that settings remain intact.

### Other checks and privacy scope

- All 34 existing Node tests pass, including SQL-backed owner isolation, revision checks, same-origin writes and reversible archiving.
- The independent reference checks pass: 48 metric comparisons (maximum absolute error `6.5503158452884236e-15`), 22 calibration comparisons, and 36 held-out baseline probabilities (maximum absolute error `8.501100603464096e-7`). Training medians, means and standard deviations also agree.
- The local D1 migration, production build, portable build, static privacy scan and whitespace checks pass.
- Production authentication, owner-scoped SQL, request limits, no-store headers and same-origin protections are unchanged. No credentials, real data, browser profiles or database snapshots are committed. The browser checks include anonymous rejection, no upload before explicit save, no external client requests, disabled example sharing for user-derived results, cross-origin write rejection and local sign-in header-spoofing rejection.

### Still requires a deployed service

Production ChatGPT sign-in and callback handling, real account isolation at the hosting ingress, deployed D1 binding/migrations and durability, and downloads under the deployed HTTPS/browser policies have not been exercised here. To close that separate gap, use two authorized test accounts and fictional data on the intended deployment: save/reopen after signing out and back in, verify the other account cannot list/read/update/archive the record, and repeat the download checks. The local development identity must remain excluded from production. Safari, Firefox and a manual macOS file dialog are outside this run.

These are software workflow checks, not clinical model validation, a security certification or an exhaustive browser compatibility study.

## Historical release check — 2026-10-30

Release: 2.0.0. The following record describes the checks and gaps at release time; the follow-up above supersedes its local browser gaps where verified.

### Automated checks

- 34 Node.js tests passed. The suite covers metric definitions, boundary and missing-class cases, CSV parsing, report escaping, ZIP records, training-only preprocessing, categorical outcome coercion, duplicate handling, multicategory safeguards, held-out predictions, authentication, same-origin writes, owner isolation, persistence across requests, revision conflicts, and reversible archiving.
- Storage tests execute the actual service SQL against an in-memory SQLite database initialized with the checked schema migration. They do not mock ownership decisions or database query results.
- 48 metric comparisons agree with scikit-learn to a maximum absolute difference of 6.6e-15. Twenty-two calibration coefficient comparisons agree with SciPy within 1e-5.
- Thirty-six baseline holdout predictions agree with independent SciPy optimization to a maximum probability difference of 8.6e-7. Independently calculated training medians, means, and standard deviations agree within 1e-12.
- The D1 schema migration was generated, inspected, and applied successfully to the local D1 database. The Sites production build passed.
- Syntax checks and the static credential/privacy scan passed. Build and source archives exclude local data and database state.

### Browser checks and limitations

The updated browser interface loaded. The synthetic raw-data example displayed outcome selection, the categorical outcome lock, predictor inclusion, and per-column numeric/categorical selectors. Changing a predictor's type and running preprocessing succeeded. The browser showed the transformation audit and prepared preview, with 192 training and 48 holdout observations. Baseline fitting completed and displayed held-out AUROC 0.796 and Brier score 0.199 for that example.

The CSV file-picker operation stalled in the automated browser, and the browser session then became unresponsive. The final external-file selection path and an authenticated save/reopen workflow could not be completed in that browser. Authentication and persistence were verified through service tests, not a production browser session. The managed preview does not simulate user sign-in. A direct API integration attempt against a loopback address also could not reach the managed preview service; no production or security workaround was used.

The previous release's metric CSV download worked; its report-download event was not confirmed by automation. Report generation, escaping, and ZIP extraction were checked in code. Version 2's prepared CSV and recipe serialization use the same export path, but completed browser download events were not verified. The new standalone HTML was generated and its inline scripts checked; the stalled browser prevented a fresh portable-browser check.

Only generated synthetic observations were used. No personal or hospital dataset was read or uploaded during development. These checks are not a clinical validation study, security certification, or exhaustive browser test.

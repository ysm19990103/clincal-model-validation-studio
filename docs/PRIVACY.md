# Privacy and storage

Selecting a CSV reads it locally. The app sends dataset contents to the site's database only after the user chooses **Upload & save privately**. **Save preparation** sends configuration for that saved dataset; the server recomputes and stores prepared rows from the original. Reopening a saved dataset retrieves its original rows and settings for the same signed-in user.

The database stores a site-specific account identifier, a user-entered dataset name, original CSV content, preprocessing settings, prepared rows, transformation summaries, revisions, and timestamps. It does not store the user's account email or display name in its tables. Dataset names, column names, categories, and records can themselves contain personal information; preprocessing does not remove it automatically.

All dataset routes require the platform-authenticated user ID and verify ownership server-side. Queries bind parameters, state-changing requests require the same origin and JSON, responses use `private, no-store`, and updates check the expected revision. The production app does not invent a user identity when authentication is absent. These are application controls, not a claim of regulatory certification or end-to-end encryption. Site owners and infrastructure operators may have administrative access to stored data.

The current limits are 1 MB of UTF-8 CSV, 5,000 observations, 60 columns, 500 characters per cell, 30 training levels per categorical predictor, and 200 encoded predictors. Each account supports up to 50 saved datasets, including archived datasets. Archiving is reversible and is not deletion or a retention guarantee. This version does not expose permanent deletion or scheduled retention controls.

The hosted site requires sign-in according to its existing audience settings. Adding dataset storage does not change who can visit it. The account checks are also applied when a site is shared with additional users in the future. Local and hosted databases are separate.

The distributed source contains no user datasets, account profiles, API keys, browser sessions, or production database files. Local runtime directories, environment files, credentials, and common dataset formats are ignored by Git. Schema migrations contain no seed data. Tests generate fictional observations in memory.

There is no AI service integration, analytics, third-party tracking script, or remote font. Client API calls go only to this site's own endpoints. The hosting provider may retain normal access logs. The standalone HTML runs calculations locally and has database storage disabled.

Synthetic example links contain settings only. The interface disables example sharing for user-derived validation results. Prepared CSV downloads contain row-level data. Preprocessing recipes can contain category values and fitted statistics. Reports omit input rows but may contain outcome labels and aggregate results. Review downloads before sending them to anyone else.

# Security policy

## Supported version

Security fixes target the current 2.x release. Deployment operators should keep their runtime and dependencies updated and review access settings before accepting real data.

## Reporting a concern

Do not publish credentials, personal data, or an exploitable dataset in an issue. Use the repository's **Security → Report a vulnerability** option if it is available. If private reporting is unavailable, open a minimal issue asking the maintainer for a private reporting channel, without technical details that expose data or enable exploitation. No personal contact address is embedded in this project.

Useful private reports describe the affected version, the operation involved, a minimal synthetic reproduction, and the expected access boundary.

## What the project protects

Dataset routes require authenticated identity, enforce ownership on the server, use bound SQL parameters, reject cross-origin writes, and return uncached responses. Revision checks reduce accidental overwrites. The published source contains only code, schema migrations, documentation, and synthetic test generators. The project does not require an AI API key.

The application does not implement de-identification, end-to-end encryption, regulatory certification, or a clinical data-governance program. A hosting operator may have administrative access to the database. Archiving is reversible hiding, not erasure. Review docs/PRIVACY.md before storing actual records.

The included privacy scanner detects common credential patterns and prohibited file types. It supplements review; it does not guarantee the absence of every possible secret. Keep environment and database files outside source control and enable the repository's available secret-scanning and push-protection features where appropriate.

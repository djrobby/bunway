---
title: Configuration and environment
---

# Configuration and environment variables

Bunway favors environment variables plus small application-owned TypeScript files. Restart processes
after changing `.env`. Empty provider values are not secrets and are safe in `.env.example`.

| Group | Variable | Required/default |
| --- | --- | --- |
| Core | `PORT` | API port; `3000` |
| Core | `CORS_ORIGIN` | Browser origin; `http://localhost:5173` |
| Core | `DEBUG` | Show unexpected CLI stack traces when truthy |
| Database | `DATABASE_URL` | Required for primary PostgreSQL/MySQL; SQLite has a file default |
| Database | `<NAME>_DATABASE_URL` | Required for named PostgreSQL/MySQL databases |
| Generators | `BUNWAY_ID_TYPE` | `uuid`; alternatives `integer`, `bigint` |
| Generators | `BUNWAY_ID_ENCODING` | `standard`; alternative `base64url` for UUIDs |
| Jobs | `BUNWAY_JOBS_DATABASE` | Named PostgreSQL database; `primary` |
| Jobs | `QUEUES` | Comma-separated worker queues; all/default behavior when omitted |
| Auth | `BETTER_AUTH_SECRET` | Required in production; at least 32 random characters |
| Auth | `BETTER_AUTH_URL` | API origin; `http://localhost:3000` |
| Auth | `WEB_ORIGIN` | trusted frontend/WebAuthn origin; `http://localhost:5173` |
| Auth | `AUTH_APP_NAME` | display name; `Bunway App` |
| Auth | `AUTH_RP_ID` | passkey relying-party ID; `localhost` |
| OAuth | `<PROVIDER>_CLIENT_ID`, `<PROVIDER>_CLIENT_SECRET` | Required only for selected real provider |
| Storage | `STORAGE_SERVICE` | `local`; alternative `s3` |
| Storage | `STORAGE_PATH` | local root; `storage` |
| Storage | `STORAGE_PUBLIC_URL` | public object base URL; local API storage URL by default |
| S3 | `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Required for S3 |
| S3 | `STORAGE_ENDPOINT`, `STORAGE_REGION` | Endpoint/region for S3-compatible service |
| Mail | `MAIL_DRIVER` | development infers `console`; production requires `resend` or `smtp` |
| Mail | `MAIL_FROM` | Required by Resend/SMTP unless each message supplies `from` |
| Resend | `RESEND_API_KEY` | Required for `MAIL_DRIVER=resend` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | SMTP configuration; port `587`, secure `false` |
| SMS | `SMS_DRIVER` | development infers `console`; production requires `twilio` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Required for Twilio delivery |

Google, GitHub, Microsoft, and Apple use uppercase provider prefixes. Selected OAuth providers with
missing credentials are disabled with guidance in development; production messaging never falls back
to console. Audit has no environment configuration because its generated recorder imports the selected
database explicitly.

Database topology lives in `src/db/config.ts`; provider selection lives in generated application code.
See [Databases](./database.md), [Authentication](./authentication.md), and [Messaging](./messaging.md).

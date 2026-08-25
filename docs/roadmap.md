---
title: Roadmap
---

# Roadmap

No dates here are promises. Developer feedback decides what follows v0.1.

## Available now

- project creation, development, route listing, console, and API-only mode
- PostgreSQL/MySQL/SQLite Drizzle databases and named mixed databases
- model/resource/scaffold generators with relationships, attachments, and soft deletion
- PostgreSQL Jobs with an in-memory driver fallback when no database is configured
- process-local typed SSE/WebSocket Realtime
- generated Better Auth, Audit, Mail/SMS, and local/S3-compatible Storage integrations
- Bun tests and conventional VPS deployment guidance

## Next: developer preview readiness

- continuously reproduce create/install/build/boot/migrate/scaffold workflows
- polish CLI errors and package/release metadata
- validate the Showcase with early users and fix concrete friction
- publish v0.1 and stop broadening it until feedback arrives

## Later or exploring

- PostgreSQL-backed multi-process Realtime and cross-process job progress, if deployments require them
- application-driven authorization guidance
- password-reset UI, provider webhook recipes, and storage direct uploads
- relationship enhancements driven by concrete schemas

## Explicitly not planned for v0.1

A Bunway ORM/controller hierarchy, repositories, custom RPC/validation, dependency injection, Redis
requirement, queue dashboard, admin framework, plugin marketplace, Kubernetes platform, and frontend state
framework are not planned. New features must materially improve development without obscuring the stack.

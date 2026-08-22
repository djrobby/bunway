---
sidebar_position: 5
title: Resources and scaffolding
---

# Resources and scaffolding

A scaffold generates ordinary source for the database, API, test, and frontend:

```sh
bunway g scaffold Product name:string price:decimal active:boolean
```

## API behavior

Collection routes support server-side pagination, text filtering, and whitelisted sorting:

```text
GET /products?page=1&perPage=50&filter=shoe&sort=name&order=asc
```

Responses use `{ records, total }`. `perPage=all` explicitly disables pagination. Create and update
bodies use Elysia validation, and IDs and multipart scalar values are normalized at the request boundary.

## Collection interface

Generated collection pages provide:

- Create and edit dialogs opened from the `New Resource` button and row actions.
- An explicit “Are you sure?” confirmation dialog before every scaffolded record deletion.
- Date, datetime/timestamp, and time inputs consistently use the generated shadcn-svelte `Input`-based `DateField` component in create and edit forms.
- Search with a short debounce.
- Server-side sorting and pagination.
- 50, 100, 250, and all-row page sizes.
- Row selection and column visibility controls.
- Humanized column headings.
- Draggable column widths stored in local storage per resource.
- Double-click column-width reset.
- Detail, edit, and delete row actions.
- An Edit button on every generated detail page when the scaffold includes the `update` action. It opens
  an edit dialog on that detail page and updates the displayed record without navigating to the index.
- Native row reordering when a `position:integer` field exists.

The UI uses Svelte 5 and source-installed shadcn-svelte components. Application code can modify every
generated page without a Bunway frontend runtime.

Date and datetime columns and detail values use the application's saved timezone, date format, and time
format. Database values remain unchanged; formatting occurs only at display time.

Generated detail pages use the same semantic card, foreground, muted, and border tokens as the application
shell. Their content therefore follows light and dark mode without resource-specific color overrides.

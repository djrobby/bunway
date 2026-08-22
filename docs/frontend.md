---
sidebar_position: 9
title: Frontend
---

# Frontend

Generated applications use SvelteKit and Svelte 5 directly. Eden Treaty derives the first-party client
contract from the exported Elysia `App` type, avoiding duplicate DTOs and generated client files.

The starter includes Tailwind CSS and source-installed shadcn-svelte primitives. Bunway composes them for
dialogs, tables, sidebars, dropdowns, inputs, relationship pickers, and appearance settings, but does not
wrap Svelte routing, loading, forms, state, or navigation.

## Application shell

The application content inset is full width. Generated resource pages and the maintained Blog,
Realtime, Audit, and Messaging showcase pages use the available inset width while retaining responsive
horizontal padding; individual text blocks may still constrain line length when readability requires it.

Scaffold generation appends an explicit item to `web/src/lib/resources.ts`. The responsive sidebar reads
that list and maps semantic icon keys to local Remix icons. There is no runtime filesystem discovery.
Desktop sidebar expansion is retained in browser local storage, so navigating or refreshing does not
discard the user's collapsed preference.

The color-mode button has no menu: each activation cycles light → dark → system. Its sun, moon, or
computer icon reflects the selected mode, and the preference persists across refreshes. System mode
continues following operating-system color-scheme changes.

The interface base color is always Neutral. The settings sheet still offers style, theme-color, and chart-
color choices, but does not expose a base-color selector.

## Date and time preferences

The settings sheet has a separate Date and time fieldset with its own Save and Reset buttons. Users can
choose any timezone supported by the browser, one of four date formats, and 12- or 24-hour time. These
preferences persist in local storage and generated scaffold date/datetime values use them for display.
They do not alter database storage or API values. Reset restores the browser timezone, `MM/DD/YYYY`, and
12-hour time.

Scaffold detail cards use semantic shadcn color tokens rather than fixed white and zinc colors, so their
backgrounds, borders, headings, and navigation text remain readable in both light and dark mode.

## Table preferences

Column visibility is page state. Resized widths are written to a resource-specific browser local-storage
key and restored on mount. Resize handles are subtle persistent dividers with larger invisible pointer
targets. Double-click a divider or use the page reset control to return to generated widths.

## Customization

Generated Svelte files are application source. Change components, replace the Eden calls, introduce
SvelteKit server loading, or use a different UI approach when the application requires it. Bunway is not
required at runtime for ordinary frontend behavior.

---
sidebar_position: 6
title: Relationships
---

# Relationships

Generate related resources before the resource that references them.

## Singular relationships

```sh
bunway g scaffold Product name:string category:belongs_to
bunway g scaffold Profile bio:text user:has_one:optional
```

`references` is an alias for `belongs_to`. Both generate an indexed foreign key and a Drizzle `one()`
relation. `has_one` additionally makes the foreign key unique. Scaffold forms use a searchable
single-select and can create a related row inline when it has a `name` or `title` field.

## Collection relationships

```sh
bunway g scaffold Post title:string comments:has_many tags:many_to_many
```

Both generate explicit Drizzle junction schemas and typed GET/PUT association endpoints. `has_many`
makes the related ID unique so a related row has one owner. `many_to_many` uses a composite primary key.
Forms use a searchable multi-select with inline creation.

Generated scaffold pages make relationships navigable. Singular values link to the related record's
detail page. Collection columns show the number of related rows and link to the owner's detail page,
where every related ID links to that row's detail page. Index and show responses include each collection's
`<relation>Ids`; index responses load them in one batched query per collection rather than one query per row.
Singular relationship columns are left-aligned like other textual values. Collection counts use compact
rounded badges so they remain visually distinct from scalar fields.

The test application also demonstrates inverse collections that are useful to application code: Category
details list Products, User details list Posts and Comments, Post details list Comments, and Tag details
separate polymorphic Product and Post IDs. These inverse queries remain explicit Drizzle code; Bunway does
not introduce runtime relationship discovery.

## Polymorphic many-to-many

Use explicit interface and join-table names:

```sh
bunway g scaffold Tag name:string
bunway g scaffold Product name:string tags:many_to_many:as=taggable:through=taggings
```

The generated `taggings` table contains `tagId`, `taggableType`, and `taggableId`. The related ID has a
foreign key to tags. The polymorphic ID deliberately has no foreign key because rows may refer to more
than one owner table. A composite primary key prevents duplicates, while an index supports owner lookup.

Association routes scope reads, replacement, and owner cleanup by both type and ID. The public UI remains
the same multi-select used by ordinary many-to-many relationships.
Polymorphic collections receive the same scaffold count and linked detail-ID display, with owner type and
owner ID both applied to the batched query.

```text
GET /products/:id/tags
PUT /products/:id/tags    { "ids": [1, 2] }
```

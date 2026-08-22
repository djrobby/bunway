---
title: Database field types
---

# Database field types

Field syntax is `name:type[:unique|optional]`. Arrays use `type[]`. Enums use
`status:enum=draft,published`. Attachments and relationships are separate field kinds.

| Portable scalar types | PostgreSQL-specific types |
| --- | --- |
| `string`, `text`, `varchar`, `char`, `boolean` | `timestamptz`, `interval`, `jsonb` |
| `smallint`, `integer`, `bigint`, `decimal`, `numeric`, `real`, `float` | `inet`, `cidr`, `macaddr`, `macaddr8` |
| `date`, `time`, `datetime`, `timestamp`, `uuid`, `json`, `binary` | scalar arrays (`string[]`, etc.) |

Other special kinds are `image`, `file`, `files`, `references`, `belongs_to`, `has_one`, `has_many`,
and `many_to_many`. `references` aliases `belongs_to`. `has_one` creates a unique foreign key.

Choose primary IDs with `--id-type=uuid|integer|bigint`. UUID is the default. UUIDs may use
`--id-encoding=standard|base64url`; base64url IDs are 22 characters. Relationships inherit the related
schema's ID type and encoding. Exact SQL builders differ by adapter; inspect and edit the generated
Drizzle schema for engine-specific requirements.

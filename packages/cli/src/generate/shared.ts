import { camel, kebab, plural, CliError } from "../utils";
import { parseFields } from "../fields";

export function names(raw: string) {
  if (!raw) throw new CliError("A name is required");
  const singular = camel(raw);
  return { singular, table: plural(singular), file: kebab(plural(singular)) };
}

export function collectionInfo(
  owner: string,
  field: ReturnType<typeof parseFields>[number],
) {
  const related = field.collection!;
  const relatedSingular = related.relation.endsWith("s")
    ? related.relation.slice(0, -1)
    : related.relation;
  const relatedId = `${relatedSingular}Id`;
  if (related.polymorphic) {
    return {
      ...related,
      ownerId: `${related.polymorphic.as}Id`,
      ownerType: `${related.polymorphic.as}Type`,
      relatedId,
      table: related.polymorphic.through,
      file: kebab(related.polymorphic.through),
      relatedSingular,
      polymorphic: true as const,
    };
  }
  const ownerId = `${owner}Id`;
  const table = `${plural(owner)}To${related.table[0]!.toUpperCase()}${related.table.slice(1)}`;
  return {
    ...related,
    ownerId,
    ownerType: undefined,
    relatedId,
    table,
    file: kebab(table),
    relatedSingular,
    polymorphic: false as const,
  };
}

export class CliError extends Error {}

export function kebab(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[ _]+/g, '-').toLowerCase()
}

export function camel(value: string) {
  return kebab(value).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function plural(value: string) {
  const irregular: Record<string, string> = { person: 'people', man: 'men', woman: 'women', child: 'children', mouse: 'mice', goose: 'geese', tooth: 'teeth', foot: 'feet' }
  const match = irregular[value.toLowerCase()]
  if (match) return /^[A-Z]/.test(value) ? `${match[0]!.toUpperCase()}${match.slice(1)}` : match
  if (value.endsWith('y') && !/[aeiou]y$/.test(value)) return `${value.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/.test(value)) return `${value}es`
  return `${value}s`
}

export function humanize(value: string) {
  const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ')
  return `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`
}

export function resourceIcon(value: string) {
  const name = value.toLowerCase()
  if (/(product|item|inventory|catalog)/.test(name)) return 'shopping-bag'
  if (/(categor|folder|collection)/.test(name)) return 'folder'
  if (/(user|person|people|customer|member|author)/.test(name)) return 'user'
  if (/(order|invoice|receipt|payment)/.test(name)) return 'receipt'
  if (/(post|article|document|page)/.test(name)) return 'article'
  if (/(comment|message|chat)/.test(name)) return 'chat'
  if (/(tag|label)/.test(name)) return 'price-tag'
  if (/(task|todo|checklist)/.test(name)) return 'checkbox'
  if (/(event|calendar|appointment)/.test(name)) return 'calendar'
  if (/(job|work|project)/.test(name)) return 'briefcase'
  if (/(setting|preference|config)/.test(name)) return 'settings'
  return 'database'
}

export async function run(command: string[], cwd = process.cwd()) {
  const child = Bun.spawn(command, { cwd, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
  const code = await child.exited
  if (code !== 0) throw new CliError(`Command failed (${code}): ${command.join(' ')}`)
}

export async function insertBefore(path: string, marker: string, content: string) {
  const file = Bun.file(path)
  const source = await file.text()
  if (source.includes(content.trim())) return
  if (!source.includes(marker)) throw new CliError(`${path} is missing the generator marker ${marker}`)
  await Bun.write(path, source.replace(marker, `${content}\n${marker}`))
}

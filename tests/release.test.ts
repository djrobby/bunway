import { expect, test } from 'bun:test'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('release tests exclude the database-backed package smoke fixture', async () => {
  const bunfig = await Bun.file(join(root, 'bunfig.toml')).text()
  const release = await Bun.file(join(root, 'scripts/release.ts')).text()

  expect(bunfig).toContain('root = "tests"')
  expect(release).toContain("await run(['bun', 'run', 'test'])")
})

test('release preflight packs unpublished workspace dependencies without resolving npm', async () => {
  const release = await Bun.file(join(root, 'scripts/release.ts')).text()

  expect(release).toContain("['bun', 'pm', 'pack', '--dry-run']")
  expect(release).not.toContain("['bun', 'publish', '--dry-run'")
})

test('every published package has package-specific npm documentation', async () => {
  const readmes = await Promise.all(
    ['core', 'cli', 'create-bunway'].map((name) =>
      Bun.file(join(root, 'packages', name, 'README.md')).text(),
    ),
  )

  expect(readmes[0]).toContain('# @bunway/core')
  expect(readmes[1]).toContain('# @bunway/cli')
  expect(readmes[2]).toContain('# create-bunway')
  for (const readme of readmes) expect(readme).toContain('https://bunway.dev')
})

test('release authenticates before changing versions or publishing', async () => {
  const release = await Bun.file(join(root, 'scripts/release.ts')).text()
  const authentication = release.indexOf('await ensureNpmAuthentication()')
  const versionWrite = release.indexOf('manifest.version = version')

  expect(authentication).toBeGreaterThan(-1)
  expect(authentication).toBeLessThan(versionWrite)
  expect(release).toContain("await run(['npm', 'login', '--auth-type=web'])")
  expect(release).toContain('provide NPM_CONFIG_TOKEN in CI')
})

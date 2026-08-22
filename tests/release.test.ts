import { expect, test } from 'bun:test'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('release tests exclude the database-backed package smoke fixture', async () => {
  const bunfig = await Bun.file(join(root, 'bunfig.toml')).text()
  const release = await Bun.file(join(root, 'scripts/release.ts')).text()

  expect(bunfig).toContain('root = "tests"')
  expect(release).toContain("await run(['bun', 'run', 'test'])")
})

test('npm release leaves the independent GitHub Pages build to its workflow', async () => {
  const release = await Bun.file(join(root, 'scripts/release.ts')).text()
  const pages = await Bun.file(join(root, '.github/workflows/pages.yml')).text()

  expect(release).not.toContain("await run(['bun', 'run', 'docs:build'])")
  expect(release).toContain('Documentation is verified and deployed by the GitHub Pages workflow.')
  expect(pages).toContain('run: bun run docs:build')
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
  for (const readme of readmes) expect(readme).toContain('https://djrobby.github.io/bunway/')
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

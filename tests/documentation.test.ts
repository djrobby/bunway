import { expect, test } from 'bun:test'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('documentation targets the Bunway GitHub Pages project site', async () => {
  const config = await Bun.file(join(root, 'docusaurus.config.ts')).text()
  const workflow = await Bun.file(join(root, '.github/workflows/pages.yml')).text()

  expect(config).toContain("url: 'https://djrobby.github.io'")
  expect(config).toContain("baseUrl: '/bunway/'")
  expect(config).toContain('https://github.com/djrobby/bunway')
  expect(workflow).toContain('branches: [master]')
  expect(workflow).toContain('path: build')
  expect(workflow).toContain('actions/deploy-pages@v4')
})

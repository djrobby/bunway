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

test('showcase guide stays aligned with the maintained test application', async () => {
  const showcaseFiles = [
    'index.md',
    '01-create.md',
    '02-resource.md',
    '03-relationships-storage.md',
    '04-jobs-realtime.md',
    '05-auth.md',
    '06-audit-messaging.md',
    '07-test-deploy.md',
  ]
  const showcase = (
    await Promise.all(
      showcaseFiles.map((file) => Bun.file(join(root, 'docs/showcase', file)).text()),
    )
  ).join('\n')
  const testAppNavigation = await Bun.file(
    join(root, '..', 'bunway-test-app', 'web/src/lib/resources.ts'),
  ).text()

  expect(showcase).not.toMatch(/\bListings?\b/)
  for (const destination of [
    '/categories',
    '/products',
    '/users',
    '/tags',
    '/posts',
    '/comments',
    '/blog',
    '/realtime',
    '/examples/audit',
    '/examples/messaging',
  ]) {
    expect(showcase).toContain(destination)
    expect(testAppNavigation).toContain(destination)
  }
  expect(showcase).toContain("{ label: 'Realtime Showcase', href: '/realtime', icon: 'chat' }")
  expect(showcase).toContain('Jobs and Realtime do not imply a UI')
})

import { expect, test } from 'bun:test'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('documentation targets the Bunway GitHub Pages project site', async () => {
  const config = await Bun.file(join(root, 'docusaurus.config.ts')).text()
  const workflow = await Bun.file(join(root, '.github/workflows/pages.yml')).text()

  expect(config).toContain("url: 'https://djrobby.github.io'")
  expect(config).toContain("baseUrl: '/bunway/'")
  expect(config).toContain('https://github.com/djrobby/bunway')
  expect(config).toContain('return { cache: false }')
  expect(workflow).toContain('branches: [master]')
  expect(workflow).toContain('path: build')
  expect(workflow).toContain('actions/deploy-pages@v4')
})

test('request lifecycle sits between first app and project structure and covers the full path', async () => {
  const sidebar = await Bun.file(join(root, 'sidebars.ts')).text()
  const lifecycle = await Bun.file(join(root, 'docs/request-lifecycle.md')).text()
  const firstApp = await Bun.file(join(root, 'docs/first-app.md')).text()

  expect(sidebar).toContain('"first-app", "request-lifecycle", "project-structure"')
  for (const concept of [
    'SvelteKit/Vite :5173',
    'Elysia/Bun :3000',
    'Eden Treaty',
    'Elysia receives and validates',
    'Drizzle and Bun.SQL reach PostgreSQL',
    'The response becomes rendered UI',
    'Attachments',
    'Jobs',
    'Realtime',
    'Where to debug each failure',
  ]) expect(lifecycle).toContain(concept)
  expect(firstApp).toContain('./request-lifecycle.md')
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
  for (const completeFile of [
    'src/routes/blog.ts',
    'web/src/lib/components/comment-thread.svelte',
    'web/src/routes/blog/+page.svelte',
    'src/jobs/process-demo-file.ts',
    'src/realtime/showcase.ts',
    'src/routes/realtime.ts',
    'web/src/routes/realtime/+page.svelte',
    'src/routes/audit.ts',
    'web/src/routes/examples/audit/+page.svelte',
    'src/routes/messaging.ts',
    'web/src/routes/examples/messaging/+page.svelte',
    'src/db/seed.ts',
  ]) {
    expect(showcase).toContain(`\`${completeFile}\``)
  }
  expect(showcase).toContain("import { blogRoutes } from './blog'")
  expect(showcase).toContain("import { postTaggings } from '../db/schema/post-taggings'")
  expect(showcase).toContain("export { postTaggings } from './post-taggings'")
  expect(showcase).toContain('Do not substitute `postsToTags`')
  expect(showcase).not.toContain("$lib/date-time.svelte.js")
  expect(showcase).toContain("import { realtimeShowcaseRoutes } from './realtime'")
  expect(showcase).toContain("import { auditShowcaseRoutes } from './audit'")
  expect(showcase).toContain("import { messagingShowcaseRoutes } from './messaging'")
})

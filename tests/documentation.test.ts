import { expect, test } from 'bun:test'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('documentation targets the Bunway GitHub Pages project site', async () => {
  const config = await Bun.file(join(root, 'docusaurus.config.ts')).text()
  const workflow = await Bun.file(
    join(root, '.github/workflows/pages.yml'),
  ).text()

  expect(config).toContain("url: 'https://djrobby.github.io'")
  expect(config).toContain("baseUrl: '/bunway/'")
  expect(config).toContain('https://github.com/djrobby/bunway')
  expect(config).toContain('return { cache: false }')
  expect(config).toContain(
    "require.resolve('@easyops-cn/docusaurus-search-local')",
  )
  expect(config).toContain('indexDocs: true')
  expect(workflow).toContain('branches: [master]')
  expect(workflow).toContain('path: build')
  expect(workflow).toContain('actions/deploy-pages@v4')
})

test('request lifecycle sits between first app and project structure and covers the full path', async () => {
  const sidebar = await Bun.file(join(root, 'sidebars.ts')).text()
  const lifecycle = await Bun.file(
    join(root, 'docs/request-lifecycle.md'),
  ).text()
  const firstApp = await Bun.file(join(root, 'docs/first-app.md')).text()

  expect(sidebar.indexOf('first-app')).toBeLessThan(
    sidebar.indexOf('request-lifecycle'),
  )
  expect(sidebar.indexOf('request-lifecycle')).toBeLessThan(
    sidebar.indexOf('project-structure'),
  )
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
  ])
    expect(lifecycle).toContain(concept)
  expect(firstApp).toContain('./request-lifecycle.md')
})

test('file storage documents AWS S3 and Cloudflare R2 independently', async () => {
  const storage = await Bun.file(join(root, 'docs/storage.md')).text()
  expect(storage).toContain('## Amazon S3')
  expect(storage).toContain('Do not set `STORAGE_ENDPOINT` for AWS S3')
  expect(storage).toContain('## Cloudflare R2')
  expect(storage).toContain('YOUR_ACCOUNT_ID.r2.cloudflarestorage.com')
})

test('showcase guide stays aligned with the finished Showcase application', async () => {
  const showcaseFiles = [
    'index.md',
    '01-create.md',
    '02-resource.md',
    '03-relationships-storage.md',
    '04-jobs-realtime.md',
    '05-auth.md',
    '06-audit-messaging.md',
    '06-audit.md',
    '07-test-deploy.md',
  ]
  const showcase = (
    await Promise.all(
      showcaseFiles.map((file) =>
        Bun.file(join(root, 'docs/showcase', file)).text(),
      ),
    )
  ).join('\n')
  const testAppNavigation = await Bun.file(
    join(root, '..', 'bunway-test-app', 'web/src/lib/resources.ts'),
  ).text()

  expect(showcase).not.toMatch(/\bListings?\b/)
  expect(showcase).toContain('PostgreSQL (default)')
  expect(showcase).toContain('### MySQL')
  expect(showcase).toContain('### SQLite')
  expect(showcase).toContain('skip only those durable-queue checks')
  expect(showcase).not.toMatch(/PocketBase/i)
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
  expect(showcase).toContain(
    "{ label: 'Realtime Showcase', href: '/realtime', icon: 'chat' }",
  )
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
  expect(showcase).toContain(
    "import { postTaggings } from '../db/schema/post-taggings'",
  )
  expect(showcase).toContain("export { postTaggings } from './post-taggings'")
  expect(showcase).not.toContain(
    'Continuing a showcase created from the earlier tutorial?',
  )
  expect(showcase).not.toContain('PASTE_')
  expect(showcase).not.toContain('$lib/date-time.svelte.js')
  expect(showcase).toContain(
    "import { realtimeShowcaseRoutes } from './realtime'",
  )
  expect(showcase).toContain("import { auditShowcaseRoutes } from './audit'")
  expect(showcase).toContain(
    "import { messagingShowcaseRoutes } from './messaging'",
  )
  for (const endpoint of [
    'POST http://localhost:3000/categories',
    'POST http://localhost:3000/products',
    'POST http://localhost:3000/users',
    'POST http://localhost:3000/tags',
    'POST http://localhost:3000/posts',
    'POST http://localhost:3000/comments',
    'POST http://localhost:3000/api/auth/sign-up/email',
    'POST http://localhost:3000/examples/audit',
    'POST http://localhost:3000/examples/messaging/mail',
    'POST http://localhost:3000/examples/messaging/sms',
  ])
    expect(showcase).toContain(endpoint)
  expect(showcase).toContain('Parent comment (optional)')
  expect(showcase).toContain(
    'onreply={(parentId, body) => reply(post.id, parentId, body)}',
  )
  expect(showcase).toContain('title="Before:')
  expect(showcase).toContain('title="After:')
  for (const markerOnlyTitle of [
    'title="Before: route import"',
    'title="Before: imports"',
    'title="Before: navigation"',
  ])
    expect(showcase).not.toContain(markerOnlyTitle)
  for (const file of showcaseFiles) {
    const source = await Bun.file(join(root, 'docs/showcase', file)).text()
    if (source.includes('\ncurl ')) expect(source).toContain('curl.exe')
  }
  const sidebar = await Bun.file(join(root, 'sidebars.ts')).text()
  expect(sidebar.indexOf('showcase/audit-messaging')).toBeLessThan(
    sidebar.indexOf('showcase/jobs-realtime'),
  )
  expect(sidebar).toContain('showcase/audit')
})

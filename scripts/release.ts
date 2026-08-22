import { join } from 'node:path'

const version = Bun.argv[2]
const skipConfirmation = Bun.argv.includes('--yes')

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: bun run release <version> [--yes]')
  process.exit(1)
}

const root = join(import.meta.dir, '..')
const packages = [
  { directory: 'packages/core', access: 'public' },
  { directory: 'packages/cli', access: 'public' },
  { directory: 'packages/create-bunway' },
] as const

async function run(command: string[], cwd = root) {
  console.log(`\n> ${command.join(' ')}`)

  const child = Bun.spawn(command, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited

  if (exitCode !== 0) process.exit(exitCode)
}

function npmUser() {
  const result = Bun.spawnSync(['bun', 'pm', 'whoami'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  return result.exitCode === 0 ? result.stdout.toString().trim() : undefined
}

async function ensureNpmAuthentication() {
  let user = npmUser()
  if (user) {
    console.log(`Authenticated with npm as ${user}`)
    return
  }

  if (skipConfirmation) {
    console.error(
      'npm authentication is required. Run "npm login --auth-type=web" locally or provide NPM_CONFIG_TOKEN in CI.',
    )
    process.exit(1)
  }

  console.log('No valid npm login was found. Bunway must authenticate before preparing a release.')
  const answer = prompt('Open npm browser login now? [Y/n] ') || 'y'
  if (answer.toLowerCase().startsWith('n')) {
    console.error('Release cancelled. Run "npm login --auth-type=web" before trying again.')
    process.exit(1)
  }

  await run(['npm', 'login', '--auth-type=web'])
  user = npmUser()
  if (!user) {
    console.error('npm login did not produce valid registry credentials. Run "npm whoami" to diagnose it.')
    process.exit(1)
  }

  console.log(`Authenticated with npm as ${user}`)
  console.log('Publishing @bunway packages also requires permission to the "bunway" npm scope.')
}

await ensureNpmAuthentication()

for (const entry of packages) {
  const path = join(root, entry.directory, 'package.json')
  const manifest = await Bun.file(path).json()
  manifest.version = version
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

await run(['bun', 'install'])
await run(['bun', 'run', 'typecheck'])
await run(['bun', 'run', 'test'])

console.log('\nDocumentation is verified and deployed by the GitHub Pages workflow.')

for (const entry of packages) {
  await run(['bun', 'pm', 'pack', '--dry-run'], join(root, entry.directory))
}

if (!skipConfirmation) {
  const answer = prompt(`Publish Bunway ${version} to npm? Type "publish" to continue:`)
  if (answer !== 'publish') {
    console.log('Release cancelled before publishing.')
    process.exit(0)
  }
}

for (const entry of packages) {
  await run(
    ['bun', 'publish', ...('access' in entry ? ['--access', entry.access] : [])],
    join(root, entry.directory),
  )
}

console.log(`\nPublished Bunway ${version}`)

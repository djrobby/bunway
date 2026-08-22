export async function cliVersion() {
  const manifest = await Bun.file(new URL('../package.json', import.meta.url)).json()
  return manifest.version as string
}

export const developmentCommands = [
  ['bun', '--watch', 'src/app.ts'],
  ['bun', 'run', '--cwd', 'web', 'dev']
] as const

export function developmentNotice(port = Bun.env.PORT ?? '3000') {
  return `[bunway] API: http://localhost:${port}\n[bunway] UI: use the URL reported by Vite below (usually http://localhost:5173)\n[bunway] Environment variables are loaded at startup; restart bunway dev after changing .env`
}

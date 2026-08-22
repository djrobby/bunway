import type { Config } from '@docusaurus/types'
import type { Options, ThemeConfig } from '@docusaurus/preset-classic'

const config: Config = {
  title: 'Bunway',
  tagline: 'Rails-inspired productivity for Bun, Elysia, Drizzle, and SvelteKit',
  favicon: 'img/favicon.svg',
  url: 'https://djrobby.github.io',
  baseUrl: '/bunway/',
  onBrokenLinks: 'throw',
  plugins: [
    () => ({
      name: 'bunway-bun-webpack-config',
      configureWebpack() {
        // Webpack's V8-serialized filesystem cache is not portable to Bun's runtime.
        return { cache: false }
      },
    }),
  ],
  presets: [
    [
      'classic',
      {
        docs: { routeBasePath: '/', sidebarPath: './sidebars.ts', editUrl: undefined },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Options,
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Bunway',
      logo: { alt: 'Bunway', src: 'img/logo.svg' },
      items: [
        { to: '/', label: 'Docs', position: 'left' },
        { to: '/showcase', label: 'Showcase', position: 'left' },
        { href: 'https://github.com/djrobby/bunway', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Learn', items: [{ label: 'Getting started', to: '/getting-started' }, { label: 'Build the Showcase', to: '/showcase' }] },
        { title: 'Reference', items: [{ label: 'CLI', to: '/cli' }, { label: 'Configuration', to: '/configuration' }] },
        { title: 'Project', items: [{ label: 'Architecture', to: '/architecture' }, { label: 'Roadmap', to: '/roadmap' }] },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Bunway contributors.`,
    },
    colorMode: { respectPrefersColorScheme: true },
  } satisfies ThemeConfig,
}

export default config

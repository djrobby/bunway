import type * as PrismNamespace from 'prismjs'

export default function prismIncludeLanguages(Prism: typeof PrismNamespace): void {
  const markup = Prism.languages.markup

  if (!markup) return

  Prism.languages.svelte = Prism.languages.extend('markup', {})
  Prism.languages.insertBefore('svelte', 'tag', {
    expression: {
      pattern: /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/,
      greedy: true,
      inside: Prism.languages.typescript ?? Prism.languages.javascript,
    },
  })
}

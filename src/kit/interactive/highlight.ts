import type { HighlighterCore } from 'shiki/core'

/** Languages available to <CodeBlock lang="…">. */
export type CodeLang =
  | 'yaml'
  | 'dockerfile'
  | 'bash'
  | 'shell'
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'go'
  | 'ini'
  | 'toml'
  | 'hcl'
  | 'diff'
  | 'nginx'
  | 'sql'
  | 'properties'
  | 'log'
  | 'text'

/** One coloured run of a code line. `color` is a CSS value (a var(--shiki-token-…) the notebook re-pens per theme). */
export interface CodeToken {
  content: string
  color?: string
  italic?: boolean
  bold?: boolean
}

let highlighterPromise: Promise<HighlighterCore> | null = null

/**
 * One Shiki highlighter for the whole course, using the `css-variables` theme: tokens come back as
 * var(--shiki-token-keyword) etc., and tokens.css maps those onto the notebook's code pens (paper and chalk).
 */
function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }] = await Promise.all([import('shiki/core'), import('shiki/engine/javascript')])
      return createHighlighterCore({
        themes: [createCssVariablesTheme({ name: 'biljeznica', variablePrefix: '--shiki-', fontStyle: true })],
        langs: [
          import('@shikijs/langs/yaml'),
          import('@shikijs/langs/dockerfile'),
          import('@shikijs/langs/shellscript'),
          import('@shikijs/langs/json'),
          import('@shikijs/langs/javascript'),
          import('@shikijs/langs/typescript'),
          import('@shikijs/langs/python'),
          import('@shikijs/langs/go'),
          import('@shikijs/langs/ini'),
          import('@shikijs/langs/toml'),
          import('@shikijs/langs/hcl'),
          import('@shikijs/langs/diff'),
          import('@shikijs/langs/nginx'),
          import('@shikijs/langs/sql'),
          import('@shikijs/langs/properties'),
          import('@shikijs/langs/log'),
        ],
        engine: createJavaScriptRegexEngine(),
      })
    })()
  }
  return highlighterPromise
}

const LANG_ALIAS: Partial<Record<CodeLang, string>> = { bash: 'shellscript', shell: 'shellscript' }

const PUNCT = 'var(--shiki-token-punctuation)'
const STRING = 'var(--shiki-token-string)'
const STRING_EXPR = 'var(--shiki-token-string-expression)'

/**
 * Highlight `code` into lines of tokens (the CodeBlock renders them itself, so markers, line numbers and margin
 * notes are real elements). Small re-pens on top of the css-variables theme: a YAML/JSON `:` is punctuation, and a
 * quoted value is a string (plain YAML values stay graphite, see interactive.css).
 */
export async function tokenize(code: string, lang: CodeLang): Promise<CodeToken[][]> {
  if (lang === 'text') return code.split('\n').map((l) => [{ content: l }])
  const hl = await getHighlighter()
  const { tokens } = hl.codeToTokens(code, { lang: LANG_ALIAS[lang] ?? lang, theme: 'biljeznica' })
  const shell = lang === 'bash' || lang === 'shell'
  return tokens.map((line) =>
    line.map((t) => {
      let color = t.color
      const c = t.content.trim()
      if (c === ':' || c === ',' || c === '{' || c === '}' || c === '[' || c === ']') color = PUNCT
      else if (color === STRING_EXPR && /^["'].*["']$/.test(c)) color = STRING
      // shell: arguments stay graphite, only quoted strings are green
      else if (shell && color === STRING && !/^["'].*["']$/.test(c)) color = 'var(--shiki-foreground)'
      const fs = t.fontStyle ?? 0
      return { content: t.content, color, italic: (fs & 1) === 1 || undefined, bold: (fs & 2) === 2 || undefined }
    }),
  )
}

/** Parse "1,3-5" into a set of 1-based line numbers. */
export function parseLineSpec(spec: string | number[] | undefined): Set<number> {
  const out = new Set<number>()
  if (!spec) return out
  if (Array.isArray(spec)) {
    spec.forEach((n) => out.add(n))
    return out
  }
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((s) => parseInt(s.trim(), 10))
    if (Number.isNaN(a)) continue
    for (let i = a; i <= (Number.isNaN(b) || b === undefined ? a : b); i++) out.add(i)
  }
  return out
}

/** Contiguous runs of a line set, e.g. {2,3,4,7} → [[2,4],[7,7]] (for the pen brackets in the gutter). */
export function lineRuns(lines: Set<number>): [number, number][] {
  const sorted = [...lines].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const n of sorted) {
    const last = out[out.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else out.push([n, n])
  }
  return out
}

/** "5-7" → "5–7", "2,4" → "2, 4" (how a line reference is written in a margin note). */
export function lineLabel(spec: string): string {
  return spec
    .split(',')
    .map((p) => p.trim().replace(/\s*-\s*/, '–'))
    .join(', ')
}

/** Tiny YAML line tokenizer — enough for Kubernetes manifests in the prototype. */
export type TokKind = 'key' | 'val' | 'str' | 'num' | 'punc' | 'com' | 'ws'
export interface Tok {
  t: string
  k: TokKind
}

function value(v: string): Tok[] {
  if (!v) return []
  const hash = v.indexOf(' #')
  if (hash >= 0) return [...value(v.slice(0, hash)), { t: v.slice(hash), k: 'com' }]
  if (/^["'].*["']$/.test(v)) return [{ t: v, k: 'str' }]
  if (/^-?\d+(\.\d+)?$/.test(v)) return [{ t: v, k: 'num' }]
  return [{ t: v, k: 'val' }]
}

export function tokenizeYaml(line: string): Tok[] {
  const out: Tok[] = []
  const m = /^(\s*)(- )?(.*)$/.exec(line)
  if (!m) return [{ t: line, k: 'val' }]
  const [, ws, dash, rest] = m
  if (ws) out.push({ t: ws, k: 'ws' })
  if (dash) out.push({ t: dash, k: 'punc' })
  if (rest.startsWith('#')) return [...out, { t: rest, k: 'com' }]
  const kv = /^([\w.-]+)(:)(\s*)(.*)$/.exec(rest)
  if (kv) {
    out.push({ t: kv[1], k: 'key' }, { t: kv[2], k: 'punc' })
    if (kv[3]) out.push({ t: kv[3], k: 'ws' })
    out.push(...value(kv[4]))
    return out
  }
  return [...out, ...value(rest)]
}

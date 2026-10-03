/** Tiny YAML tokenizer — enough for Kubernetes manifests in lectures. */
export type Tok = { t: 'key' | 'str' | 'num' | 'punct' | 'com' | 'plain' | 'bool'; v: string }

export function tokenizeYaml(line: string): Tok[] {
  const out: Tok[] = []
  const m = /^(\s*)(.*)$/.exec(line)
  const indent = m?.[1] ?? ''
  let rest = m?.[2] ?? ''
  if (indent) out.push({ t: 'plain', v: indent })
  if (rest.startsWith('#')) return [...out, { t: 'com', v: rest }]
  if (rest.startsWith('- ')) {
    out.push({ t: 'punct', v: '- ' })
    rest = rest.slice(2)
  }
  const kv = /^([A-Za-z0-9_.\-/]+)(:)(\s*)(.*)$/.exec(rest)
  if (kv) {
    out.push({ t: 'key', v: kv[1] }, { t: 'punct', v: kv[2] })
    if (kv[3]) out.push({ t: 'plain', v: kv[3] })
    if (kv[4]) out.push(valueTok(kv[4]))
    return out
  }
  if (rest) out.push(valueTok(rest))
  return out
}

function valueTok(v: string): Tok {
  if (/^-?\d+(\.\d+)?$/.test(v)) return { t: 'num', v }
  if (/^(true|false|null)$/.test(v)) return { t: 'bool', v }
  return { t: 'str', v }
}

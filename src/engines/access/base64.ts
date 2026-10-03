/**
 * UTF-8 safe base64 encode/decode without Buffer/btoa, so the „Dekodiraj” scene works the same in
 * Node tests and in the browser. base64 is an encoding, not encryption: decoding needs no key.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (b0 << 16) | (b1 << 8) | b2
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}

/** Decodes standard base64 (whitespace ignored). Returns null for invalid input. */
export function fromBase64(b64: string): string | null {
  const clean = b64.replace(/\s+/g, '')
  if (clean.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(clean) || /=[^=]/.test(clean)) return null
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (clean[i + k] === '=' ? -1 : ALPHABET.indexOf(clean[i + k])))
    if (c[0] < 0 || c[1] < 0) return null
    const n = (c[0] << 18) | (c[1] << 12) | ((c[2] < 0 ? 0 : c[2]) << 6) | (c[3] < 0 ? 0 : c[3])
    bytes.push((n >> 16) & 255)
    if (c[2] >= 0) bytes.push((n >> 8) & 255)
    if (c[3] >= 0) bytes.push(n & 255)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

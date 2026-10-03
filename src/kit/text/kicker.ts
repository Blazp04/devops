import type { PropKind } from '../doodles/types'

/**
 * Which doodled prop sits next to a section heading, guessed from the kicker (the bible's "one heading system":
 * only the prop changes with the kind of section). First matching rule wins; authors can override with `prop`.
 *   clock = story / problem · bolt = try it, break it · helm = Kubernetes · flip = step by step / concept ·
 *   boxes = code · question = check · index = glossary · queue = message queue · box = container ·
 *   git = Git / CI · lock = secrets / access · loop = Argo CD / GitOps.
 */
const RULES: [RegExp, PropKind][] = [
  [/pojmovnik|rjecnik|kazalo/, 'index'],
  [/provjer|kviz|test|sazetak|zablud|\bmit|pitanj|ponovi|kraj|zapamti/, 'question'],
  [/\bkod\b|yaml|konfigur|manifest|naredb|terminal|kubectl|dockerfile/, 'boxes'],
  [/simulac|isprobaj|pokvari|eksperiment|interakt|izazov|igra|vi ste|rukama/, 'bolt'],
  [/prica|problem|incident|uvod|podne|scena|dogodilo/, 'clock'],
  [/red(ovi)? poruk|queue|kafka|rabbit|poruk/, 'queue'],
  [/docker|kontejner|slika|image|container|registr/, 'box'],
  [/\bgit\b|\bci\b|ci\/cd|pipeline|cjevovod|build|isporuk|izdanj/, 'git'],
  [/tajn|secret|sigurn|pristup|rbac|lozink|ovlast/, 'lock'],
  [/argo|gitops|uskla|petlj|sync|drift/, 'loop'],
  [/kubernetes|k8s|klaster|\bpod|deployment|service|cvor|control plane|scheduler/, 'helm'],
  [/koncept|korak|ideja|kako radi|objasn|vizualiz/, 'flip'],
]

/** Lowercase, without diacritics (č ć đ š ž → c c d s z), for matching kickers. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** The section prop for a kicker ("Problem" → clock, "Kod" → boxes, "Provjera" → question …); default: flip-book. */
export function propForKicker(kicker?: string): PropKind {
  if (!kicker) return 'flip'
  const k = fold(kicker)
  for (const [re, kind] of RULES) if (re.test(k)) return kind
  return 'flip'
}

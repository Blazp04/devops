import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 23 (tajne u GitOpsu). Course-wide entries with the same id take precedence. */
const glossary: GlossaryEntry[] = [
  {
    id: 'secret-rotation',
    term: 'Secret rotation',
    hr: 'rotacija tajne',
    definition: 'Zamjena vrijednosti tajne novom i opoziv stare, tako da procurjela vrijednost više ništa ne otvara. Brisanje commita, ponovno šifriranje i novi ključ za pečaćenje nisu rotacija.',
    menza: 'novi ključ za ostavu, a stari više ne otključava',
  },
  {
    id: 'secret-store',
    term: 'Secret store',
    hr: 'trezor (upravitelj tajni)',
    definition: 'Vanjska usluga koja čuva tajne i njihove verzije, a može bilježiti i svako čitanje (zapis revizije): Vault, OpenBao ili upravitelj tajni u oblaku. U Gitu je tada samo adresa vrijednosti.',
  },
  {
    id: 'sops',
    term: 'SOPS',
    hr: 'SOPS',
    definition: 'Alat koji u YAML-u ili JSON-u šifrira vrijednosti, a nazive polja ostavlja čitljivima (age, PGP ili KMS u oblaku). Flux ga dešifrira sam, a Argo CD samo uz dodatak.',
  },
  {
    id: 'secrets-store-csi-driver',
    term: 'Secrets Store CSI Driver',
    hr: 'Secrets Store CSI Driver',
    definition: 'Driver koji pri pokretanju Poda dohvati tajnu iz trezora i montira je kao datoteku u tmpfs, po želji i kao Secret. Ako trezor ne radi, novi Podovi ne mogu krenuti.',
  },
]

export default glossary

import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 21 (CI/CD) that the course glossary does not have. Course entries win on id conflicts. */
const glossary: GlossaryEntry[] = [
  {
    id: 'oidc-token',
    term: 'OIDC token',
    hr: 'OIDC token (kratkotrajni token)',
    definition:
      'Kratkotrajni potpisani token koji GitHub (ili GitLab) izda poslu u CI-ju i u kojem piše tko je posao (repozitorij, grana, okruženje). Oblak ga provjeri prema pravilima povjerenja i zamijeni za kratkotrajne vjerodajnice (u AWS-u zadano 1 h). Ništa se ne sprema, pa nitko ništa ne rotira.',
    lecture: '21',
    menza: 'bon koji vrijedi samo danas',
  },
  {
    id: 'image-promotion',
    term: 'Image promotion',
    hr: 'promocija slike',
    definition: 'Ista slika, s istim digestom, prelazi iz okruženja u okruženje (staging → produkcija) bez ponovne izgradnje. Ono što je testirano upravo je ono što se pokreće.',
    lecture: '21',
    menza: 'isti pladanj s pulta na stol',
  },
  {
    id: 'flaky-test',
    term: 'Flaky test',
    hr: 'nestabilan test',
    definition: 'Test koji ponekad prođe, a ponekad padne bez ikakve promjene koda (ovisi o satu, mreži ili redoslijedu). Tim mu prestane vjerovati, a s njim i crvenom pipelineu.',
    lecture: '21',
  },
  {
    id: 'dora-metrics',
    term: 'DORA metrics',
    hr: 'DORA metrike',
    definition: 'Mjere isporuke softvera istraživačkog programa DORA. Klasične su četiri: učestalost postavljanja, vrijeme od commita do produkcije, stopa neuspjelih promjena i vrijeme oporavka od neuspjelog postavljanja; od 2024. dodana je i stopa ponovljenih postavljanja.',
    lecture: '21',
  },
]

export default glossary

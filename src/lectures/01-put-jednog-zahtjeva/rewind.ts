/**
 * Stops of the course trailer (sims/CourseRewind.tsx): the Klopa map rewound from lecture 24 back to where lecture 01
 * starts — Lana's laptop on localhost:8000 (the end of lecture 01 is the StoryMap in the deploy section).
 * Text parts in `{ code }` are rendered in code font.
 */
export type RewindPart = string | { code: string }

export interface RewindStop {
  /** StoryMap `at` (the architecture at the end of that lecture), or 'start' = Lana's laptop before lecture 01 */
  at: string
  title: string
  text: RewindPart[]
  caption: string
}

export const REWIND: RewindStop[] = [
  {
    at: '24',
    title: 'Kraj tečaja (predavanje 24)',
    text: [
      'Studenti upisuju ',
      { code: 'klopa.example' },
      ' i kroz Gateway stižu do jedne od kopija aplikacije na tri čvora klastera. Lanina izmjena iz Gita sama stiže do klastera, preko CI-ja i Argo CD-a. Ništa od toga još ne trebate razumjeti – premotajmo unatrag. Gdje se što uvodi: Deployment (13), Service (14), Gateway (15), ConfigMap i Secret (16), HPA (18), CI i registry (21), Argo CD (22).',
    ],
    caption: 'Klopa na kraju tečaja – svaki dio dodaje jedno od predavanja.',
  },
  {
    at: '19',
    title: 'Bez isporuke (predavanja 20–24)',
    text: ['Maknimo put od Lanina commita do klastera: CI, registry, Argo CD i trezor tajni. Nove verzije tada bi netko morao ručno slati u klaster.'],
    caption: 'Klopa prije modula o isporuci softvera.',
  },
  {
    at: '15',
    title: 'Bez pogona (predavanja 16–19)',
    text: ['Maknimo konfiguraciju i tajne, automatsko skaliranje i trajne podatke. Ostaje klaster s Podovima, Deploymentom, Serviceom i Gatewayem.'],
    caption: 'Klopa prije modula „Kubernetes u pogonu”.',
  },
  {
    at: '09',
    title: 'Bez Kubernetesa (predavanja 10–15)',
    text: ['Bez klastera Klopa radi u kontejnerima na tri poslužitelja iza load balancera, opisana datotekom ', { code: 'compose.yaml' }, '.'],
    caption: 'Klopa prije Kubernetesa: kontejneri, ali bez klastera.',
  },
  {
    at: '06',
    title: 'Bez kontejnera (predavanja 07–09)',
    text: ['Prije kontejnera: tri poslužitelja iza load balancera, provjere ispravnosti, baza, Redis i red poruka – sve što dodaju predavanja 02–06.'],
    caption: 'Klopa prije kontejnera.',
  },
  {
    at: 'start',
    title: 'Početak (danas)',
    text: [
      'Prije svega toga postoji samo Lanin laptop: Klopa radi na adresi ',
      { code: 'localhost:8000' },
      ' – i nigdje drugdje. Do kraja ovog predavanja preselit ćemo je na pravi poslužitelj, s imenom koje radi za svakoga.',
    ],
    caption: 'Ovdje počinjemo: jedan laptop i jedan zahtjev.',
  },
]

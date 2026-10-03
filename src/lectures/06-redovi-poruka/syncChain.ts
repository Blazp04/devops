/** Steps and geometry of the „Sinkroni lanac” flip-book (scene 1). */
import type { Box, Pt } from './geometry'

export const SYNC_STEPS = [
  {
    title: 'Jedan zahtjev, tri posla',
    body: 'Studenti pritisnu „Naruči”. Radnik API-ja ① spremi narudžbu u Postgres, ② upiše listić za kuhinju i ③ pozove SMS-gateway – tek tada odgovori 200. Cijelo to vrijeme jedan od četiri radnika API-ja zauzet je samo tom narudžbom.',
  },
  {
    title: 'SMS-gateway kasni',
    body: 'U 12:00 SMS-gateway odgovara 3\u00a0s umjesto odmah. Narudžba je spremljena i listić upisan, ali preglednik i dalje čeka odgovor – a radnik API-ja stoji i čeka SMS.',
  },
  {
    title: 'Četiri radnika, svi čekaju',
    body: 'Svaki zahtjev sad drži radnika oko 4\u00a0s, pa četiri radnika stignu tek jednu narudžbu u sekundi. Stižu dvije: svaka narudžba koja zatekne sve radnike zauzete dobiva 503. U simulaciji (scenarij „Spori SMS-gateway (bez reda)”, seed 42, 120\u00a0s) izgubi se 142 od 244 narudžbe.',
  },
  {
    title: 'Odgovor odmah: 202 i broj narudžbe',
    body: 'API samo spremi narudžbu, stavi poruku „skuhaj narudžbu 42” u red i odmah odgovori 202 Accepted s brojem narudžbe. Listić i SMS obavlja potrošač kad dođe na red. Nitko više ne čeka SMS-gateway, iako je i dalje spor: SMS stigne kasnije, kad potrošač obavi posao.',
  },
]

export interface SyncGeo {
  layout: 'wide' | 'narrow'
  W: number
  H: number
  student: { x: number; y: number; s: number; label: Pt }
  clock: Pt
  api: Box
  workers: Box
  rejected: Pt[]
  stamp: Pt
  rail: Box
  consumer: Box
  railToConsumer: Pt[]
  postgres: Box
  kitchen: Box
  sms: Box
  /** ① ② ③ next to the three calls */
  badges: Pt[]
  answer: [Pt, Pt]
  /** where the answer's text sits (start anchor) */
  answerLabel: Pt
  /** step 4: API → the tail of the rail */
  apiToRail: Pt[]
}

export const SYNC_GEO: { wide: SyncGeo; narrow: SyncGeo } = {
  wide: {
    layout: 'wide',
    W: 700,
    H: 300,
    student: { x: 4, y: 100, s: 0.78, label: [36, 222] },
    clock: [40, 56],
    api: { x: 150, y: 118, w: 130, h: 62 },
    workers: { x: 150, y: 190, w: 130, h: 36 },
    rejected: [
      [118, 258],
      [150, 272],
    ],
    stamp: [228, 272],
    rail: { x: 312, y: 168, w: 120, h: 50 },
    consumer: { x: 312, y: 238, w: 134, h: 50 },
    railToConsumer: [
      [440, 210],
      [446, 236],
    ],
    postgres: { x: 566, y: 14, w: 74, h: 66 },
    kitchen: { x: 540, y: 112, w: 130, h: 64 },
    sms: { x: 540, y: 206, w: 130, h: 70 },
    badges: [
      [470, 66],
      [470, 128],
      [470, 238],
    ],
    answer: [
      [146, 150],
      [80, 150],
    ],
    answerLabel: [84, 140],
    apiToRail: [
      [282, 160],
      [308, 186],
    ],
  },
  narrow: {
    layout: 'narrow',
    W: 330,
    H: 372,
    student: { x: 0, y: 4, s: 0.62, label: [34, 96] },
    clock: [94, 30],
    api: { x: 6, y: 118, w: 142, h: 62 },
    workers: { x: 6, y: 188, w: 142, h: 34 },
    rejected: [
      [36, 262],
      [76, 272],
    ],
    stamp: [120, 300],
    rail: { x: 6, y: 220, w: 142, h: 50 },
    consumer: { x: 6, y: 304, w: 142, h: 50 },
    railToConsumer: [
      [126, 272],
      [126, 300],
    ],
    postgres: { x: 226, y: 46, w: 72, h: 64 },
    kitchen: { x: 196, y: 150, w: 130, h: 60 },
    sms: { x: 196, y: 254, w: 130, h: 70 },
    badges: [
      [190, 92],
      [170, 192],
      [160, 266],
    ],
    answer: [
      [64, 114],
      [64, 84],
    ],
    answerLabel: [70, 106],
    apiToRail: [
      [120, 182],
      [120, 214],
    ],
  },
}

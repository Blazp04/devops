import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 17 that the course glossary does not have yet. Course-wide entries with the same id
 * take precedence (resource-requests, resource-limits, oomkilled, scheduler, pending live in src/curriculum/data.ts).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'allocatable',
    term: 'Allocatable',
    hr: 'raspoloživo za Podove (allocatable)',
    definition:
      'Dio čvora koji raspoređivač smije podijeliti Podovima: kapacitet stroja minus ono što rezerviraju operacijski sustav i kubelet, minus pričuva za izbacivanje (100Mi). Za 2 vCPU i 4 GiB na GKE-u to je 1930m i 2972Mi.',
    lecture: '17',
    menza: 'stolovi koje menza smije rezervirati',
  },
  {
    id: 'qos-class',
    term: 'QoS class',
    hr: 'QoS klasa',
    definition:
      'Razred Poda koji Kubernetes izračuna iz requests i limits: Guaranteed (requests = limits za CPU i memoriju u svakom kontejneru), BestEffort (nijedan kontejner nema ni requests ni limits) ili Burstable (sve ostalo). Određuje oom_score_adj; redoslijed izbacivanja kubelet računa iz requests, prioriteta i potrošnje, pa se s QoS klasom samo okvirno podudara.',
    lecture: '17',
  },
  {
    id: 'cpu-throttling',
    term: 'CPU throttling',
    hr: 'prigušivanje CPU-a',
    definition:
      'Što jezgra operacijskog sustava radi kontejneru koji je potrošio svoj CPU limit u razdoblju od 100 ms: pauzira ga do sljedećeg razdoblja. Kontejner ostaje živ, ali odgovara sporije.',
    lecture: '17',
    menza: 'čeka sljedeći krug za šalterom',
  },
  {
    id: 'node-pressure-eviction',
    term: 'Node-pressure eviction',
    hr: 'izbacivanje zbog pritiska na čvoru',
    definition:
      'Kad čvoru ponestaje memorije (memory.available < 100Mi), kubelet gasi Podove jedan po jedan: prvo one koji troše više nego što su rezervirali; među njima prvo one nižeg prioriteta, a pri istom prioritetu one koji rezervaciju premašuju najviše. Izbačeni Pod dobiva stanje Failed (Evicted).',
    lecture: '17',
  },
]

export default glossary

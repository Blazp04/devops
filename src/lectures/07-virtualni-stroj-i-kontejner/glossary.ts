import type { GlossaryEntry } from '../../curriculum/types'

/** Extra terms introduced in lecture 07 (course-wide entries with the same id take precedence). */
const glossary: GlossaryEntry[] = [
  {
    id: 'hypervisor',
    term: 'Hypervisor',
    hr: 'hipervizor',
    definition:
      'Program koji procesor, memoriju i uređaje jednog fizičkog računala dijeli među virtualnim strojevima i drži ih odvojenima, npr. KVM, Hyper-V ili Apple Virtualization framework. Napadaču nudi puno manju površinu za napad od jezgre koju dijele kontejneri.',
    lecture: '07',
    menza: 'zidovi između kuća',
  },
  {
    id: 'host',
    term: 'Host / guest',
    hr: 'domaćin / gost',
    definition: 'Domaćin je računalo (fizičko ili virtualno) na kojem rade virtualni strojevi ili kontejneri. Gost je virtualni stroj koji radi na domaćinu, s vlastitim operacijskim sustavom (OS gosta).',
    lecture: '07',
  },
  {
    id: 'oom-killer',
    term: 'OOM killer',
    hr: 'OOM killer',
    definition:
      'Dio jezgre koji, kad ponestane memorije, odabere proces s najviše bodova (uglavnom onaj koji troši najviše memorije) i ubije ga. Bez ograničenja to može biti susjed, a ne krivac; s memory.max jezgra ubija samo proces iz te kontrolne grupe.',
    lecture: '07',
  },
  {
    id: 'user-namespace',
    term: 'User namespace',
    hr: 'korisnički imenski prostor',
    definition:
      'Imenski prostor koji korisnika root u kontejneru preslikava u neprivilegiranog korisnika na domaćinu. Smanjuje štetu nakon bijega iz kontejnera, ali ne zaustavlja napad na zajedničku jezgru.',
    lecture: '07',
  },
  {
    id: 'cpu-architecture',
    term: 'CPU architecture (amd64, arm64)',
    hr: 'arhitektura procesora',
    definition:
      'Skup strojnih naredbi koje procesor razumije. Program preveden za amd64 (Intel, AMD) ne radi izravno na arm64 (Apple silicon, mnogi poslužitelji u oblaku) i obrnuto, pa slike kontejnera postoje u inačici za svaku arhitekturu.',
    lecture: '07',
  },
]

export default glossary

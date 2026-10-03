import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 08 (Docker) that the course glossary does not have. Course entries win on id conflicts. */
const glossary: GlossaryEntry[] = [
  {
    id: 'dockerfile',
    term: 'Dockerfile',
    hr: 'Dockerfile',
    definition: 'Tekstna datoteka s naredbama (FROM, COPY, RUN, CMD…) koje redom opisuju kako se gradi slika kontejnera. Svaka naredba koja mijenja datoteke dodaje jedan sloj.',
    lecture: '08',
    menza: 'recept',
  },
  {
    id: 'image-layer',
    term: 'Image layer',
    hr: 'sloj slike',
    definition: 'Nepromjenjiv skup promjena datoteka koje je dodala jedna naredba Dockerfilea. Slika je hrpa slojeva; kontejner ih vidi spojene u jedan datotečni sustav.',
    lecture: '08',
    menza: 'pladanj u hrpi',
  },
  {
    id: 'build-cache',
    term: 'Build cache',
    hr: 'predmemorija izgradnje',
    definition: 'Spremljeni rezultati ranijih koraka izgradnje. Korak se uzima iz predmemorije (CACHED) samo ako su njegova naredba i ulazne datoteke iste i ako su svi koraci ispod njega također iz predmemorije.',
    lecture: '08',
  },
  {
    id: 'build-context',
    term: 'Build context',
    hr: 'kontekst izgradnje',
    definition: 'Datoteke koje docker build šalje graditelju (obično cijela mapa projekta, bez onoga što navodi .dockerignore). Samo iz konteksta COPY može kopirati.',
    lecture: '08',
  },
  {
    id: 'dockerignore',
    term: '.dockerignore',
    hr: '.dockerignore',
    definition: 'Popis datoteka i mapa koje se ne šalju u kontekst izgradnje, npr. node_modules/, .git/ i .env. Izgradnja je brža, a tajne ne mogu završiti u slici.',
    lecture: '08',
  },
  {
    id: 'multi-stage-build',
    term: 'Multi-stage build',
    hr: 'višefazna izgradnja',
    definition: 'Dockerfile s više naredbi FROM: u prvoj fazi gradimo aplikaciju sa svim alatima, a u konačnu sliku naredbom COPY --from prenosimo samo gotov rezultat.',
    lecture: '08',
  },
  {
    id: 'writable-layer',
    term: 'Writable layer',
    hr: 'zapisivi sloj',
    definition: 'Tanki sloj koji svaki kontejner dobiva povrh slojeva slike. Sve što kontejner zapiše ide u njega, a briše se zajedno s kontejnerom (docker rm).',
    lecture: '08',
  },
  {
    id: 'port-mapping',
    term: 'Port mapping (publish)',
    hr: 'preslikavanje porta',
    definition: 'Opcija docker run -p 8080:8000 otvara port 8080 na domaćinu i promet s njega šalje na port 8000 u kontejneru. EXPOSE u Dockerfileu to ne radi. Bez adrese port je otvoren na svim mrežnim sučeljima domaćina; -p 127.0.0.1:8080:8000 otvara ga samo za vlastito računalo.',
    lecture: '08',
    menza: 'vrata u zidu',
  },
  {
    id: 'oci',
    term: 'OCI (Open Container Initiative)',
    hr: 'OCI',
    definition: 'Otvoreni standardi za format slike, pokretanje kontejnera i registre. Zato sliku izgrađenu Dockerom pokreću i containerd, CRI-O i Podman.',
    lecture: '08',
  },
  {
    id: 'buildkit',
    term: 'BuildKit',
    hr: 'BuildKit',
    definition: 'Graditelj slika koji Docker koristi zadano: izgrađuje neovisne faze usporedno, vodi predmemoriju izgradnje i zna predati tajnu jednoj naredbi RUN, a da je ne zapiše u sloj.',
    lecture: '08',
  },
]

export default glossary

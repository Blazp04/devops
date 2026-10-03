import {
  Analogy,
  Callout,
  CodeBlock,
  CostNote,
  DeepDive,
  DoodleIcon,
  IncidentCard,
  KeyIdea,
  MarginNote,
  Mark,
  Meter,
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  Section,
  StoryMap,
  Tabs,
  Term,
} from '../../kit'
import { MYTHS, NEXT_STEPS, QUIZ, RECAP } from './content'
import { BreakHop } from './sims/BreakHop'
import { CommitJourney } from './sims/CommitJourney'
import { CourseGraph } from './sims/CourseGraph'
import { Handbook } from './sims/Handbook'
import { IncidentSim } from './sims/IncidentSim'
import { PowersOfTen } from './sims/PowersOfTen'
import { RepoTree } from './sims/RepoTree'
import { RequestJourney } from './sims/RequestJourney'
import { ThreeSignals } from './sims/ThreeSignals'
import applicationYaml from './code/application.yaml?raw'
import ciYaml from './code/ci.yaml?raw'
import cheatSheet from './code/salabahter.sh?raw'
import css from './styles.module.css'

const KCNA = [
  { label: 'Kubernetes Fundamentals', value: 0.44 },
  { label: 'Container Orchestration', value: 0.28 },
  { label: 'Cloud Native Application Delivery', value: 0.16 },
  { label: 'Cloud Native Architecture', value: 0.12 },
]

export default function Lecture() {
  return (
    <>
      <Section id="incident" kicker="priča" title="Petak, 11:55: ispravak mora stići prije ručka" lead="Zadnje predavanje: cijela Klopa u jednom prolazu, od Lanine tipkovnice do kuhinje tete Mire.">
        <IncidentCard
          no={24}
          when="petak, 11:55"
          title="Popust za Ćevap-petak krivo se obračunava, a ručak počinje u 12:00"
          who="lana"
          says={['Ispravak je', 'već na putu!']}
          preset="dan-izdanja"
          seed={42}
          metrics={[
            { label: 'PR s ispravkom', value: '11:48', tone: 'neutral' },
            { label: 'pipeline u 11:55', value: 'E2E', tone: 'warn' },
            { label: 'do ručka', value: '5 min', tone: 'bad' },
          ]}
        >
          Nova košarica <code>2.0.1</code> radi od jutra, ali popust za Ćevap-petak krivo se obračunava. Lana je u 11:48 otvorila pull request s ispravkom <code>2.0.2</code>. Sada je 11:55, a ispravak je tek na testovima u stagingu.
        </IncidentCard>
        <p>
          Svi su dijelovi na mjestu: slike, klaster, pipeline, Git i tajne. Davor je na Erasmusu, pa dežura Lana. Iva i Petra gledaju na sat. Nitko više ne upisuje naredbe u produkciju – sve ide kroz Git.
        </p>
        <p>
          Danas pratimo <Mark c="yellow">jedan commit od Lanine tipkovnice do produkcije i jedan studentski zahtjev od mobitela do kuhinje</Mark>. Na svakoj postaji pitamo isto: što ako ovdje pukne – i po čemu bismo to primijetili?
        </p>
        <StoryMap at="24" caption="Cijela Klopa na kraju tečaja: što je dodalo svako predavanje, i observability povrh svega." />
        <Predict
          question="Hoće li ispravak 2.0.2 biti u produkciji prije 12:00?"
          options={['Ne: Argo CD provjerava Git tek svake tri minute', 'Da, s gotovo minutom viška', 'Ne: svaki čvor mora preuzeti cijelu sliku']}
          correct={1}
          explain="Bot zapiše novi digest u config repozitorij u 11:58:40, webhook javi Argo CD-u za sekundu, a kubelet preuzme samo jedan promijenjeni sloj (0,9 MB). Klopa je Synced i Healthy u 11:59:05."
          then="Provjerite to postaju po postaju."
        />
      </Section>

      <Section id="put-commita" kicker="korak po korak" title="Put jednog commita" lead="Od pull requesta do prometa na novim Podovima: svaka postaja je jedno predavanje.">
        <p>
          Povucimo klizač kroz dan izdanja. Gore su četiri mjesta na kojima commit boravi – CI, registar, Git s Argo CD-om i klaster – a crvenom olovkom zaokruženo je ono gdje je upravo sada. Ispod je ono što se događa, poveznica na predavanje i pitanje: što ako ovdje pukne?
        </p>
        <MarginNote>do 11:58 vrijeme mjeri CI, poslije Argo CD</MarginNote>
        <CommitJourney />
        <p className={css.small}>Vremena dolaze iz simulacije pipelinea (preset dan-izdanja, seed 42) i simulacije Gita s Argo CD-om iz 22. predavanja.</p>
        <p>
          Primijetite koliko je ljudi bilo potrebno nakon spajanja pull requesta: nijedan. CI gradi i testira, registar daje nepromjenjiv digest, bot ga zapisuje u Git, a Argo CD i Kubernetes rade ostalo – svaki svoju petlju usklađivanja.
        </p>
        <Callout kind="info" title="Zašto baš digest">
          Tag <code>2.0.2</code> netko može ponovno objaviti s drugim sadržajem. Digest <code>sha256:…</code> je sažetak manifesta slike, a manifest popisuje sažetke svih slojeva: isti digest uvijek znači istu sliku. Zato bot u config repozitorij piše oboje, a kad su zadani i tag i digest, čvor povlači po digestu.
        </Callout>
      </Section>

      <Section id="put-zahtjeva" kicker="koncept" title="Put jednog zahtjeva" lead="Od mobitela do kuhinje i SMS-a: devet slojeva, a student čeka samo prvih sedam – do objave u red.">
        <p>
          Sada pratimo drugi smjer: student u 12:01 naruči ćevape. Prođimo njegov zahtjev sloj po sloj. Desno raste <Term id="trag">trag</Term> (engl. <em>trace</em>): svaki sloj dodaje svoj vremenski raspon, pa se vidi gdje zahtjev provodi vrijeme.
        </p>
        <RequestJourney />
        <Callout kind="tip" title="Dvije vrste raspodjele u istom klasteru">
          Gateway bira Pod za svaki zahtjev, jer završava HTTP. Poziv unutar klastera preko ClusterIP-a (npr. <code>klopa-web</code> → <code>klopa-api</code>) ide kroz kube-proxy, koji nasumičan spreman Pod bira jednom po vezi.
        </Callout>
      </Section>

      <Section id="sto-ako-pukne" kicker="pokvarite" title="Što ako ovdje pukne?" lead="Za svaki sloj: mehanizam koji ga štiti, signal koji ga otkriva i predavanje koje ga objašnjava.">
        <p>Srušite bilo koji sloj na putu narudžbe. Na crtežu se pojavi ✗, a ispod mehanizam koji Klopu štiti – ili iskreno: da ga nema.</p>
        <BreakHop />
        <KeyIdea>
          Svaki sloj tečaja postoji zbog <strong>jednog konkretnog incidenta</strong>. A svaki simptom ima <strong>mehanizam</strong> koji ga obuzdava, <strong>signal</strong> koji ga otkriva i mjesto gdje ga tražiti.
        </KeyIdea>
      </Section>

      <Section id="tri-signala" kicker="koncept" title="Tri signala: metrike, logovi, tragovi" lead="Metrike kažu da nešto ne valja, tragovi gdje, a logovi zašto.">
        <p>
          Sposobnost da iz onoga što sustav ispisuje zaključimo što se u njemu događa zove se <Term id="observability">observability</Term> (uvid u stanje sustava). Čine je tri signala. <Term id="red-metrike">RED metrike</Term> po servisu (engl. <em>Rate, Errors, Duration</em>: broj zahtjeva, udio grešaka, trajanje) dovoljno su jeftine da ih gledamo stalno. Logovi su detaljni, ali ih je previše. Tragovi pokazuju put jednog zahtjeva.
        </p>
        <p>Pogledajmo snimku jednog ručka u kojem je rotirana lozinka baze. Krenimo od skoka na grafu, kao što bi to napravila dežurna osoba.</p>
        <ThreeSignals />
        <Callout kind="fact" title="Tko prikuplja signale">
          Prometheus metrike prikuplja povlačenjem (engl. <em>scrape</em>): u stalnom razmaku (zadano svake minute, u praksi često 15–30 s) pita svaki cilj koji izlaže <code>/metrics</code> – npr. Podove klopa-api – za njegove brojeve. OpenTelemetry je CNCF-ov standard za instrumentaciju tragova, metrika i logova; trace_id prenosi kroz zaglavlje <code>traceparent</code> (W3C Trace Context). (stanje: listopad 2026.)
        </Callout>
        <DeepDive title="Kako trace_id stigne do potrošača reda">
          <p>
            Gateway ili prva aplikacija stvori trace_id i upiše ga u zaglavlje <code>traceparent</code>. Svaki sljedeći poziv nosi to zaglavlje dalje. Kad API objavljuje poruku u RabbitMQ, isto zaglavlje upiše u svojstva poruke, pa potrošač nastavi isti trag – zato se i asinkroni dio narudžbe vidi na istoj vremenskoj crti.
          </p>
        </DeepDive>
      </Section>

      <Section id="dijagnostika" kicker="simulacija" title="Incident u 12:00" lead="Cijela Klopa, skriveni kvarovi i samo jedan dopušteni popravak: commit.">
        <p>
          U 11:59:05 ispravak je u produkciji. U 12:00 kreće ručak – i pager se opet javi. Simulacija spaja tri simulacije iz ranijih predavanja: Git s Argo CD-om (22.), klaster (12.–18.) i red poruka (06.). Kvarovi su skriveni, a simptomi su pravi: isti izlaz naredbe <code>kubectl</code>, isti statusi Argo CD-a i iste metrike kao u predavanjima iz kojih dolaze.
        </p>
        <p>
          Pravila dežurstva: najprije pogledajte signale i zapišite hipotezu (uzrok, signal i predavanje). Tek onda u config repozitoriju promijenite polje i spremite ga u Git – ili napravite <code>git revert</code> lošeg commita. Bodovi su neuspjeli zahtjevi puta pogođeni studenti, a <Term id="mttr">MTTR</Term> se mjeri od prve greške do oporavka.
        </p>
        <MarginNote tone="red">ručni kubectl: bez traga u Gitu!</MarginNote>
        <IncidentSim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          Simptom je rijetko na mjestu uzroka: 404 vraća klopa-web, a uzrok je jedan redak HTTPRoutea; 500 dolazi iz Poda, a uzrok je Secret pročitan pri pokretanju. Hipoteza vas tjera da prije popravka pogledate pravi signal. Commit ostavlja trag, a <code>git revert</code> ga vraća – ručnu promjenu polja iz Gita selfHeal poništi za nekoliko sekundi.
        </Callout>
        <DeepDive title="Kako je simulacija složena (i što pojednostavljuje)">
          <p>
            Config repozitorij, sinkronizaciju, zdravlje i selfHeal vodi simulacija Gita i Argo CD-a iz 22. predavanja. Podove klopa-api, provjere, uvođenje, Service, HPA i promet vodi simulacija klastera iz 12.–18. predavanja, a klopa-worker i red narudžbi simulacija reda iz 6. predavanja. Nakon svake sinkronizacije polja iz Gita prenose se u te dvije simulacije, a one javljaju stanje Podova natrag Argo CD-u. selfHeal vraća samo polja koja stoje u Gitu: <code>kubectl rollout restart</code> (anotacija koje u Gitu nema) zato ostaje.
          </p>
          <p>
            Vrijeme je skraćeno: rok napretka uvođenja je 60 s umjesto 600 s, a provjera spremnosti svake 2 s umjesto 10 s. Trajanje (p95) dolazi iz modela opterećenja procesorskih jezgri iz 18. predavanja. Trag je sastavljen iz ishoda svakog zahtjeva u simulaciji, a ne iz pravog OpenTelemetryja.
          </p>
        </DeepDive>
      </Section>

      <Section id="kod" kicker="kod" title="Cijeli config repozitorij i šalabahter" lead="Produkcijske datoteke koje simulacija koristi, Application, CI i šalabahter za dežurstvo.">
        <Tabs
          tabs={[
            {
              label: 'Config repozitorij',
              content: (
                <>
                  <p>Ovo su datoteke koje simulacija koristi, jedna po objektu (staging, RabbitMQ, Redis i ExternalSecret za bazu izostavljeni su radi kratkoće). Bilješke na margini označavaju retke u kojima se kriju današnji kvarovi.</p>
                  <RepoTree />
                </>
              ),
            },
            {
              label: 'Application',
              content: <CodeBlock title="argocd/klopa.yaml" code={applicationYaml} lang="yaml" notes={[{ lines: '13-14', text: 'cijeli direktorij apps, sa svim poddirektorijima' }, { lines: '19-21', text: 'prune i selfHeal: Git je jedini izvor istine' }]} />,
            },
            {
              label: 'CI workflow',
              content: (
                <CodeBlock
                  title=".github/workflows/ci.yaml"
                  code={ciYaml}
                  lang="yaml"
                  caption="Isti put kao gore: PR samo provjerava, a main gradi, šalje u registar, prolazi staging i E2E. CI ne dobiva ključ klastera: na kraju samo zapiše tag@digest u config repozitorij."
                  notes={[
                    { lines: '43', text: 'OIDC: kratkotrajni token umjesto trajnog ključa' },
                    { lines: '58-59', text: 'nepromijenjeni slojevi iz predmemorije' },
                    { lines: '119', text: 'automatska vrata: produkcija tek kad E2E prođe' },
                    { lines: '128-129', text: 'bot piše tag@digest u Git – to je cijelo „postavljanje”' },
                    { lines: '130-132', text: 'commit izravno na main: Argo CD ga vidi za sekundu (webhook)' },
                  ]}
                />
              ),
            },
            {
              label: 'Šalabahter',
              content: <CodeBlock title="salabahter.sh" code={cheatSheet} lang="bash" mode="open" caption="Redoslijed je važan: od onoga što radi prema onome što ne radi, pa tek onda popravak kroz Git." />,
            },
          ]}
        />
        <h3 className={css.subhead} id="prirucnik">
          Davorov dežurni priručnik
        </h3>
        <p>Davor je na Erasmusu, ali je ostavio ono što je naučio: simptom, vjerojatan uzrok i prvu naredbu. Preuzmite ga i ponesite sa sobom.</p>
        <Handbook />
      </Section>

      <Section id="zablude" kicker="zablude" title="Mit ili istina?" lead="Deset rečenica koje ćete čuti na hodniku – i što je zapravo istina.">
        <MythOrFact items={MYTHS.map((m) => ({ statement: m.statement, fact: false, explain: `${m.fact} ${m.explain}`.replace(/`/g, '') }))} />
        <Callout kind="fact" title="Datumi iza mitova">
          Dockershim je uklonjen u Kubernetesu 1.24. Kontroler Ingress NGINX umirovljen je 24. ožujka 2026. ZooKeeper je uklonjen u Kafki 4.0. Argo CD po zadanom provjerava Git svakih 120 s uz do 60 s odstupanja. (stanje: listopad 2026.)
        </Callout>
      </Section>

      <Section id="karta" kicker="kamo dalje" prop="index" title="Mapa tečaja i kamo dalje" lead="Zumirajmo od regije oblaka do jednog procesa, pa unatrag kroz cijeli tečaj.">
        <PowersOfTen />
        <Analogy title="Potencije desetke" breaksDown="Svaka razina skriva kvarove razina ispod sebe: na razini klastera „sve je Running”, a jedan proces u kontejneru vraća 500. Zum zato mora ići u oba smjera.">
          Isti sustav na šest razina zumiranja, kao u poznatom filmu o potencijama desetke: od regije do procesa, svaki korak jednu razinu bliže.
        </Analogy>
        <CourseGraph />
        <h3 className={css.subhead}>Sljedeći koraci</h3>
        <ul className={css.nextList}>
          {NEXT_STEPS.map((n) => (
            <li key={n.title}>
              <DoodleIcon kind={n.icon} />
              <span>
                <strong>{n.title}.</strong> {n.text.split(/(`[^`]+`)/).map((p, i) => (p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}
              </span>
            </li>
          ))}
        </ul>
        <Callout kind="fact" title="Koliko dugo vrijedi ovo znanje">
          Kubernetes izdaje tri manje verzije godišnje i održava tri najnovije: trenutačno 1.35, 1.36 i 1.37 (zadnja zakrpa 1.37.1). Svaka dobiva zakrpe oko 14 mjeseci; 1.37 do 28. listopada 2027. (stanje: listopad 2026.)
        </Callout>
        <p>KCNA, ulazni certifikat CNCF-a, ispituje četiri područja – i sva četiri ste u ovom tečaju već dotaknuli:</p>
        <div className={css.kcna}>
          {KCNA.map((k) => (
            <Meter key={k.label} label={k.label} value={k.value} valueLabel={`${Math.round(k.value * 100)} %`} tone="blue" thresholds={[2, 2]} />
          ))}
        </div>
        <p className={css.small}>Raspodjela pitanja na ispitu KCNA od studenoga 2025. (stanje: listopad 2026.)</p>
      </Section>

      <Section id="sazetak" kicker="sažetak" title="Što smo naučili" lead="Pet rečenica za ponijeti i šest pitanja za provjeru.">
        <Recap points={RECAP.map((r) => r.replace(/`/g, ''))} />
        <Quiz questions={QUIZ.map((q) => ({ ...q, q: q.q.replace(/`/g, ''), options: q.options.map((o) => o.replace(/`/g, '')), explain: q.explain.replace(/`/g, '') }))} />
      </Section>

      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Od commita do produkcije za 11 minuta, bez ijedne ručne naredbe.',
            'Za svaki kvar znamo mehanizam koji ga obuzdava i signal koji ga otkriva.',
            'Klaster je opisan u Gitu: svaki popravak je commit koji se može vratiti.',
          ]}
          paid={[
            'Tri signala traže alate (Prometheus, Grafana, OpenTelemetry) i nekoga tko ih čita.',
            'Sigurnost klastera – RBAC, NetworkPolicy, Pod Security – tek nas čeka.',
            'Davor više nije tu: znanje mora biti zapisano, u priručniku i u Gitu.',
          ]}
          next="Kraj tečaja. Kamo dalje: observability u dubini (Prometheus, OpenTelemetry), sigurnost klastera (RBAC, NetworkPolicy, Pod Security), Helm u dubini i KCNA – a Davorov dežurni priručnik možete preuzeti i ponijeti sa sobom."
          nextTo="/"
          nextLabel="natrag na kazalo tečaja →"
        />
      </Section>
    </>
  )
}

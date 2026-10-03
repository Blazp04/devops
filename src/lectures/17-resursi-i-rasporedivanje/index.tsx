import {
  Analogy,
  Callout,
  CodeBlock,
  Compare,
  CostNote,
  DeepDive,
  IncidentCard,
  KeyIdea,
  MarginNote,
  Mark,
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  Section,
  StoryMap,
  Tabs,
  Term,
  Terminal,
} from '../../kit'
import { INCIDENT_BATCH_CPU_M, INCIDENT_READ_AT_S, SEED, incidentSnapshot, qosRun } from './lib/model'
import { incidentTerminal } from './lib/terminal'
import { CfsLab } from './sims/CfsLab'
import { FilterScoreLab } from './sims/FilterScoreLab'
import { HookFigure } from './sims/HookFigure'
import { NodeSizes } from './sims/NodeSizes'
import { OomStepper } from './sims/OomStepper'
import { QosLab } from './sims/QosLab'
import { ReservationStepper } from './sims/ReservationStepper'
import { TetrisSim } from './sims/TetrisSim'
import { ThreeLayers } from './sims/ThreeLayers'
import styles from './styles.module.css'
import resourcesYaml from './code/resources.yaml?raw'
import resizeSh from './code/resize.sh?raw'
import stagingYaml from './code/staging-limits.yaml?raw'

// computed once from the engine: the incident card, the terminal sessions and the QoS numbers agree with the sims
const INCIDENT = incidentSnapshot()
const TERM = incidentTerminal()
const QOS = qosRun()
const pct = (v: number) => `${Math.round(v * 100)} %`
/** oom_score_adj in prose, with a real minus sign (−997) */
const fmtAdj = (v: number | undefined) => (v === undefined ? '' : v < 0 ? `\u2212${-v}` : String(v))

export default function Lecture() {
  const n = INCIDENT.numbers
  return (
    <>
      <Section id="incident" kicker="priča" title="Pending na 30 % procesora" lead="Testno okruženje preselilo se u isti klaster. Od tada produkcija ne dobiva mjesto, a grafovi tvrde da ga ima napretek.">
        <IncidentCard
          no={17}
          when="ponedjeljak, 11:52"
          title="Novi Pod čeka u Pendingu, a procesor radi na 30 %"
          who="davor"
          says={['Insufficient', 'cpu?! Pa radi', 'na 30 %!']}
          preset={`„Incident 17” u Tetrisu raspoređivača (svi Podovi osim big-db, batch troši ${INCIDENT_BATCH_CPU_M}m), očitano nakon ${INCIDENT_READ_AT_S} s`}
          seed={SEED}
          metrics={[
            { label: 'potrošnja (klaster)', value: pct(n.usedPct), tone: 'ok' },
            { label: 'rezervirano (node-2)', value: pct(INCIDENT.node2RequestedPct), tone: 'bad' },
            { label: 'Pending', value: `${n.pending} Pod`, tone: 'bad' },
            { label: 'slobodno zbirno', value: `${n.freeCpuM}m`, tone: 'warn' },
          ]}
        >
          Novi Pod traži <code>1500m</code> procesora i dobiva <code className={styles.wrapCode} style={{ whiteSpace: 'normal' }}>0/3 nodes are available: 3 Insufficient cpu</code>. Istodobno nadzor pokazuje da klaster troši tek 30 % procesora.
        </IncidentCard>
        <p>
          Od prošlog tjedna testno okruženje živi u istom klasteru, u Namespaceu <code>klopa-staging</code>. Klopin klaster ima tri različita čvora: node-1 (2 vCPU · 4 GiB), node-2 (4 vCPU · 16 GiB) i node-3 (2 vCPU · 8 GiB). Vikend je bio težak: novi potrošač iz reda poruka koji obrađuje fotografije jela nije imao ograničenje memorije i napuhao se na čvoru node-2, pa je kubelet s tog čvora izbacivao Podove – među njima i produkcijske API Podove. Davor je potrošača u ponedjeljak ujutro zaustavio. Čvor se smirio – ali kad je Lana pokrenula novi Pod, on je ostao u stanju <Term id="pending">Pending</Term>.
        </p>
        <p>
          Davor gleda dva ekrana koja se ne slažu. Na grafu procesor jedva radi. U <code>kubectl describe pod</code> piše da nijedan od tri čvora nema dovoljno procesora. Iva se javlja s drugog kraja sobe:
        </p>
        <HookFigure />
        <p>
          Ivini Podovi za test opterećenja čekaju sljedeći test i troše po 20m – ali svaki je pri pokretanju „rezervirao” cijelu procesorsku jezgru ili jednu i pol. Danas ćemo vidjeti kako <Term id="scheduler">raspoređivač</Term> odlučuje gdje ima mjesta, zašto mu graf potrošnje ništa ne znači – i tko kažnjava Pod koji uzme previše.
        </p>
      </Section>

      <Section id="predvidite" kicker="predvidite" title="30 % procesora, a Pending" lead="Prije nego što objasnimo kako raspoređivač radi – vaša prognoza.">
        <Predict
          question={
            <>
              Klaster troši {pct(n.usedPct)} procesora, a novi Pod od <code>1500m</code> čeka. Na node-2 stoji Ivin testni Pod <code>ivina-proba-1</code>: troši 20m procesora, a pri pokretanju je tražio 1500m. Davor ga obriše. Što će se dogoditi s novim Podom?
            </>
          }
          options={[
            'Ništa: Ivin Pod trošio je samo 20m, pa se oslobodilo samo 20m.',
            'Smjestit će se na node-2: oslobođeno je svih 1500m koje je Ivin Pod tražio.',
            'Smjestit će se tek kad potrošnja klastera padne ispod 20 %.',
            'Raspoređivač će ga podijeliti na node-1 i node-3, jer zajedno imaju dovoljno mjesta.',
          ]}
          correct={1}
          explain={
            <>
              Raspoređivač gleda rezervacije (<code>requests</code>), ne graf potrošnje. Prije brisanja nerezervirano je bilo 1080m na node-1, 70m na node-2 i 730m na node-3 – zbirno {n.freeCpuM}m, ali najveći komad tek {n.maxFreeOnNodeM}m. To je <Mark>fragmentacija</Mark>: mjesta ima, ali ne u jednom komadu, a Pod se ne može podijeliti na dva čvora. Brisanje Ivina Poda oslobađa cijelu njegovu rezervaciju: na node-2 sada je slobodno 70m + 1500m = 1570m, pa novi Pod stane – iako je potrošnja pala za samo 20m.
            </>
          }
          then="Provjeriti možete i u Tetrisu raspoređivača: preset „Incident 17”, pa „Obriši Ivine testne Podove”."
        />
        <p>Pogledajmo isti klaster kroz tri para očiju.</p>
        <ThreeLayers />
      </Section>

      <Section id="rezervacija" kicker="koncept" title="Rezervacija, ne apetit" lead="Svaki kontejner može reći dvije stvari: koliko mu treba sigurno i koliko smije najviše.">
        <MarginNote>requests ≠ HTTP zahtjev!</MarginNote>
        <p>
          U opisu kontejnera stoji blok <code>resources</code> s dva para brojeva. <Term id="resource-requests">
            <code>requests</code>
          </Term>{' '}
          je zajamčeni minimum: toliko procesora i memorije raspoređivač rezervira na čvoru prije nego što Pod uopće krene. <Term id="resource-limits">
            <code>limits</code>
          </Term>{' '}
          je gornja granica: više od toga kontejner ne smije uzeti, a to ne provodi raspoređivač, nego <Term id="kernel">jezgra operacijskog sustava</Term> na čvoru, preko kontrolnih grupa (<Term id="cgroup">cgroup</Term>).
        </p>
        <p>
          Procesor se mjeri u milijezgrama: <code>1000m</code> je jedna procesorska jezgra, <code>250m</code> četvrtina. Memorija se mjeri u <code>Mi</code> i <code>Gi</code> (mebibajti i gibibajti, potencije broja 1024).
        </p>
        <Analogy
          title="Rezervacija stola i kućni red"
          breaksDown={
            <>
              Dvije granice nemaju istu kaznu. Tko preko limita želi procesor, samo čeka sljedeći krug (usporava se). Tko preko limita uzme memoriju, biva izbačen (OOMKilled). U pravoj menzi obje bi kazne bile iste. I još: prazan rezervirani stol u Kubernetesu nije zaključan – dok ga ne koristite, kontejneri koji troše više od svojih <code>requests</code> smiju posuditi taj procesor, a čim vam zatreba, dobivate svoj dio natrag. Rezervacija jamči da isti stol neće rezervirati netko drugi.
            </>
          }
        >
          <code>requests</code> su rezervacija stola u menzi: dok stoji vaše ime, nitko drugi ga ne može rezervirati – čak i kad ne jedete. <code>limits</code> su kućni red: najviše toliko tanjura po osobi, ma koliko mjesta bilo slobodno.
        </Analogy>
        <ReservationStepper />
        <p>
          Raspoređivač nikad ne pita koliko Pod stvarno troši. Zbraja <code>requests</code> svih Podova na čvoru i uspoređuje zbroj s onim što čvor smije podijeliti – <Term id="allocatable">allocatable</Term>. Ivin testni Pod koji troši 20m, a rezervirao je 1000m, za njega je 1000m.
        </p>
        <KeyIdea>
          Raspoređivač smješta Podove prema <strong>rezervacijama (requests)</strong>, a jezgra operacijskog sustava kažnjava ih prema <strong>stvarnoj potrošnji iznad limits</strong>. To su dva različita svijeta: memorija se ne može stisnuti pa kontejner umire, a procesor se može pa kontejner čeka.
        </KeyIdea>
      </Section>

      <Section id="rasporedivac" kicker="korak po korak" title="Filtriranje, bodovanje, vezanje" lead="Raspoređivač za svaki novi Pod prolazi kroz tri koraka – i za svaki čvor zna reći zašto ne.">
        <p>Kad Pod nema čvor, raspoređivač ga uzima iz reda i radi tri stvari:</p>
        <ol>
          <li>
            <strong>Filtriranje:</strong> izbacuje čvorove koji ne dolaze u obzir – nisu spremni (Ready), imaju zabranu na čvoru (engl. <em>taint</em>) koju Pod ne tolerira, ne odgovaraju Podovu <code>nodeSelector</code>, već imaju 110 Podova ili im nerezervirani dio nije dovoljan za <code>requests</code> tog Poda.
          </li>
          <li>
            <strong>Bodovanje:</strong> svako pravilo daje preostalim čvorovima 0–100 bodova, a raspoređivač ih zbraja. Za resurse je zadano pravilo LeastAllocated: više bodova dobiva čvor kojemu ostaje više nerezerviranog mjesta. Drugo zadano pravilo raspršuje replike istog Deploymenta po čvorovima. Laboratorij ispod prikazuje samo LeastAllocated.
          </li>
          <li>
            <strong>Vezanje:</strong> preko API poslužitelja upisuje ime pobjedničkog čvora u Pod, a kubelet na tom čvoru pokreće kontejner.
          </li>
        </ol>
        <p>Odaberite Pod i pogledajte što raspoređivač vidi na čvorovima iz incidenta (Ivini testni Podovi već su ondje).</p>
        <FilterScoreLab />
        <DeepDive title="Kako točno nastaju bodovi">
          <p>
            Za CPU i memoriju posebno: <code>(allocatable − rezervirano nakon smještaja) × 100 / allocatable</code>, zaokruženo naniže; bod pravila LeastAllocated je prosjek dvaju brojeva. Pod bez <code>requests</code> pri bodovanju se računa kao <code>100m</code> i <code>200Mi</code>, da se takvi Podovi ne bi svi nagomilali na isti čvor – ali pri filtriranju i dalje ne rezervira ništa. Kad dva čvora imaju isti zbroj bodova, raspoređivač bira slučajno.
          </p>
          <p>
            Kad nijedan čvor ne prođe filtar, raspoređivač Podu upisuje događaj <code>FailedScheduling</code> s brojem čvorova po razlogu (npr. <code>2 Insufficient memory, 3 Insufficient cpu</code>) i proba ponovno kad se u klasteru nešto promijeni. Dio poruke <code>preemption:</code> kaže je li mogao istisnuti neki Pod nižeg prioriteta – u našem klasteru nije, jer svi Podovi imaju isti prioritet.
          </p>
        </DeepDive>
      </Section>

      <Section
        id="kazna"
        kicker="koncept"
        title="Procesor se usporava, memorija ubija"
        lead="Ista gornja granica, dvije sasvim različite posljedice – i tko odlazi kad memorije ponestane cijelom čvoru."
      >
        <p>Prođite sve tri kartice: kontejner prijeđe CPU limit, kontejner prijeđe memorijski limit, čvoru ponestane memorije.</p>
        <Tabs
          tabs={[
            {
              label: 'CPU iznad limita',
              content: (
                <>
                  <p>
                    Procesor je <em>stlačiv</em> resurs: ako kontejner želi više nego što smije, jezgra operacijskog sustava mu jednostavno ne da procesorskog vremena. CPU limit pretvara se u kvotu: <code>200m</code> znači 20 ms procesora u svakom razdoblju od 100 ms. Kad kontejner potroši kvotu, čeka do sljedećeg razdoblja – to je <Term id="cpu-throttling">prigušivanje</Term>. Proces ostaje živ, samo odgovara sporije.
                  </p>
                  <CfsLab />
                  <Callout kind="warn" title="Više dretvi troši kvotu brže">
                    Kvota vrijedi za cijeli kontejner, ne za jednu dretvu. Program s četiri dretve s limitom <code>200m</code> može kvotu od 20 ms potrošiti u 5 ms stvarnog vremena – pa onda čekati 95 ms. Zato limit od „pola procesorske jezgre” zna usporiti i aplikaciju koja u prosjeku troši malo.
                  </Callout>
                </>
              ),
            },
            {
              label: 'memorija iznad limita',
              content: (
                <>
                  <p>
                    Memorija je <em>nestlačiva</em>: zauzetu memoriju nije moguće „usporiti” niti oduzeti bez gubitka podataka. Kad kontejner prijeđe memorijski limit, jezgra operacijskog sustava ubija proces. Kubelet to vidi kao <Term id="oomkilled">OOMKilled</Term> s izlaznim kodom 137 i pokreće kontejner ponovno – a ako se to ponavlja, Pod završi u <Term id="crashloopbackoff">CrashLoopBackOffu</Term> iz 12. predavanja.
                  </p>
                  <OomStepper />
                </>
              ),
            },
            {
              label: 'čvoru ponestaje memorije',
              content: (
                <>
                  <p>
                    Iz <code>requests</code> i <code>limits</code> Kubernetes svakom Podu izračuna <Term id="qos-class">QoS klasu</Term>. <strong>Guaranteed</strong>: svaki kontejner ima <code>requests</code> jednake <code>limits</code> za procesor i memoriju. <strong>BestEffort</strong>: nijedan kontejner nema ni <code>requests</code> ni <code>limits</code>. <strong>Burstable</strong>: sve ostalo.
                  </p>
                  <p>
                    Kad je čvoru dostupno manje od 100Mi memorije, kubelet počinje <Term id="node-pressure-eviction">izbacivati Podove</Term>, jedan po jedan, svakih 10 s dok pritisak ne prestane. Redoslijed: najprije Podovi koji troše više nego što su rezervirali; među njima prvo oni nižeg prioriteta, a pri istom prioritetu oni koji rezervaciju premašuju najviše. QoS klasu kubelet pritom ne gleda – ali BestEffort nije rezervirao ništa, pa je uvijek u prvoj skupini, a Guaranteed ne može trošiti više od rezervacije, pa je u zadnjoj.
                  </p>
                  <QosLab />
                  <p>
                    Ako memorija naraste brže nego što kubelet stigne pogledati, prvi reagira OOM killer jezgre operacijskog sustava. On bira proces s najvećim brojem <code>oom_score</code>: udio memorije čvora (u tisućinkama) plus <code>oom_score_adj</code>, koji kubelet postavlja prema QoS klasi – {fmtAdj(QOS.pods.find((p) => p.qos === 'Guaranteed')?.adj)} za Guaranteed, {fmtAdj(QOS.pods.find((p) => p.qos === 'BestEffort')?.adj)} za BestEffort, a za Burstable između (to viši što je <code>requests</code> manji). Ovdje QoS klasa izravno odlučuje: u istom trenutku jezgra operacijskog sustava ubila bi <code>{QOS.kernelVictim ?? 'fotografije'}</code>.
                  </p>
                  <Callout kind="tip" title="Potrošač za fotografije iz incidenta">
                    Bez <code>requests</code> i <code>limits</code> potrošač je bio BestEffort, pa ga je kubelet izbacio prvog. ReplicaSet je odmah napravio novi Pod. Dok je node-2 pod pritiskom memorije, BestEffort Pod onamo ne smije, pa je završio na drugom čvoru ili se vratio kad je pritisak prošao – i krug se ponovio. Dok je memorija bila pri dnu, kubelet je uz potrošača izbacivao i API Podove koji su trošili više od svojih <code>requests</code>. Rješenje ima dva dijela: <code>requests</code> koji kažu koliko potrošaču stvarno treba i memorijski limit koji curenje zaustavi u njegovu Podu.
                  </Callout>
                </>
              ),
            },
          ]}
        />
        <Compare
          left={{ title: 'CPU iznad limita', tone: 'amber', points: ['prigušivanje: čeka početak sljedećeg razdoblja od 100 ms', 'proces živi, ponovnog pokretanja nema', 'simptom: veća latencija, ne greške', 'kubectl get pods ga ne pokazuje, samo metrike'] }}
          right={{ title: 'Memorija iznad limita', tone: 'rose', points: ['OOMKilled, izlazni kod 137', 'proces umire i kreće ispočetka', 'simptom: ponovna pokretanja, CrashLoopBackOff', 'kubectl describe pod: Last State'] }}
        />
      </Section>

      <Section id="simulacija" kicker="simulacija" title="Tetris raspoređivača" lead="Sada sve zajedno: vi slažete Podove na čvorove – rukom, pa raspoređivačem – i kvarite ih.">
        <p>
          Gore čekaju Podovi bez čvora, dolje su tri čvora iz incidenta s Ivinim testnim Podovima. Na vrhu svakog čvora dvije su trake: šrafirani blokovi su <code>requests</code>, narančasta crta ispod stvarna potrošnja, a crvena crtkana crta zbroj <code>limits</code>. Kartice nose kratka imena (<code>web</code>, <code>api</code>, <code>leaky</code>…) – u Klopi bi to bili Podovi <code>klopa-web-…</code>, <code>klopa-api-…</code>. Preset „Incident 17” vraća stanje s kartice incidenta.
        </p>
        <TetrisSim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Ručno slaganje (engl. <em>bin packing</em>) može smjestiti i <code>fragment</code>; raspoređivač s pravilom LeastAllocated Podove raspoređuje ravnomjerno, pa velik Pod na kraju nema komad dovoljne veličine.</li>
            <li>
              <code>big-db</code> ne stane nigdje: traži 4000m, a najveći čvor ima 3920m allocatable. Nikakvo slaganje to ne rješava – treba veći čvor.
            </li>
            <li>
              <code>cpu-burner</code> rezervira 250m, htio bi trošiti 1000m, a limit mu je 500m: radi, ali je prigušen 50 % i nikad ne umire. <code>leaky</code> pri limitu 256Mi završava s OOMKilled pa u CrashLoopBackOffu – a susjedi to ne osjete. Veći limit samo odgađa sljedeći OOMKilled; pomaže tek popravak curenja.
            </li>
            <li>Pritisak memorije na čvoru izbacuje Podove po redu: najprije one koji troše više nego što su rezervirali.</li>
          </ul>
        </Callout>
        <DeepDive title="Što simulacija pojednostavnjuje">
          <p>
            Svaki Pod ima jedan kontejner, procesor se dijeli jednom u sekundi (kad svi žele više nego što čvor ima, svaki dobiva udio razmjeran svojim <code>requests</code>), a memorija se provjerava stalno. Kubelet provjerava pritisak memorije svakih 10 s, kao i u stvarnosti, ali čvor ovdje ostaje u stanju MemoryPressure samo 30 s nakon što pritisak prođe, a ne 5 minuta. Raspoređivač boduje samo prema LeastAllocated, bez pravila raspršivanja replika. Pod bez vlasnika (bez Deploymenta) nakon izbacivanja ostaje <code>Evicted</code>; da ga posjeduje ReplicaSet, nastao bi novi.
          </p>
        </DeepDive>
      </Section>

      <Section id="cvorovi" kicker="koncept" title="Veličine čvorova umjesto težina" lead="Iz 4. predavanja: Mali, Srednji i Veliki. Kako Kubernetes zna da Veliki može više?">
        <p>
          U 4. predavanju redaru smo dali težine 1 : 2 : 4. U 14. smo vidjeli da Service nema težina: svaku novu vezu šalje nasumično odabranom spremnom Podu. Odgovor je u raspoređivanju – na veći čvor stane više Podova po <code>requests</code>, pa kad se klaster puni, on nosi više Podova, a time i više veza.
        </p>
        <NodeSizes />
        <p>
          Ponekad Pod mora na točno određen čvor ili ga mora izbjegavati. <code>nodeSelector</code> traži čvor s oznakom (npr. <code>disk: ssd</code>), a zabrana na čvoru (engl. <em>taint</em>) ne pušta na čvor nijedan Pod osim onih koji je izričito toleriraju (engl. <em>toleration</em>) – tako se čvor s grafičkom karticom čuva za poslove koji je trebaju. Oboje raspoređivač provjerava u koraku filtriranja.
        </p>
        <Callout kind="fact" title="Promjena resursa bez ponovnog pokretanja">
          Od Kubernetesa 1.35 promjena resursa pokrenutog Poda na mjestu (engl. <em>in-place resize</em>) je stabilna (stanje: listopad 2026.): <code className={styles.wrapCode} style={{ whiteSpace: 'normal' }}>kubectl patch pod … --subresource resize</code> mijenja <code>requests</code> i <code>limits</code> istog Poda, bez novog Poda. QoS klasa se pritom ne smije promijeniti, a neke promjene (npr. promjena memorije kad je u <code>resizePolicy</code> postavljeno <code>RestartContainer</code>) i dalje ponovno pokreću kontejner. Ako tako promijenite Pod iz Deploymenta, predložak to ne zna – sljedeći novi Pod opet dobiva stare vrijednosti. Promjena <code>resources</code> u predlošku Deploymenta i dalje znači uvođenje novih Podova.
        </Callout>
        <Callout kind="warn" title="CPU limit: kompromis, ne pravilo">
          CPU limit štiti susjede od Poda koji podivlja, ali prigušuje i kad je čvor prazan – latencija raste bez ikakvog razloga na čvoru. Mnogi timovi zato postavljaju CPU <code>requests</code> bez CPU limita, a memorijski limit uvijek. Za klopa-api tako smo i napravili; za Ivine testne Podove u <code>klopa-staging</code> limit ima smisla.
        </Callout>
      </Section>

      <Section id="kod" kicker="kod" title="resources, describe i top" lead="Sve što ste slagali u simulaciji stoji u šest redaka YAML-a – a dijagnoza u dvije naredbe.">
        <CodeBlock
          title="deployment.yaml"
          lang="yaml"
          code={resourcesYaml}
          highlight="22-28"
          notes={[
            { lines: '23-25', text: 'raspoređivač: 250m i 384Mi moraju stati na čvor' },
            { lines: '26-27', text: 'jezgra OS-a: iznad 512Mi → OOMKilled (137)' },
            { lines: '28', text: 'bez CPU limita: nema prigušivanja na praznom čvoru' },
          ]}
          caption={
            <>
              Pod je u QoS klasi Burstable: <code>requests</code> su manji od <code>limits</code>, a CPU limita nema.
            </>
          }
        />
        <p>Zašto Pod čeka? Davor kreće od Poda, a završava na čvoru:</p>
        <Terminal title="Zašto je fragment u Pendingu" lines={TERM.pending} caption="Ispis iz simulatora za preset „Incident 17”, 120 s nakon pokretanja. kubectl top treba metrics-server u klasteru." />
        <p>Zašto se Pod stalno ruši? Za OOMKilled odgovor je u Podu, u odjeljku Last State:</p>
        <Terminal title="Zašto se leaky ruši" lines={TERM.leaky} />
        <CodeBlock title="resize.sh" lang="bash" code={resizeSh} mode="closed" caption="Promjena resursa pokrenutog Poda na mjestu – i zašto isto u Deploymentu pokreće uvođenje." />
        <CodeBlock
          title="staging-limits.yaml"
          lang="yaml"
          code={stagingYaml}
          mode="closed"
          caption={
            <>
              LimitRange dopisuje <code>requests</code> i <code>limits</code> kontejnerima koji ih nemaju; ResourceQuota ograničava zbroj cijelog Namespacea.
            </>
          }
          notes={[
            { lines: '10-15', text: 'Pod bez requests više nije BestEffort' },
            { lines: '27', text: 'requests svih Podova zajedno ≤ 2 procesorske jezgre' },
          ]}
        />
      </Section>

      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            {
              statement: 'Raspoređivač gleda stvarnu potrošnju.',
              fact: false,
              explain: (
                <>
                  Gleda samo <code>requests</code>. Ivini testni Podovi troše 20m, a za raspoređivača zauzimaju 1000m ili 1500m.
                </>
              ),
            },
            {
              statement: 'Limits se rezerviraju.',
              fact: false,
              explain: (
                <>
                  Raspoređivač rezervira samo <code>requests</code>; <code>limits</code> jezgra operacijskog sustava provodi tek dok kontejner radi, a zbroj limita smije biti veći od čvora. Zamka: ako napišete samo <code>limits</code>, Kubernetes <code>requests</code> postavi na iste vrijednosti – i tada se rezervira cijeli limit.
                </>
              ),
            },
            {
              statement: 'Bez requests je u redu.',
              fact: false,
              explain: (
                <>
                  Bez <code>requests</code> i bez <code>limits</code> Pod je BestEffort: raspoređivač ga smjesti bilo gdje, izbacuje se među prvima, a HPA (18. predavanje) ne može izračunati njegovu iskorištenost, jer je mjeri u odnosu na <code>requests</code>. (Postavite li samo <code>limits</code>, Kubernetes <code>requests</code> izjednači s <code>limits</code>.)
                </>
              ),
            },
            {
              statement: 'Promjena resources u deployment.yaml ne restarta Podove.',
              fact: false,
              explain: (
                <>
                  Promjena predloška Poda pokreće uvođenje novih Podova. Na mjestu se mijenja samo pokrenuti Pod, preko podresursa <code>resize</code> (vidi okvir o promjeni na mjestu) ili VPA-a; i tada neke promjene ponovno pokreću kontejner.
                </>
              ),
            },
            { statement: 'CPU limit uvijek postavite.', fact: false, explain: 'To je kompromis: limit štiti susjede, ali prigušuje i na praznom čvoru. Memorijski limit postavite uvijek, CPU limit prema potrebi.' },
            {
              statement: 'Zbroj limits na čvoru smije biti veći od kapaciteta čvora.',
              fact: true,
              explain: (
                <>
                  Smije – to je prekomjerna dodjela (engl. <em>overcommit</em>). <code>kubectl describe node</code> to i kaže: „Total limits may be over 100 percent”.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            <>
              <code>requests</code> su rezervacija: raspoređivač ih zbraja i uspoređuje s allocatable čvora. Stvarnu potrošnju ne gleda.
            </>,
            <>
              <code>limits</code> provodi jezgra operacijskog sustava: procesor iznad limita se prigušuje, memorija iznad limita završava s OOMKilled (137) i CrashLoopBackOffom.
            </>,
            <>„Insufficient cpu” znači da nijedan čvor nema dovoljno nerezerviranog mjesta u jednom komadu – i kad graf potrošnje pokazuje 30 %.</>,
            <>Kad nestane memorije, kubelet najprije izbacuje Podove koji troše više nego što su rezervirali (BestEffort je uvijek među njima); QoS klasa određuje koga OOM killer jezgre operacijskog sustava ubija prvog.</>,
            <>
              Na veći čvor stane više Podova po <code>requests</code>, a Service dijeli veze po Podovima – kad se klaster puni, veći čvor nosi više prometa, bez težina.
            </>,
          ]}
        />
        <StoryMap at="17" caption="Klopa nakon ovog predavanja: svaki Pod ima rezervaciju i gornju granicu, a raspoređivač zna koliko je mjesta na kojem čvoru." />
        <Quiz
          questions={[
            {
              q: 'Čvor ima allocatable 1930m procesora. Podovi na njemu imaju requests ukupno 1800m, a troše 400m. Stane li ondje Pod s requests 300m?',
              options: [
                'Da, jer se troši tek 400m od 1930m.',
                'Ne, jer je 1800m + 300m više od 1930m.',
                'Da, ali bit će prigušen.',
                <>
                  Ovisi o <code>limits</code> tog Poda.
                </>,
              ],
              correct: 1,
              explain: (
                <>
                  Raspoređivač zbraja rezervacije: 2100m &gt; 1930m, pa filtar čvor izbacuje (Insufficient cpu). Stvarna potrošnja od 400m ne igra nikakvu ulogu, a <code>limits</code> se pri raspoređivanju ne gledaju.
                </>
              ),
            },
            {
              q: (
                <>
                  <code>kubectl describe pod</code> pokazuje <code>Last State: Terminated</code>, <code>Reason: OOMKilled</code>, <code>Exit Code: 137</code> i <code>Restart Count: 4</code>. Što se dogodilo?
                </>
              ),
              options: ['Raspoređivač nije našao čvor.', 'Kontejner je prešao CPU limit pa ga je kubelet ugasio.', 'Kontejner je prešao memorijski limit (ili je čvoru nestalo memorije) i jezgra operacijskog sustava ga je ubila.', 'Provjera živosti nije prošla.'],
              correct: 2,
              explain:
                '137 = 128 + 9: proces je ubijen signalom SIGKILL. Sam broj 137 ne znači memoriju – presudan je razlog OOMKilled. Kontejner ugašen zbog neuspjele provjere živosti imao bi razlog Error (izlazni kod 143 nakon SIGTERM-a, ili 137 ako proces ne stane pa dobije SIGKILL) i događaj Unhealthy „Liveness probe failed”, a zbog procesora se kontejner nikad ne ubija.',
            },
            {
              q: 'Kontejner s CPU limitom 200m dobije zahtjev koji treba 50 ms procesora. Što se događa?',
              options: ['Odgovor stiže nakon oko 210 ms: radi 20 ms, čeka 80 ms, i tako dok ne završi.', 'Kontejner se ubija jer je prešao limit.', 'Odgovor stiže nakon 50 ms, limit vrijedi samo za prosjek.', 'Zahtjev se odbija s greškom 503.'],
              correct: 0,
              explain: 'Kvota je 20 ms u svakih 100 ms: 20 ms rada, 80 ms čekanja, 20 ms rada, 80 ms čekanja, pa zadnjih 10 ms – ukupno 210 ms. Kontejner je samo prigušen.',
            },
            {
              q: (
                <>
                  Kontejner ima <code>requests: cpu 250m, memory 384Mi</code> i <code>limits: memory 512Mi</code>. Koja je QoS klasa Poda?
                </>
              ),
              options: ['Guaranteed', 'Burstable', 'BestEffort', 'Ne može se odrediti bez CPU limita.'],
              correct: 1,
              explain: (
                <>
                  <code>requests</code> postoje, ali nisu jednaki <code>limits</code> (a CPU limita nema), pa je Pod Burstable. Guaranteed bi trebao <code>requests</code> = <code>limits</code> i za procesor i za memoriju.
                </>
              ),
            },
            {
              q: 'Čvoru je ostalo 60Mi dostupne memorije. Na njemu su api (Guaranteed, troši 400Mi od rezerviranih 512Mi), web (troši 300Mi, rezervirao 256Mi) i fotografije (bez requests, troši 900Mi). Koga kubelet izbacuje prvog?',
              options: ['api, jer troši najviše od svih rezervacija.', 'web, jer je Burstable.', 'fotografije: troši više od rezervacije, i to za najviše.', 'Nikoga – kubelet čeka da jezgra operacijskog sustava sama ubije proces.'],
              correct: 2,
              explain: 'Prvo dolaze Podovi koji troše više nego što su rezervirali (web i fotografije), a među njima onaj koji rezervaciju premašuje najviše: fotografije za 900Mi. Sljedeći bi bio web; api je unutar svoje rezervacije i ide zadnji.',
            },
            {
              q: 'Iz 4. i 14. predavanja: Klopa ima čvorove Mali, Srednji i Veliki. Kako postići da Veliki dobiva najviše prometa?',
              options: [
                'U Serviceu postavimo težine 1 : 2 : 4.',
                <>
                  Postavimo veće CPU <code>limits</code> na Podove na Velikom.
                </>,
                <>
                  Postavimo točne <code>requests</code>: na Veliki stane najviše Podova, a Service veze dijeli po Podovima.
                </>,
                'Uključimo round-robin u kube-proxyju.',
              ],
              correct: 2,
              explain: (
                <>
                  Service nema težina: svaku novu vezu šalje nasumičnom spremnom Podu, pa udio prometa po čvoru prati broj Podova na njemu. Kad se klaster puni, na Veliki po <code>requests</code> stane najviše Podova. Pri malo replika zadano pravilo raspršivanja replika daje gotovo jednako Podova po čvoru, pa se razlika vidi tek kad replika ima dovoljno.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Requests su točni: raspoređivač slaže Podove prema stvarnim potrebama, a Pending ima jasan razlog.',
            'Memorijski limit drži curenje u jednom Podu; susjedi ga ne osjete.',
            <>
              LimitRange i ResourceQuota drže <code>klopa-staging</code> u njegovu kutu klastera.
            </>,
          ]}
          paid={[
            <>
              Broj replika i dalje mijenja čovjek: Davor svaki dan u 11:45 upisuje <code>kubectl scale --replicas=12</code>.
            </>,
            'Rezervacije se plaćaju i noću, kad su Podovi prazni – čvorovi rade za ručak koji traje dva sata.',
            <>
              Vrijednosti <code>requests</code> i <code>limits</code> treba mjeriti: preniske daju OOMKilled i prigušivanje, previsoke Pending.
            </>,
          ]}
          next={
            <>
              Limiti drže curenje pod kontrolom, a requests su točni. Ali svaki dan u 11:45 Davor i dalje ručno upisuje <code>kubectl scale --replicas=12</code>. Na blagdanski ponedjeljak zaboravi – i u 12:05 prosječna narudžba čeka pet sekundi.
            </>
          }
        />
      </Section>
    </>
  )
}

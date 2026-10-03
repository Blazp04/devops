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
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  Section,
  StickyNote,
  StoryMap,
  Term,
} from '../../kit'
import { ManualScale } from './sims/ManualScale'
import { FormulaLab } from './sims/FormulaLab'
import { RequestsLab } from './sims/RequestsLab'
import { SlowDownStepper } from './sims/SlowDownStepper'
import { LeadTimeStepper } from './sims/LeadTimeStepper'
import { QueueKeda } from './sims/QueueKeda'
import { SurviveLunch } from './sims/Flagship'
import { TradeoffPlot } from './sims/TradeoffPlot'
import { HpaWatch } from './sims/HpaWatch'
import hpaYaml from './code/hpa.yaml?raw'
import resourcesYaml from './code/deployment-resources.yaml?raw'
import scaledObjectYaml from './code/scaledobject.yaml?raw'
import pdbYaml from './code/pdb.yaml?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section id="incident" kicker="priča" title="Blagdanski ponedjeljak" lead="Svaki dan u 11:45 Davor ručno povećava broj replika. Na blagdanski ponedjeljak zaboravio je.">
        <IncidentCard
          no={18}
          when="ponedjeljak, 12:05"
          title="Nitko nije povećao broj replika: narudžba čeka pet sekundi"
          who="davor"
          says={['Zaboravio sam', 'kubectl scale!']}
          preset="„Incident 18: bez skaliranja” u simulaciji „Preživite ručak” (nalet 20 → 100 zahtjeva/s u t = 60 s, minReplicas = maxReplicas = 2; brojke od t = 65 s nadalje – s dva Poda se do kraja naleta ne mijenjaju)"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '100' },
            { label: 'prosječno čekanje', value: '≈ 5 s', tone: 'bad' },
            { label: 'p95', value: '≈ 15 s', tone: 'bad' },
            { label: 'odbijeno', value: '20 %', tone: 'bad' },
          ]}
        >
          Na blagdanski ponedjeljak Davor je u 11:45 zaboravio upisati <code>kubectl scale --replicas=12</code>. U podne promet skoči s 20 na 100 zahtjeva u sekundi, a dva Poda mogu primiti najviše 80. U 12:05 prosječna narudžba čeka pet sekundi, p95 je oko 15 s, a svaki peti zahtjev propada.
        </IncidentCard>
        <p>
          Ručno skaliranje radi dok netko misli na njega. Davor svaki dan u 11:45 upiše dvanaest replika, a poslijepodne ih – ako se sjeti – vrati na dvije. Dvanaest Podova traži četiri čvora, pa ih Klopa često plaća cijeli dan, a noću ti čvorovi samo griju zrak. Probajte biti Davor:
        </p>
        <ManualScale />
        <p>
          Petra podsjeća da ponedjeljak nije iznimka: svaki Ćevap-petak promet u nekoliko sekundi skoči s 20 na 100 zahtjeva u sekundi, a nagli val (engl. <em>flash crowd</em>) zna doći i do 200. Za ispitni rok nitko ne zna unaprijed koliko će biti gužve. Pitanje ovog predavanja: <strong>može li Klopa sama dodavati i uklanjati kapacitet – i koliko to traje?</strong>
        </p>
        <p>Za to postoje tri poluge, svaka za svoju razinu – HPA je ugrađen u Kubernetes, a Cluster Autoscaler i KEDA su dodaci:</p>
        <div className={styles.levers}>
          <StickyNote c="blue" rotate={-1} className={styles.lever}>
            <div className={styles.leverHead}>
              <DoodleIcon kind="scale" className={styles.leverIcon} /> HPA
            </div>
            <p className={styles.leverText}>dodaje i uklanja <strong>Podove</strong> prema iskorištenosti CPU-a. Sekunde.</p>
          </StickyNote>
          <StickyNote c="yellow" rotate={0.8} className={styles.lever}>
            <div className={styles.leverHead}>
              <DoodleIcon kind="node" className={styles.leverIcon} /> Cluster Autoscaler
            </div>
            <p className={styles.leverText}>dodaje <strong>čvorove</strong> kad Podovi nemaju gdje stati, a uklanja suvišne. Minute.</p>
          </StickyNote>
          <StickyNote c="green" rotate={-0.6} className={styles.lever}>
            <div className={styles.leverHead}>
              <DoodleIcon kind="queue" className={styles.leverIcon} /> KEDA
            </div>
            <p className={styles.leverText}>skalira <strong>potrošače reda</strong> (klopa-worker) prema broju poruka – sve do nule.</p>
          </StickyNote>
        </div>
        <StoryMap at="18" caption="Klopa nakon ovog predavanja: HPA i Cluster Autoscaler za klopa-api, KEDA za klopa-worker. (U simulacijama ovog predavanja čvorovi su manji, 2 vCPU · 8 GiB, da se Cluster Autoscaler vidi brže.)" />
      </Section>

      {/* 2 · the formula */}
      <Section id="formula" kicker="koncept" title="Formula uživo" lead="HPA je još jedna petlja usklađivanja: svakih 15 s usporedi izmjereno opterećenje s ciljem i izračuna koliko replika treba.">
        <Predict
          question="HPA vidi 3 Poda klopa-api na prosječno 90 % CPU-a, a cilj je 50 %. Koliko replika zatraži?"
          options={['4', '5', '6', '9']}
          correct={2}
          explain="⌈3 × 90 / 50⌉ = ⌈5,4⌉ = 6. Opterećenje je 1,8 puta veće od željenog, pa treba 1,8 puta više Podova – zaokruženo naviše."
          then="Provjerite u crtežu ispod: gumb „3 Poda na 90 %”."
        />
        <p>
          <Term id="horizontalpodautoscaler">HorizontalPodAutoscaler</Term> (HPA) je objekt u klasteru i kontroler koji ga provodi. HPA ne pokreće Podove sam: samo promijeni polje <code>replicas</code> u Deploymentu, a Podove i dalje stvara ReplicaSet. Svakih 15 s pita metrics-server (dodatak koji od agenta <code>kubelet</code> na svakom čvoru skuplja potrošnju CPU-a i memorije) koliko CPU-a troše Podovi (prosjek zadnjih 15-ak sekundi) i računa:
        </p>
        <Callout kind="key" title="Formula HPA-a">
          <p className={styles.formula}>željeno = ⌈ replike × izmjereno / cilj ⌉</p>
          <p>Replike su trenutačni broj Podova, a zagrade ⌈ ⌉ znače zaokruživanje naviše. 2 Poda na 80 % uz cilj 50 %: ⌈2 × 1,6⌉ = ⌈3,2⌉ = 4.</p>
        </Callout>
        <MarginNote>omjer 1,0 = točno na cilju</MarginNote>
        <p>Dva detalja čine formulu mirnom:</p>
        <ul>
          <li>
            <strong>
              <Term id="hpa-tolerance">tolerancija</Term>
            </strong>{' '}
            – ako je omjer izmjereno / cilj između 0,9 i 1,1, HPA ne radi ništa. Na 54 % uz cilj 50 % ostaje isti broj Podova.
          </li>
          <li>
            <strong>više metrika</strong> – ako HPA prati i CPU i memoriju, izračuna prijedlog za svaku i uzme <em>najveći</em>.
          </li>
        </ul>
        <FormulaLab />
        <Analogy title="Termostat s inercijom" who="mira" breaksDown="HPA ne regulira glatko, nego u cijelim Podovima i u koracima od 15 s, a „toplinu” mjeri samo u odnosu na CPU request. Čvorovi se ne zagrijavaju – naručuju se od oblaka i na njih se čeka minutama.">
          Kao termostat u kuhinji: čim je hladnije od zadanog, grijanje se uključi – ali kuhinja se zagrije tek nakon nekog vremena. Zato termostat ne pali i gasi grijanje za svaki stupanj, nego čeka da razlika bude dovoljno velika.
        </Analogy>
      </Section>

      {/* 3 · requests */}
      <Section id="requests" kicker="koncept" title="Iskorištenost se mjeri prema requestu" lead="HPA ne zna koliko je CPU-a „puno”. Zna samo koliko Pod troši u odnosu na svoj CPU request (zajamčeni minimum).">
        <p>
          U prošlom predavanju <Term id="resource-requests"><code>requests</code></Term> (zajamčeni minimum) bio je dogovor s raspoređivačem. HPA ga koristi kao mjernu jedinicu. Za autoskaliranje je Lana CPU request podigla s 250m na 500m (izmjereno pod opterećenjem) i dodala CPU limit od 1000m: u prošlom predavanju ga namjerno nismo imali, a ovdje pokazuje gornju granicu jednog Poda.
        </p>
        <Callout kind="key" title="Iskorištenost za HPA">
          <p className={styles.formula}>iskorištenost = potrošnja / request</p>
          <p>Pod klopa-api za svaki zahtjev potroši 25 ms CPU-a. Uz 16 zahtjeva u sekundi to je 400m, a uz request od 500m iskorištenost je 80 %.</p>
        </Callout>
        <p>
          Isti promet uz request od 250m pokazuje 160 %, a uz 1000m samo 40 %. HPA bi u prvom slučaju dodavao Podove, a u drugom ih uklanjao – za potpuno isto opterećenje. Pomaknite klizače:
        </p>
        <RequestsLab />
        <MarginNote tone="red">request = 100 % za HPA</MarginNote>
        <p>Iz toga slijede tri stvari koje vrijedi zapamtiti:</p>
        <ul>
          <li>
            <strong>Bez CPU requesta HPA je slijep.</strong> U stupcu <code>TARGETS</code> piše <code>&lt;unknown&gt;</code>, događaj je <code>FailedGetResourceMetric</code> i ništa se ne skalira. (Ako postavite samo limit, Kubernetes request izjednači s limitom.)
          </li>
          <li>
            <strong>Limit ograničava jedan korak.</strong> Uz <code>limits</code> (gornja granica) od 2 × request Pod nikad ne izmjeri više od 200 %. Uz cilj 50 % omjer je najviše 4: jedan izračun traži najviše četiri puta više Podova. (Bez CPU limita, kao u prošlom predavanju, iskorištenost može prijeći 200 %.)
          </li>
          <li>
            <strong>Requests moraju biti točni.</strong> Previsok request: HPA kasni, a plaćate prazan prostor. Prenizak: HPA dodaje Podove prerano, a raspoređivač ih nagura previše na isti čvor.
          </li>
        </ul>
      </Section>

      {/* 4 · slow down */}
      <Section id="polako" kicker="korak po korak" title="Polako prema dolje" lead="Gore brzo, ali s ogradom; dolje namjerno sporo. Oba pravila štite od klackalice.">
        <p>
          Kad bi HPA slijepo slijedio formulu, svaki trzaj prometa značio bi nove Podove, a svaki predah gašenje – pa ponovno pokretanje minutu kasnije. Zato HPA ima pravila ponašanja (<code>behavior</code>):
        </p>
        <ul>
          <li>
            <strong>Povećanje:</strong> u 15 s najviše +100 % ili +4 Poda – vrijedi veće od ta dva. Iz 3 Poda smije na 7, ne na 8.
          </li>
          <li>
            <strong>Smanjenje:</strong> HPA pamti svoje preporuke iz zadnjih 300 s i bira najveću (<Term id="stabilization-window">prozor stabilizacije</Term>). Tek kad promet pet minuta stvarno miruje, Podovi odlaze – i tada smiju svi odjednom.
          </li>
        </ul>
        <p>Pogledajmo jedan nalet iz simulacije, korak po korak:</p>
        <SlowDownStepper />
        <MarginNote tone="red">5 minuta rezerve = cijena mira</MarginNote>
        <p>
          Točke su preporuke formule, a plava crta ono što je HPA stvarno napravio. Razlika među njima su pravila: ograda pri povećanju i prozor pri smanjenju. Oba se mogu mijenjati u <code>behavior</code>, ali zadane vrijednosti su dobar početak.
        </p>
      </Section>

      {/* 5 · nodes */}
      <Section id="cvorovi" kicker="korak po korak" title="Podovi u sekundama, čvorovi u minutama" lead="HPA može tražiti koliko god Podova, ali svaki Pod mora negdje stati. Kad mjesta nema, sekunde postaju minute.">
        <p>
          <Term id="cluster-autoscaler">Cluster Autoscaler</Term> (CA) ne gleda CPU čvorova. Svakih 10 s traži Podove u stanju <Term id="pending">Pending</Term> koje raspoređivač nije mogao smjestiti jer im nijedan čvor nema dovoljno mjesta za njihov <code>requests</code>. Ako bi takav Pod stao na novi čvor iz grupe, Cluster Autoscaler zatraži čvor od oblaka – i tada čekamo stroj.
        </p>
        <LeadTimeStepper />
        <p>
          <Term id="karpenter">Karpenter</Term> isti posao radi drugačije: umjesto da povećava unaprijed zadane grupe čvorova, prema <code>requests</code> Podova koji čekaju sam odabere i naruči odgovarajući stroj. Pokretanje stroja i dalje traje.
        </p>
        <Callout kind="fact" title="Zadane vrijednosti Cluster Autoscalera">
          <ul className={styles.facts}>
            <li>
              pregled klastera svakih 10 s (<code className={styles.flag}>--scan-interval</code>);
            </li>
            <li>
              čvor je kandidat za uklanjanje kad je zbroj requesta Podova na njemu ispod 50 % kapaciteta (<code className={styles.flag}>--scale-down-utilization-threshold=0.5</code>)
            </li>
            <li>
              … i to 10 minuta zaredom (<code className={styles.flag}>--scale-down-unneeded-time</code>), ne ranije od 10 minuta nakon zadnjeg dodavanja (<code className={styles.flag}>--scale-down-delay-after-add</code>).
            </li>
          </ul>
        </Callout>
        <p>
          Prije uklanjanja Cluster Autoscaler čvor isprazni (<em>drain</em>): Podove izbacuje kroz Eviction API, a ReplicaSeti ih ponovno stvore na drugim čvorovima. Tu pomaže <Term id="pod-disruption-budget">PodDisruptionBudget</Term> (PDB): „najviše jedan Pod klopa-api smije nedostajati”, pa drain izbaci jedan Pod, pričeka da njegova zamjena bude spremna i tek onda izbaci sljedeći. Pazite: <code>minAvailable</code> jednak broju replika (npr. 2 uz <code>minReplicas: 2</code>) znači da drain ne može izbaciti nijedan Pod, pa Cluster Autoscaler takav čvor ne može ukloniti. PDB vrijedi samo za <em>dobrovoljne</em> prekide – ako čvor izgori, PDB ne može ništa.
        </p>
        <KeyIdea>
          Autoskaliranje je <strong>termostat s inercijom</strong>: Podovi stižu u <strong>sekundama</strong>, čvorovi u <strong>minutama</strong>, a smanjivanje namjerno kasni. Vrijeme kupujete <strong>rezervom</strong>, a HPA opterećenje vidi samo <strong>u odnosu na CPU request</strong>.
        </KeyIdea>
      </Section>

      {/* 6 · queue consumers */}
      <Section id="red" kicker="red poruka" title="Potrošači po dubini reda" lead="klopa-worker ne treba više CPU-a kad je gužva – treba više ruku. Pravi signal je broj poruka u redu.">
        <p>
          Potrošač iz šestog predavanja uglavnom čeka: kuhinju, SMS-gateway, bazu. Njegov CPU je nizak i kad u <Term id="message-queue">redu poruka</Term> <code>narudzbe</code> čeka 300 listića. HPA na CPU-u tu je slijep. Zato potrošače skaliramo po dubini reda, dodatkom <Term id="keda">KEDA</Term>:
        </p>
        <ol>
          <li>
            <strong>0 → 1:</strong> operator KEDA (KEDA-in kontroler u klasteru) svakih 30 s pogleda red. Ako je Deployment na 0, a u redu ima poruka, sam ga podigne na 1 (aktivacija).
          </li>
          <li>
            <strong>1 ↔ N:</strong> za ostalo KEDA stvori običan HPA s vanjskom metrikom: željeno = ⌈poruke / 10⌉.
          </li>
          <li>
            <strong>N → 0:</strong> kad je red 300 s prazan, operator vrati Deployment na 0. Noću nijedan potrošač ne zauzima mjesto na čvoru – pa Cluster Autoscaler može ukloniti čvor koji je ostao prazan.
          </li>
        </ol>
        <MarginNote>0 Podova = 0 CPU-a za mjeriti</MarginNote>
        <Callout kind="fact" title="HPA i nula">
          <p>
            Od Kubernetesa 1.37 HPA može i sam spustiti Deployment na nulu (beta, uključeno zadano), ali samo s metrikama tipa <code>Object</code> ili <code>External</code> – ne s CPU-om ni memorijom: Pod kojeg nema ne može izmjeriti svoj CPU. KEDA (završeni projekt CNCF-a, engl. <em>graduated</em>; više od 70 izvora: RabbitMQ, Kafka, SQS…) skaliranje na nulu radi godinama.
          </p>
        </Callout>
        <p>
          Isprobajte jedan dan u menzi sažet u pet minuta. KEDA-ina vremena (provjera reda, HPA, povratak na 0) skraćena su deset puta, a uz svako piše stvarna vrijednost.
        </p>
        <QueueKeda />
      </Section>

      {/* 7 · flagship */}
      <Section id="simulacija" kicker="simulacija" title="Preživite ručak" lead="Sve zajedno, u jednom klasteru: HPA i Cluster Autoscaler za klopa-api, KEDA za klopa-worker.">
        <p>
          Promet je zadan kao nalet: 60 s nakon odabira skok s 20 na 100 zahtjeva u sekundi, šest minuta. Simulacija ide pet puta brže; za noć i KEDA-u prebacite na 30 ×. Gumb „Incident 18” vraća blagdanski ponedjeljak: dva Poda i nitko ne skalira.
        </p>
        <Predict
          question="HPA je uključen (minReplicas 2, cilj 50 %). Hoće li prvih 15 s naleta 20 → 100 zahtjeva/s proći bez odbijenih zahtjeva?"
          options={['Da, HPA reagira odmah', 'Ne: dok HPA izmjeri i Podovi se pokrenu, dva Poda su zasićena', 'Da, ako je Cluster Autoscaler uključen']}
          correct={1}
          explain="HPA nalet vidi tek pri sljedećoj provjeri (do 15 s), a novi Pod je spreman za još 11 s. Prve sekunde spašava samo rezerva."
          then="Provjerite u simulaciji ispod: pogledajte p95 i „Odbijeno” u prvim sekundama naleta."
        />
        <SurviveLunch />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul className={styles.facts}>
            <li>Uz zadane postavke HPA reagira u 15 s, ali u prvim sekundama naleta dva Poda su zasićena: p95 skoči na 15 s i dio zahtjeva propadne. Reakcija ne spašava prve sekunde – rezerva ih spašava.</li>
            <li>Podovi na postojećim čvorovima spremni su za 11 s, a oni koji čekaju novi čvor tek nakon 96 s u simulaciji (stvarno nekoliko minuta).</li>
            <li>HPA stane na 9 Podova, ne na 10: 55 % je unutar tolerancije.</li>
            <li>Nakon naleta Podovi ostaju još 300 s, a suvišni čvor još desetak minuta nakon toga.</li>
            <li>Bez CPU requesta HPA stoji na <code>&lt;unknown&gt;</code>; uz <code>maxReplicas = 4</code> p95 ostaje oko 400 ms; nagli val (flash crowd) uz najviše 6 čvorova ostavlja Podove u stanju Pending.</li>
          </ul>
        </Callout>
        <DeepDive title="Što ova simulacija pojednostavljuje">
          <ul>
            <li>Promet je „tekući”: svake sekunde 100 zahtjeva podijeli se jednako na spremne Podove, umjesto da se prati svaki zahtjev.</li>
            <li>Latencija je procjena M/M/1 (≈ 50 ms / (1 − ρ), odrezano na ρ = 0,99), a p95 ≈ 3 × prosjek. Prava aplikacija ima i druge repove.</li>
            <li>Novi čvor je spreman nakon 75 s; u stvarnom oblaku to su minute i ovisi o pružatelju i veličini slike.</li>
            <li>Red za KEDA je također „tekući” (jedan potrošač obradi dvije poruke u sekundi), a cijena čvora je zamišljena.</li>
            <li>Pravila su prava: formula, tolerancija, prozor od 300 s, ograde brzine, nespremni Podovi kao 0 %, Pending → Cluster Autoscaler, KEDA 0 ↔ 1 i 1 ↔ N.</li>
          </ul>
        </DeepDive>
      </Section>

      {/* 8 · cost */}
      <Section id="trosak" kicker="koncept" title="Rezerva, latencija i trošak" lead="Autoskaliranje ne ukida izbor, samo ga pomiče: koliko rezerve plaćate da prve sekunde naleta prođu glatko?">
        <p>Isti Ćevap-petak, pet postavki, ista simulacija. Vodoravno je prosječan trošak, okomito najgori p95 u naletu (logaritamska skala):</p>
        <TradeoffPlot />
        <ul>
          <li>
            <strong>HPA s minReplicas 2</strong> košta više od dva fiksna Poda, a prve sekunde naleta jednako su loše: dok HPA izmjeri, odluči i Podovi se zagriju, prođe 15–30 s.
          </li>
          <li>
            <strong>Niži cilj</strong> (30 %) drži više Podova cijelo vrijeme i treba više čvorova: brže, ali skuplje.
          </li>
          <li>
            <strong>Rezerva na čvorovima koje ionako plaćate</strong> gotovo je besplatna: šest Podova stane na dva čvora, pa uz minReplicas 6 i cilj 80 % nalet prolazi bez trećeg čvora.
          </li>
        </ul>
        <DeepDive title="Vertikalno skaliranje: VPA">
          <p>
            <Term id="vertical-pod-autoscaler">Vertical Pod Autoscaler</Term> ne dodaje Podove nego mijenja njihov <code>requests</code> prema stvarnoj potrošnji. Zaseban je dodatak, nije dio samog Kubernetesa, i ima načine <code>Off</code> (samo preporuke), <code>Initial</code> (samo pri stvaranju Poda), <code>Recreate</code> (Pod se ponovno stvori) i <code>InPlaceOrRecreate</code> (promjena u hodu kad je moguća). Način <code>Auto</code> je zastario. VPA i HPA ne smiju upravljati istom metrikom: VPA bi povećao request, iskorištenost bi pala i HPA bi uklanjao Podove – dva termostata u istoj sobi.
          </p>
          <Callout kind="fact" title="Verzije VPA-a">
            <p>Najnovije izdanje VPA-a je 1.8.0; <code>InPlaceOrRecreate</code> je stabilan od VPA-a 1.6.0, a <code>Auto</code> je zastario od VPA-a 1.5.</p>
          </Callout>
        </DeepDive>
      </Section>

      {/* 9 · code */}
      <Section id="kod" kicker="kod" title="HPA, KEDA i PDB u YAML-u" lead="Ono što ste vidjeli u simulaciji stane u četiri kratke datoteke YAML-a.">
        <CodeBlock
          title="hpa.yaml"
          code={hpaYaml}
          lang="yaml"
          previewLines={20}
          caption="Zadana pravila ponašanja napisana izričito, da se vide."
          notes={[
            { lines: '11-12', text: 'nikad ispod 2 ni iznad 20 Podova' },
            { lines: '19', text: 'cilj: 50 % od requests.cpu' },
            { lines: '23-30', text: 'gore: veće od +100 % i +4 Poda u 15 s' },
            { lines: '32', text: 'dolje: najveća preporuka iz zadnjih 300 s' },
          ]}
        />
        <CodeBlock
          title="deployment.yaml (isječak)"
          code={resourcesYaml}
          lang="yaml"
          mode="open"
          caption="Isti Pod kao u prošlom predavanju, uz izmjereni CPU request i novi CPU limit."
          notes={[
            { lines: '10', text: 'ovo je 100 % za HPA' },
            { lines: '13', text: 'kao u prošlom predavanju: limit memorije' },
            { lines: '14', text: 'novo u odnosu na prošlo predavanje: CPU limit' },
          ]}
        />
        <p>Lana i Davor prate HPA u terminalu dok traje nalet iz simulacije:</p>
        <HpaWatch />
        <CodeBlock
          title="scaledobject.yaml"
          code={scaledObjectYaml}
          lang="yaml"
          mode="closed"
          caption="KEDA za klopa-worker: red narudzbe na RabbitMQ-u, adresa u Secretu."
          notes={[
            { lines: '9', text: 'noću nijedan Pod' },
            { lines: '11-12', text: '0 ↔ 1: operator KEDA' },
            { lines: '19', text: '1 ↔ N: HPA s ⌈poruke / 10⌉' },
          ]}
        />
        <CodeBlock
          title="pdb.yaml"
          code={pdbYaml}
          lang="yaml"
          mode="closed"
          caption="Drain čvora izbacuje najviše jedan Pod klopa-api odjednom i čeka da zamjena bude spremna."
          notes={[{ lines: '7', text: 'drain izbacuje najviše 1 Pod odjednom' }]}
        />
        <Callout kind="fact" title="Verzije API-ja">
          <p>
            HPA: <code>autoscaling/v2</code>; PodDisruptionBudget: <code>policy/v1</code>; ScaledObject i TriggerAuthentication: <code>keda.sh/v1alpha1</code> (KEDA 2.21). HPA metrike čita kroz <code>metrics.k8s.io</code>, koji je od Kubernetesa 1.37 stabilan (<code>v1</code>), a tolerancija za svaki HPA posebno (polje <code>tolerance</code> u <code>behavior</code>) od 1.37 je stabilna (GA).
          </p>
        </Callout>
      </Section>

      {/* 10 · misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            { statement: 'HPA dodaje čvorove.', fact: false, explain: 'HPA mijenja samo broj Podova. Čvorove dodaju Cluster Autoscaler ili Karpenter – i to tek kad Podovi ostanu u stanju Pending.' },
            { statement: 'Cluster Autoscaler reagira na visok CPU.', fact: false, explain: 'Reagira na Podove u stanju Pending koji nemaju gdje stati. Čvor na 100 % CPU-a na kojem su svi Podovi smješteni za njega je u redu.' },
            { statement: 'Skaliranje je trenutačno.', fact: false, explain: 'Podovi trebaju sekunde (u simulaciji 11 s), novi čvor minute, a smanjivanje namjerno čeka 300 s.' },
            { statement: 'HPA ne može na nulu.', fact: false, explain: 'U najnovijim verzijama Kubernetesa može (beta), ali samo s metrikama tipa Object ili External – na CPU-u ne, jer Pod kojeg nema nema ni CPU. KEDA nulu radi godinama.' },
            { statement: 'PodDisruptionBudget štiti od pada čvora.', fact: false, explain: 'Štiti samo od dobrovoljnih prekida kroz Eviction API, npr. drain. Kad čvor izgori, Podovi jednostavno nestanu.' },
          ]}
        />
      </Section>

      {/* 11 · recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'HPA svakih 15 s računa ⌈replike × izmjereno / cilj⌉; unutar ±10 % ne mijenja ništa, a od više metrika uzima najveći prijedlog.',
            'Iskorištenost je potrošnja / CPU request: bez CPU requesta HPA je slijep, a krivo postavljen request znači krive odluke.',
            'Gore brzo uz ogradu (+100 % ili +4 Poda u 15 s), dolje tek nakon 300 s – namjerno.',
            'Cluster Autoscaler reagira na Podove u stanju Pending, ne na CPU; novi čvor stiže za nekoliko minuta, pa prve sekunde naleta spašava rezerva.',
            'Potrošače reda skalirajte po dubini reda: KEDA budi 0 → 1, njezin HPA radi 1 ↔ N, a noću ih vraća na 0.',
          ]}
        />
        <Quiz
          questions={[
            {
              q: '4 Poda rade na prosječno 75 % CPU-a, a cilj je 50 %. Koliko replika HPA zatraži?',
              options: ['5', '6', '7', '8'],
              correct: 1,
              explain: '⌈4 × 75 / 50⌉ = ⌈4 × 1,5⌉ = 6. Omjer 1,5 je izvan tolerancije (0,9–1,1), pa HPA mijenja broj replika.',
            },
            {
              q: '9 Podova radi na 52 %, cilj je 50 %. Što radi HPA?',
              options: ['Dodaje jedan Pod', 'Ništa', 'Uklanja jedan Pod', 'Javlja grešku'],
              correct: 1,
              explain: '52 / 50 = 1,04, a tolerancija je ±10 %. HPA ne mijenja ništa – to je ista mrtva zona zbog koje u simulaciji stane na 9.',
            },
            {
              q: (
                <>
                  Naredba <code>kubectl get hpa</code> pokazuje <code>cpu: &lt;unknown&gt;/50%</code>, a Podovi su na 100 % CPU-a. Što je najvjerojatniji uzrok?
                </>
              ),
              options: ['Deployment nema CPU request', 'maxReplicas je premali', 'Cluster Autoscaler je isključen', 'Tolerancija je prevelika'],
              correct: 0,
              explain: 'Bez CPU requesta iskorištenost se ne može izračunati (potrošnja / request), pa HPA javlja <unknown> i FailedGetResourceMetric. Premali maxReplicas pokazao bi postotak, ali ne bi rastao broj replika.',
            },
            {
              q: 'HPA traži 12 Podova: 9 ih je Running, a 3 su Pending s porukom „Insufficient cpu”. Tko će pomoći i kada?',
              options: ['HPA, za 15 s', 'Cluster Autoscaler: doda čvor, spreman za nekoliko minuta', 'Raspoređivač: preseli Podove na manje zauzet čvor', 'Nitko, treba povećati limits'],
              correct: 1,
              explain: 'Pending Pod je upravo signal za Cluster Autoscaler: pregleda klaster svakih 10 s i zatraži novi čvor, a stroj se pokreće minutama. HPA je svoj posao već napravio, a raspoređivač ne seli Podove koji već rade.',
            },
            {
              q: 'Zašto klopa-worker skaliramo po broju poruka u redu, a ne po CPU-u?',
              options: ['CPU se u Podu potrošača ne može mjeriti', 'Potrošač uglavnom čeka, pa CPU ne pokazuje gužvu', 'KEDA reagira brže od HPA-a', 'RabbitMQ ne dopušta HPA'],
              correct: 1,
              explain: 'Potrošač čeka kuhinju i SMS-gateway, pa CPU ne pokazuje gužvu. Broj poruka pokazuje. A kad je potrošača 0, CPU ne postoji – samo vanjska metrika (red) može probuditi Deployment.',
            },
            {
              q: 'Iz prošlog predavanja: što raspoređivač gleda kad odlučuje stane li Pod na čvor?',
              options: ['Stvarnu potrošnju CPU-a na čvoru', 'Zbroj requesta Podova na čvoru', 'Limite Poda', 'Samo broj Podova na čvoru'],
              correct: 1,
              explain: 'Raspoređivač zbraja requeste, ne stvarnu potrošnju. Zato Pod može ostati Pending i kad su čvorovi „prazni” po CPU-u – i zato Cluster Autoscaler gleda Pending Podove, a ne CPU.',
            },
          ]}
        />
      </Section>

      {/* 12 · cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Klopa sama prati ručak: Podovi u sekundama, čvorovi u minutama, bez Davorova ručnog skaliranja u 11:45.',
            'Noću klaster spušta Podove i čvorove, a klopa-worker spava na nuli.',
            'Svaka odluka je zapisana: događaji HPA-a, KEDA-e i Cluster Autoscalera.',
          ]}
          paid={[
            'Prve sekunde naleta i dalje bole: rezervu (minReplicas) plaćamo cijeli dan.',
            'Requests moraju biti točni – inače HPA i raspoređivač odlučuju krivo.',
            'Cluster Autoscaler sam prazni i gasi čvorove: sve što na njima živi mora preživjeti selidbu.',
          ]}
          next="Cluster Autoscaler je noću ispraznio i uklonio jedan čvor. Na njemu je bio Postgres, koji je Iva pokrenula „kao i sve ostalo” – u Deploymentu. Pod se preselio, a ujutro su sve narudžbe nestale."
        />
      </Section>
    </>
  )
}

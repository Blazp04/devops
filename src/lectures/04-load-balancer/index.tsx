import {
  Analogy,
  Badge,
  Callout,
  CodeBlock,
  Compare,
  CostNote,
  DeepDive,
  Figure,
  IncidentCard,
  KeyIdea,
  Mark,
  MarginNote,
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
import { DnsStepper } from './sims/DnsStepper'
import { ManualGame } from './sims/ManualGame'
import { CapacityCard } from './sims/CapacityCard'
import { AlgoLadder } from './sims/AlgoLadder'
import { FlagshipSim } from './sims/FlagshipSim'
import { SlowServer } from './sims/SlowServer'
import { EnvelopeStepper } from './sims/EnvelopeStepper'
import { KeepAliveDemo } from './sims/KeepAliveDemo'
import { RamDuel } from './sims/RamDuel'
import nginxWeight from './code/nginx-weight.conf?raw'
import nginxLeastConn from './code/nginx-least-conn.conf?raw'
import nginxRandomTwo from './code/nginx-random-two.conf?raw'
import envoyLeastRequest from './code/envoy-least-request.yaml?raw'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident + DNS hook */}
      <Section id="incident" kicker="priča" title="Podne u menzi" lead="Tri poslužitelja, a narudžbe i dalje padaju: Mali se guši, a Veliki se dosađuje.">
        <IncidentCard
          no={4}
          when="ponedjeljak, 12:00"
          title="U podne Mali vraća greške, a Veliki radi na četvrtini snage"
          who="davor"
          says={['Tri poslužitelja', 'i opet greške?!']}
          preset="„Incident 12:00” → „Usporedi tri algoritma” (kružno, API, 15 zahtjeva/s, 10 s + 300 s)"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '15' },
            { label: 'p95', value: '3,2 s', tone: 'bad' },
            { label: 'greške', value: '2,8 %', tone: 'bad' },
            { label: 'CPU Mali', value: '98 %', tone: 'warn' },
          ]}
        >
          Klopa ima tri poslužitelja: Mali (1 vCPU, 2 GB), Srednji (2 vCPU, 4 GB) i Veliki (4 vCPU, 8 GB). Od jutros ispred njih stoji load balancer koji zahtjeve dijeli kružno – svakome redom. Mali je na 98 % procesora, a Veliki na 25 %.
        </IncidentCard>
        <p>
          U prošlom predavanju drugi je poslužitelj stajao i čekao jer je DNS sve slao na prvi. Davor je zato najprije u DNS upisao adrese svih triju poslužitelja – to je najjeftiniji pokušaj raspodjele, pa ga pogledajmo prvi.
        </p>
        <DnsStepper />
        <p>
          DNS ne zna ni koliko je koji poslužitelj jak ni je li uopće živ, a odgovor ostaje zapamćen dok mu ne istekne <Term id="ttl">TTL</Term>. Zato je Davor postavio load balancer s najjednostavnijim pravilom – kružnim. U 12:00 ipak je
          zazujao Davorov pager: greške, a Veliki se dosađuje.
        </p>
        <p>
          <strong>Kako dijeliti promet pošteno – i što to uopće znači kad poslužitelji nisu jednaki?</strong>
        </p>
        <StoryMap at="04" />
      </Section>

      {/* 2 · feel the pain */}
      <Section id="rucno" kicker="isprobajte" title="Vi ste load balancer" lead="Prije nego što posao prepustimo programu, odradimo ga sami: zahtjevi čekaju kod redara dok ne odlučite kamo s njima.">
        <p>
          <Term id="load-balancer">Load balancer</Term> stoji ispred poslužitelja. Svi klijenti šalju zahtjeve na njegovu adresu, a on za svaki zahtjev bira poslužitelj koji će ga obraditi – kao redar na ulazu u menzu koji svakog
          studenta s pladnjem šalje na neki pult. Studenti vide samo ulaz, a pultova iza može biti koliko god treba: to je <Term id="horizontal-scaling">horizontalno skaliranje</Term>.
        </p>
        <p>Sada ste redar vi. Promet raste od jednog do šest zahtjeva u sekundi.</p>
        <ManualGame />
        <p>
          Šest zahtjeva u sekundi već je previše za ljudske ruke, a Klopa ih u podne dobiva 15 (a veliki sustavi i stotine tisuća). Zato odluku donosi program – i to po nekom pravilu, <strong>algoritmu raspodjele</strong>. Load
          balancer je onoliko pametan koliko mu pravilo dopušta.
        </p>
        <Analogy
          title="Domaćin u restoranu"
          breaksDown="Domaćin vidi koliko je koji konobar zauzet i koliko je društvo veliko. Load balancer ne vidi ništa od toga: zna samo koliko je zahtjeva kamo poslao i koliko ih još nije završilo, i ono što mu kažu provjere ispravnosti. Koliko je koji zahtjev težak, ne zna."
        >
          Domaćin raspoređuje goste za stolove za dvoje i za osmero. Velika društva ne šalje za mali stol, a kad je jedan konobar zatrpan, nove goste vodi drugome. Isto želimo i od load balancera.
        </Analogy>
      </Section>

      {/* 3 · capacity */}
      <Section id="kapacitet" kicker="koncept" title="Koliko može koji poslužitelj?" lead="Da bismo dijelili pošteno, moramo znati koliko koji poslužitelj stigne – a za to treba razlikovati procesorske jezgre i RAM.">
        <p>
          Klopin API je Django iza gunicorna sa sinkronim <Term id="worker">radnicima</Term> (engl. <em>workers</em>). Jedan radnik obrađuje jedan zahtjev od početka do kraja i zauzima oko 256 MB RAM-a. Tipični zahtjev 200 ms
          računa na procesoru, a 300 ms čeka bazu podataka.
        </p>
        <MarginNote>mozak = jezgra, tanjur = radnik</MarginNote>
        <ul>
          <li>
            <strong>Procesorske jezgre određuju propusnost.</strong> Jedan zahtjev u jednom trenutku računa na najviše jednoj jezgri. Ako treba 200 ms procesora, jedna jezgra obradi najviše 5 takvih zahtjeva u sekundi.
          </li>
          <li>
            <strong>RAM određuje koliko zahtjeva stane istodobno.</strong> Sustav i aplikacija drže oko 0,5 GB, a ostatak dijelimo na radnike od 256 MB: na 2 GB stane 6 radnika, na 4 GB 14, a na 8 GB 30. Kad su svi zauzeti, novi
            zahtjevi čekaju u redu.
          </li>
        </ul>
        <Figure
          caption={
            <>
              Kapacitet je manji od dva broja: koliko stignu jezgre i koliko stignu radnici. Taj manji broj je <Term id="bottleneck">usko grlo</Term>.
            </>
          }
        >
          <CapacityCard />
        </Figure>
        <p>
          Za Klopin API to daje okrugle brojke: <strong>Mali ≈ 5, Srednji ≈ 10, Veliki ≈ 20 zahtjeva u sekundi</strong>. Zajedno oko 35 – ali samo ako svaki dobije promet razmjeran svojoj snazi. Kružno raspoređivanje svakome daje
          trećinu: pri 15 zahtjeva u sekundi Mali dobiva 5, točno koliko može, pa mu se red puni čim se zahtjevi malo zgusnu. Upravo to je incident s početka.
        </p>
        <Callout kind="tip" title="Probajte u kartici">
          Odaberite 4 vCPU / 2 GB: četiri jezgre, a samo 12 zahtjeva u sekundi. Šest radnika ne stigne zaposliti sve jezgre jer svaki 300 od svojih 500 ms samo čeka bazu. Zatim odaberite vrstu I/O (zahtjev uglavnom čeka bazu): 4 vCPU
          / 2 GB pada na 5,7, a 1 vCPU / 8 GB obradi 20. Više jezgri pomaže računanju, više RAM-a čekanju.
        </Callout>
        <Predict
          question="Srednji poslužitelj (2 vCPU, 4 GB) i poslužitelj s 2 vCPU i 8 GB – koji obradi više API zahtjeva u sekundi?"
          options={['Onaj s 8 GB, otprilike dvostruko više', 'Onaj s 8 GB, nešto malo više', 'Jednako, oko 10 u sekundi', 'Onaj s 4 GB, jer manje RAM-a znači brži poslužitelj']}
          correct={2}
          explain={
            <>
              Procesorske jezgre određuju propusnost: 2 × 1000 ms ÷ 200 ms = 10 zahtjeva u sekundi za oba. Dodatnih 16 radnika s 8 GB samo bi čekalo na iste dvije jezgre. RAM pomaže tek kad zahtjevi dugo čekaju bazu – u
              simulaciji prebacite opterećenje na I/O.
            </>
          }
          then="Provjerite odmah ispod, a zatim i u simulaciji (drugi i treći zadatak)."
        />
        <Figure caption="Dva poslužitelja koji se razlikuju samo u RAM-u dobiju potpuno iste zahtjeve. Mozak je procesorska jezgra, tanjur radnik u RAM-u, a hrana na tanjuru zahtjev u obradi.">
          <RamDuel />
        </Figure>
        <DeepDive title="Vrijedi li to i za Node.js ili Go?">
          <p>
            Model s radnicima opisuje poslužitelje koji jedan zahtjev obrađuju jednim procesom ili dretvom: gunicorn sa sinkronim radnicima, PHP-FPM, a donekle i Puma i klasični Java poslužitelji s dretvama. Kod gunicorna i
            PHP-FPM-a broj radnika stvarno se računa iz RAM-a.
          </p>
          <p>
            Asinkroni poslužitelji (Node.js, Go, Pythonov asyncio) jednim procesom drže mnogo zahtjeva u tijeku uz puno manje memorije po zahtjevu, pa ih RAM ograničava mnogo kasnije. Pravilo o jezgrama vrijedi i za njih:{' '}
            <strong>računanje ograničavaju jezgre</strong>.
          </p>
          <p>
            Pod preopterećenjem više RAM-a može čak i odmoći. Poslužitelj s 2 vCPU i 8 GB ima 30 radnika umjesto 14, pa više zahtjeva istodobno dijeli iste dvije jezgre. Svaki traje dulje i više njih ne završi u 5 s (504): pri 12
            zahtjeva u sekundi (seed 42, 5 min prometa) 4 GB obradi 9,6, a 8 GB samo 7,9 zahtjeva u sekundi.
          </p>
        </DeepDive>
      </Section>

      {/* 4 · algorithms */}
      <Section id="algoritmi" kicker="korak po korak" title="Ljestve algoritama" lead="Isti niz zahtjeva, četiri pravila – i četiri različite raspodjele.">
        <p>
          Algoritmi koje nude klasični load balanceri (NGINX, HAProxy, load balanceri u oblaku) uglavnom su varijacije četiriju pravila: <strong>nasumično</strong>, <Term id="round-robin">kružno</Term> (engl. <em>round robin</em>),{' '}
          <Term id="weighted-round-robin">težinsko kružno</Term> i <Term id="least-connections">najmanje aktivnih veza</Term> (engl. <em>least connections</em>). Pošaljimo isti niz od 12 zahtjeva svakim od njih.
        </p>
        <AlgoLadder />
        <KeyIdea>
          Load balancer ne vidi unutar poslužitelja. Zna samo ono što sam broji – koliko je zahtjeva kamo poslao i koliko ih još nije završilo – i ono što mu kažete vi, npr. težine. Zato <strong>pošteno ne znači jednako</strong>: pošteno
          je razmjerno snazi.
        </KeyIdea>
        <DeepDive title="Još tri algoritma: težinski najmanje veza, dva nasumična izbora, najkraće vrijeme odgovora">
          <p>
            Sva tri naći ćete i u simulaciji ispod (dva pod „Napredno”). <Term id="power-of-two-choices">Dva nasumična izbora</Term> posebno su zanimljiva: ne trebaju točan pregled svih poslužitelja. Kad desetak load balancera dijeli iste
            poslužitelje i svaki vidi samo svoje veze, „najmanje veza” sve bi ih poslao na isti prividno najslobodniji poslužitelj, a izbor između dva nasumična to sprječava.
          </p>
          <AlgoLadder advanced />
        </DeepDive>
      </Section>

      {/* 5 · predict + flagship */}
      <Section id="simulacija" kicker="simulacija" title="Load balancer u vašim rukama" lead="Sada imate sve dijelove: promet, poslužitelje koje slažete sami i osam algoritama.">
        <p>
          U simulaciji je Klopin pravi model: zahtjevi stižu nasumično (u prosjeku onoliko u sekundi koliko kaže klizač), a vrijeme pri brzini 1× teče stvarno – 200 ms procesora traje 200 ms. Uspjeh mjerimo{' '}
          <Term id="percentile">percentilima</Term> latencije (samo uspješnih zahtjeva) i greškama, odvojeno po vrsti: <Term id="http-5xx">503</Term> kad su svi radnici zauzeti i red je pun, 504 kad odgovor ne stigne u 5 s (load balancer
          prestane čekati) i 502 kad se proces sruši.
        </p>
        <FlagshipSim />
        <h3>Što ste upravo vidjeli</h3>
        <ul>
          <li>
            Kružno pri 15 zahtjeva u sekundi: Mali na rubu, Veliki na četvrtini snage. Težinsko kružno (1 : 2 : 4) i najmanje veza na istom prometu nemaju grešaka – <Mark>ukupni kapacitet nije bio problem, raspodjela jest</Mark>.
          </li>
          <li>
            „Usporedi tri algoritma” pokazuje zašto prosjek nije dovoljan. Tipičan zahtjev (p50) jedva se pomakne (0,56 → 0,45 s): i kod kružnog dvije trećine prometa ide Srednjem i Velikom. Prosjek kružnog (1,04 s) ne broji
            2,8 % zahtjeva koji su propali, a težinsko kružno i najmanje veza imaju gotovo isti prosjek (0,52 i 0,59 s), iako im se p99 razlikuje za 0,7 s (1,35 prema 2,05 s). Razliku pokazuju tek <strong>p95, p99 i greške</strong>:
            spori rep su upravo studenti koji čekaju ručak.
          </li>
          <li>Load balancer dodaje kapacitet, a ne brzinu: ni na praznom poslužitelju API zahtjev ne traje kraće od vlastitog računanja (u prosjeku 200 ms) i čekanja baze (300 ms).</li>
          <li>„Neograničeni radnici” pokazuju zašto broj radnika mora pratiti RAM: procesu ponestane memorije, operacijski sustav ga ubije (OOM) i load balancer vraća 502.</li>
          <li>
            Zadatak s najjeftinijim poslužiteljima ima kvaku: mjeri samo latenciju i greške. Jedan poslužitelj od 6 vCPU / 8 GB (48 €) prolazi jednako dobro kao 4 vCPU / 4 GB + 2 vCPU / 2 GB (45 €, težinski najmanje
            veza) – ali to je opet jedan stroj o kojem sve ovisi, a ni u paru manji ne može nositi sav promet kad veći padne (predavanja 03 i 05).
          </li>
        </ul>
        <DeepDive title="Što je u simulaciji stvarno, a što pojednostavljeno">
          <ul>
            <li>Stvarno: vrijeme obrade, nasumičnost dolazaka i veličine zahtjeva.</li>
            <li>
              Odabrano za simulaciju: red od 10 mjesta po poslužitelju (kao ograničenje na load balanceru, npr. <code>maxconn</code> u HAProxyju) i odustajanje nakon 5 s{' '}
              <Badge tone="neutral">5 s (sim) · NGINX čeka 60 s</Badge>. U simulaciji tada odustaju i load balancer i student; pravi NGINX studenta koji ranije odustane zapiše kao 499.
            </li>
            <li>
              Sažeto: load balancer provjerava ispravnost poslužitelja svake 2 s <Badge tone="neutral">2 s (sim) · stvarno: 30 s (AWS ALB)</Badge>. Novi poslužitelj dobiva promet tek kad prođe provjere ispravnosti. Kako to
              radi i zašto kasni, vidjet ćemo u sljedećem predavanju.
            </li>
            <li>Pojednostavljeno: put kroz mrežu ne troši vrijeme (u jednom podatkovnom centru to je djelić milisekunde), a baza nikad nije usko grlo. Pladnjevi lete usporeno da bi se vidjeli.</li>
          </ul>
        </DeepDive>
      </Section>

      {/* 6 · slow server */}
      <Section id="uspori" kicker="pokvarite" title="Kad se poslužitelj uspori" lead="Težine se napišu jednom. Što kad se Veliki uspori – a težina mu i dalje kaže „četiri od sedam”?">
        <p>
          Poslužitelji u oblaku dijele fizička računala s drugim korisnicima. Kad susjed na istom stroju zauzme procesor, naš isti posao odjednom traje dulje. Davor je zato napravio pokus: usporio je Velikog tri puta i pustio isti
          promet kroz dva algoritma.
        </p>
        <SlowServer />
        <p>
          Težinsko kružno i dalje šalje Velikom četiri od sedam zahtjeva, iako ih on sada stigne obraditi trostruko manje – red mu se napuni i zahtjevi padaju. Najmanje veza ne zna da je Veliki spor, ali vidi posljedicu: kod njega se
          nakupe nezavršeni zahtjevi, pa novi idu drugima. U dvije minute nakon usporavanja (seed 42) težinsko kružno izgubi 27 % zahtjeva, a najmanje veza 0,1 %.
        </p>
        <MarginNote tone="red">težine vrijede samo za jednu vrstu prometa</MarginNote>
        <p>Težine su dobre za stalne razlike (Mali je zauvijek manji), a „najmanje veza” za promjenjive. Davor iz pokusa izvlači zaključak i Klopu prebacuje na najmanje veza. Ali ni to pravilo nije bez zamke.</p>
        <Callout kind="warn" title="Zamka: crna rupa">
          Poslužitelj koji odmah vraća greške – npr. aplikacija u 2 ms vrati 500 ili proces ne radi pa odbija veze – nema nezavršenih zahtjeva. Za „najmanje veza” izgleda kao najslobodniji – i dobiva sve više prometa, dok ga provjere ispravnosti ne izbace. Koliko to
          traje i koliko narudžbi pritom propadne, gledamo u sljedećem predavanju.
        </Callout>
      </Section>

      {/* 7 · L4 vs L7 */}
      <Section id="l4-l7" kicker="koncept" title="Omotnica: L4 ili L7" lead="Load balanceri se razlikuju po tome koliko duboko gledaju u promet – a o tome ovisi i što zapravo raspoređuju: veze ili zahtjeve.">
        <p>
          Dosad smo pretpostavljali da load balancer odlučuje za svaki zahtjev. To radi <Term id="l4-and-l7-load-balancing">L7 load balancer</Term>, koji razumije HTTP. Brojevi dolaze iz slojevitog modela mreže (OSI): sloj 4 je
          transportni (TCP veze, adrese i portovi), a sloj 7 aplikacijski (HTTP zahtjevi). L4 load balancer zato radi na nižoj razini: vidi samo TCP veze, tj. adrese i portove.
        </p>
        <EnvelopeStepper />
        <p>
          Razlika je najvidljivija kad klijent drži jednu <Term id="keep-alive">trajnu vezu</Term>, kao preglednik koji Klopu otvara preko HTTP/2. Pogledajmo isti promet iza L4 i iza L7 load balancera.
        </p>
        <KeepAliveDemo />
        <Compare
          left={{
            title: 'L4 load balancer',
            tone: 'blue',
            points: ['Vidi IP adrese i portove (omotnicu).', 'Odlučuje jednom po vezi; trajna veza ostaje na istom poslužitelju.', 'Ne čita HTTP; šifrirani promet obično samo propušta – brz je i jednostavan.', 'Primjeri: AWS Network Load Balancer, Kubernetes Service.'],
          }}
          right={{
            title: 'L7 load balancer',
            tone: 'violet',
            points: [
              'Čita HTTP: putanju, zaglavlja, kolačiće (otvara omotnicu).',
              'Odlučuje za svaki zahtjev.',
              <>
                Usmjerava po putanji, ponavlja neuspjele zahtjeve, radi <Term id="tls-termination">terminaciju TLS-a</Term>.
              </>,
              'Primjeri: NGINX, HAProxy, Envoy, AWS Application Load Balancer.',
            ],
          }}
        />
        <Callout kind="fact" title="Kubernetes Service nije nijedan od ovih algoritama">
          Kubernetes Service (kube-proxy u zadanom načinu iptables ili u načinu nftables) za svaku novu vezu bira nasumičnu spremnu kopiju aplikacije (u Kubernetesu je to Pod, predavanje 12) – bez težina i bez pojma o
          veličini stroja. Preskače kopije koje nisu spremne (ne prolaze provjeru spremnosti). Algoritme rr, wrr, lc i wlc nudi način ipvs, koji je zastario (od verzije 1.35) i bit će uklonjen (stanje: listopad 2026.). Na to se
          vraćamo u predavanju 14.
        </Callout>
      </Section>

      {/* 8 · code */}
      <Section id="kod" kicker="kod" title="Algoritam je jedan redak" lead="Sve što ste u simulaciji birali gumbima, u NGINX-u je jedna direktiva u bloku upstream.">
        <p>
          NGINX je web-poslužitelj koji vrlo često radi i kao L7 load balancer. Popis poslužitelja zove se <code>upstream</code>; naši poslužitelji slušaju na portu <code>8000</code> na adresama <code>10.0.0.11</code>–<code>13</code>.
          Bez ikakve direktive NGINX raspoređuje težinsko kružno – a ako težine ne navedete, sve su 1, pa je to obično kružno.
        </p>
        <Tabs
          tabs={[
            {
              label: 'weight',
              content: (
                <CodeBlock
                  title="klopa.conf"
                  lang="nginx"
                  code={nginxWeight}
                  highlight="4-6"
                  caption="Težinsko kružno 1 : 2 : 4, razmjerno kapacitetu poslužitelja (5, 10 i 20 zahtjeva u sekundi)."
                  notes={[
                    { lines: '2', text: 'upstream: popis poslužitelja iza load balancera' },
                    { lines: '4-6', text: 'weight: Veliki dobiva 4 od svakih 7 zahtjeva' },
                    { lines: '14', text: 'svaki zahtjev ide na popis klopa_api' },
                    { lines: '15', text: 'X-Upstream otkriva tko je odgovorio' },
                  ]}
                />
              ),
            },
            {
              label: 'least_conn',
              content: (
                <CodeBlock
                  title="klopa.conf"
                  lang="nginx"
                  code={nginxLeastConn}
                  highlight="4"
                  caption="Najmanje veza. NGINX pritom uzima u obzir i težine – to je naš „težinski najmanje veza”."
                  notes={[
                    { lines: '3', text: 'zajednički brojači veza za sve procese NGINX-a' },
                    { lines: '4', text: 'novi zahtjev ide onome s najmanje veza ÷ težina' },
                  ]}
                />
              ),
            },
            {
              label: 'random two',
              content: (
                <CodeBlock
                  title="klopa.conf"
                  lang="nginx"
                  code={nginxRandomTwo}
                  highlight="4"
                  caption="Dva nasumična izbora: izvuku se dva poslužitelja, a zahtjev ide onome s manje aktivnih veza."
                  notes={[{ lines: '4', text: 'za više load balancera ispred istih poslužitelja' }]}
                />
              ),
            },
          ]}
        />
        <Terminal
          title="Lanin laptop"
          lines={[
            { comment: 'Sedam zahtjeva zaredom na load balancer s težinama 1 : 2 : 4' },
            { cmd: 'for i in $(seq 7); do curl -s -o /dev/null -D - http://klopa.example/api/jelovnik | grep -i x-upstream; done' },
            {
              out: 'X-Upstream: 10.0.0.13:8000\nX-Upstream: 10.0.0.12:8000\nX-Upstream: 10.0.0.13:8000\nX-Upstream: 10.0.0.11:8000\nX-Upstream: 10.0.0.13:8000\nX-Upstream: 10.0.0.12:8000\nX-Upstream: 10.0.0.13:8000',
              note: 'Veliki (.13) 4×, Srednji 2×, Mali 1× – i isprepleteno',
              who: 'lana',
            },
          ]}
        />
        <Callout kind="fact" title="Zadani algoritmi (stanje: listopad 2026.)">
          <ul>
            <li>
              NGINX: težinsko kružno; uz to <code>least_conn</code>, <code>ip_hash</code>, <code>hash … consistent</code> i <code>random two least_conn</code>.
            </li>
            <li>
              HAProxy: kružno (<code>balance roundrobin</code>); uz to <code>leastconn</code>, <code>source</code>, <code>uri</code> i drugi.
            </li>
            <li>AWS Application Load Balancer: kružno; uz to „najmanje nezavršenih zahtjeva” i težinski nasumično.</li>
            <li>
              Envoy: kružno; <code>LEAST_REQUEST</code> uz jednake težine radi „dva nasumična izbora”.
            </li>
          </ul>
        </Callout>
        <DeepDive title="Isto u Envoyu: LEAST_REQUEST">
          <p>
            Envoy je L7 proxy koji ćete sresti ispod mnogih Gatewaya i servisnih mreža. Algoritam se bira poljem <code>lb_policy</code> u Envoyevu bloku <code>cluster</code> (popis poslužitelja, kao{' '}
            <code>upstream</code> u NGINX-u).
          </p>
          <CodeBlock
            title="envoy.yaml"
            lang="yaml"
            code={envoyLeastRequest}
            mode="closed"
            caption="Blok cluster klopa_api s algoritmom LEAST_REQUEST: uz jednake težine Envoy izvuče dva poslužitelja i bira onaj s manje aktivnih zahtjeva."
            notes={[{ lines: '7', text: 'LEAST_REQUEST = dva nasumična izbora' }]}
          />
        </DeepDive>
      </Section>

      {/* 9 · myths, recap, quiz */}
      <Section id="provjera" kicker="provjera" title="Mitovi, sažetak i provjera">
        <MythOrFact
          items={[
            {
              statement: 'Kružno raspoređivanje je pošteno.',
              fact: false,
              explain: 'Svakome daje jednako, a ne zna ni koliko je koji poslužitelj jak ni koliko je koji zahtjev težak. Mali i Veliki dobiju po trećinu: Mali se guši, Veliki se dosađuje.',
            },
            {
              statement: 'Load balancer ubrzava svaki zahtjev.',
              fact: false,
              explain: 'Dodaje kapacitet – više zahtjeva u sekundi bez čekanja u redu – i jedan skok više na putu. Pojedini zahtjev ne traje kraće od svog računanja i čekanja baze.',
            },
            {
              statement: 'Više RAM-a znači veću propusnost.',
              fact: false,
              explain: 'RAM određuje koliko zahtjeva stane istodobno, a jezgre koliko ih se obradi. 2 vCPU / 4 GB i 2 vCPU / 8 GB obrade isto, oko 10 API zahtjeva u sekundi.',
            },
            {
              statement: 'Promet se uvijek raspoređuje po zahtjevu.',
              fact: false,
              explain: 'L4 load balancer (i Kubernetes Service) raspoređuje veze. Klijent s jednom trajnom vezom sve zahtjeve šalje istom poslužitelju.',
            },
            {
              statement: 'Najmanje veza je uvijek najbolji algoritam.',
              fact: false,
              explain: 'Poslužitelj koji odmah vraća greške nema nezavršenih zahtjeva, pa izgleda najslobodniji i dobiva najviše prometa – crna rupa (predavanje 05).',
            },
            {
              statement: 'Težine u težinskom kružnom raspoređivanju same se ne mijenjaju kad se poslužitelj uspori.',
              fact: true,
              explain: 'Težine su statične: zadaje ih čovjek (ili skripta). Usporeni Veliki i dalje dobiva 4/7 prometa dok ih netko ne promijeni.',
            },
          ]}
        />
        <Recap
          points={[
            'Load balancer je jedna adresa ispred više poslužitelja. Dodaje kapacitet (propusnost), a ne brzinu pojedinog zahtjeva.',
            'Procesorske jezgre određuju propusnost, a RAM koliko zahtjeva stane istodobno. Kapacitet je manji od ta dva broja.',
            'Kružno ne zna da su poslužitelji različiti. Težinsko popravlja stalne razlike, a najmanje veza prati stvarno opterećenje – uz zamku crne rupe.',
            'Algoritme uspoređujemo po p95, p99 i greškama na istom prometu, a ne po prosjeku.',
            'L4 raspoređuje veze, L7 zahtjeve. Trajna veza iza L4 load balancera ostaje na jednom poslužitelju.',
          ]}
        />
        <Quiz
          questions={[
            {
              q: 'Ponedjeljak u podne: p95 3,2 s i 2,8 % grešaka. Nadzorna ploča: Mali CPU 98 %, Srednji 51 %, Veliki 25 %. Load balancer raspoređuje kružno. Što je najvjerojatniji uzrok?',
              options: ['Ukupni kapacitet je premalen za podnevni promet.', 'Raspodjela ne prati snagu poslužitelja: svi dobivaju trećinu.', 'Velikom nedostaje RAM-a za radnike.', 'Load balancer ne stiže proslijediti sve zahtjeve.'],
              correct: 1,
              explain:
                'Veliki je na 25 % – ukupnog kapaciteta ima dovoljno. Četvrti poslužitelj pomogao bi samo zato što bi Mali dobio četvrtinu prometa umjesto trećine, a to je skuplje rješenje istog problema. Kružno svakome šalje 5 zahtjeva u sekundi, a Mali toliko jedva stiže. Težinsko kružno (1 : 2 : 4) ili najmanje veza na istom prometu nemaju grešaka.',
            },
            {
              q: 'Poslužitelj s 2 vCPU i 4 GB obrađuje API zahtjeve (200 ms procesora, 300 ms čekanja baze). Što se dogodi s propusnošću ako mu RAM povećamo na 8 GB?',
              options: ['Ostaje oko 10 zahtjeva u sekundi.', 'Udvostruči se na oko 20.', 'Raste razmjerno broju radnika, s 14 na 30.', 'Pada na nulu dok se poslužitelj ne pokrene ponovno.'],
              correct: 0,
              explain: '2 jezgre × 1000 ms ÷ 200 ms = 10 zahtjeva u sekundi. Dodatni radnici samo čekaju na iste dvije jezgre. RAM bi pomogao zahtjevima koji uglavnom čekaju bazu.',
            },
            {
              q: 'Kružno: prosječna latencija 1,04 s. Težinsko kružno na istom prometu: 0,52 s. Što prosjek ovdje ne pokazuje?',
              options: [
                'Da je kružno brže za većinu studenata.',
                'Da kod kružnog 5 % uspješnih zahtjeva traje dulje od 3,2 s, a 2,8 % zahtjeva uopće ne uspije.',
                'Da težinsko kružno ima više grešaka.',
                'Ništa – prosjek je dovoljna mjera.',
              ],
              correct: 1,
              explain: 'Prosjek ne vidi rep ni greške: neuspjeli zahtjevi u njega i ne ulaze. Zato gledamo p95, p99 i greške odvojeno (simulacija: „Usporedi tri algoritma”, seed 42).',
            },
            {
              q: 'Procesor Velikog uspori se tri puta (bučni susjed). Koji algoritam sam od sebe smanji promet prema njemu?',
              options: ['Kružno', 'Težinsko kružno s težinama 1 : 2 : 4', 'Najmanje veza', 'Nijedan – load balancer ne zna da je Veliki spor'],
              correct: 2,
              explain: 'Najmanje veza ne zna da je Veliki spor, ali vidi da kod njega ostaje više nezavršenih zahtjeva, pa novi idu drugima. Težinsko kružno mu i dalje šalje 4/7 prometa.',
            },
            {
              q: 'Preglednik otvori jednu HTTP/2 vezu i njome šalje sve zahtjeve. Ispred tri poslužitelja stoji L4 load balancer. Kako će se ti zahtjevi rasporediti?',
              options: ['Ravnomjerno, trećina svakome.', 'Svi na isti poslužitelj.', 'Svaki na nasumično odabran poslužitelj.', 'Svaki na trenutačno najmanje zauzet poslužitelj.'],
              correct: 1,
              explain: 'L4 load balancer vidi samo vezu i odlučuje jednom, kad se ona otvara. Za raspodjelu po zahtjevima treba L7 load balancer – ili više veza.',
            },
            {
              q: 'Podsjetnik iz prošlih predavanja: zašto Klopi nije bilo dovoljno samo kupiti još jači poslužitelj?',
              options: [
                'Jači poslužitelj u oblaku košta eksponencijalno više.',
                'I najjači stroj ima strop i ostaje jedinstvena točka kvara.',
                'Jači poslužitelj traži drukčiji kod aplikacije.',
                'Jači procesor ne može raditi s bazom podataka.',
              ],
              correct: 1,
              explain:
                'Vertikalno skaliranje je jednostavno i često dobar prvi korak, ali ima strop i ostavlja jedno računalo o kojem sve ovisi. Cijena u oblaku raste otprilike razmjerno veličini. Horizontalno skaliranje rješava oba problema – uz load balancer.',
            },
          ]}
        />
      </Section>

      {/* 10 · cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Tri poslužitelja zajedno obrade oko 35 zahtjeva u sekundi; uz težine 1 : 2 : 4 podne prolazi bez grešaka.',
            'Studenti znaju samo jednu adresu – poslužitelje dodajemo i mijenjamo iza nje.',
            'Algoritam biramo prema poslužiteljima i prometu, a uspjeh mjerimo p95 i greškama.',
          ]}
          paid={[
            'Load balancer je nova jedinstvena točka kvara – a tko čuva njega?',
            'Load balancer za pad poslužitelja doznaje tek iz provjera ispravnosti, sekundama kasnije.',
            'Košarica živi u memoriji poslužitelja, a sljedeći zahtjev može završiti na drugom.',
          ]}
          next={
            <>
              S težinskim raspoređivanjem ručak je preživio, a nakon pokusa „Sporiji procesor” Davor je prešao na „najmanje veza”. Ali u 12:03 procesu na Velikom ponestane memorije i sruši se, a load balancer mu još
              nekoliko sekundi šalje narudžbe. Usto, studenti se žale: „Košarica mi se sama ispraznila!”
            </>
          }
        />
      </Section>
    </>
  )
}

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
  Myth,
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  Section,
  StoryMap,
  Term,
  Terminal,
} from '../../kit'
import { LbSprawl } from './sims/LbSprawl'
import { CrdStepper } from './sims/CrdStepper'
import { RolesChain } from './sims/RolesChain'
import { RuleMatcher } from './sims/RuleMatcher'
import { TlsWeightsStepper } from './sims/TlsWeightsStepper'
import { GatewaySim } from './sims/GatewaySim'
import { IngressTimeline } from './sims/IngressTimeline'
import installSh from './code/install.sh?raw'
import gatewayClassYaml from './code/gatewayclass.yaml?raw'
import gatewayYaml from './code/gateway.yaml?raw'
import httprouteYaml from './code/httproute.yaml?raw'
import ingressYaml from './code/ingress.yaml?raw'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section id="incident" kicker="priča" title="Tri vrata, tri računa" lead="Unutar klastera sve se nalazi po imenu. Ali studenti dolaze izvana – a Davorova prva ideja košta triput.">
        <IncidentCard
          no={15}
          when="utorak, 10:20"
          title={
            <>
              Tri LoadBalancera, a <code>/api</code> i dalje završava na webu
            </>
          }
          who="davor"
          says={['Tri adrese,', 'tri računa…', 'i opet 404!']}
          preset="„Tri LoadBalancera” (ulaz: 3 × LoadBalancer, prvih 60 s)"
          seed={15}
          metrics={[
            { label: 'javne adrese', value: '3', tone: 'warn' },
            { label: 'load balanceri (procjena)', value: '54 €/mj.', tone: 'warn' },
            { label: 'HTTPS', value: 'nema', tone: 'bad' },
            { label: 'greške 404', value: '44 %', tone: 'bad' },
          ]}
        >
          Davor je za web, API i administraciju napravio tri Servicea vrste LoadBalancer. Domena <code>klopa.example</code> vodi na load balancer weba, a frontend API zove na istoj domeni, na <code>/api/…</code> – i dobiva 404. HTTPS-a
          nema nigdje.
        </IncidentCard>
        <p>
          Load balancer koji dobijemo uz LoadBalancer Service radi na razini L4 (sjetite se <Term id="l4-and-l7-load-balancing">L4 i L7</Term> iz 4. predavanja): vidi IP adresu i port, a ne domenu ni putanju. Zato ne može poslati{' '}
          <code>klopa.example/api/narudzbe</code> na drugi Service nego <code>klopa.example/</code>. A za HTTPS bi certifikat trebalo postaviti i obnavljati na svakom od triju mjesta.
        </p>
        <p>
          Vodič (engl. <em>tutorial</em>) koji je Davor pronašao rješava to Ingressom i kontrolerom ingress-nginx – a taj je kontroler u ožujku 2026. umirovljen. Na kraju predavanja vidjet ćemo što to znači za klastere koji ga još koriste.
        </p>
        <p>
          <strong>Kako sav promet izvana pustiti kroz jedna vrata i pametno ga rasporediti?</strong>
        </p>
      </Section>

      {/* 2 · scene 1: why not one LB per Service */}
      <Section id="jedna-vrata" kicker="isprobajte" title="Zašto ne LoadBalancer za svaki Service" lead="Svaka aplikacija izvana znači novu adresu, novi račun i novo mjesto za certifikat. Pomaknite klizač i usporedite.">
        <LbSprawl />
        <p>
          Rješenje je jedan <strong>L7 ulaz</strong>: proxy koji razumije HTTP. Stoji iza jednog load balancera (jedna adresa, jedan račun), završava HTTPS i za svaki zahtjev čita domenu, putanju i zaglavlja. U Kubernetesu takav ulaz
          opisujemo <Term id="gateway-api">Gateway API-jem</Term>.
        </p>
        <MarginNote>Service je ovdje popis Podova, ne put.</MarginNote>
        <p>
          Pogledajte gornji crtež (put jednog zahtjeva). Pravilo imenuje Service, ali većina implementacija (Envoy Gateway, Istio, NGINX Gateway Fabric, Cilium, Traefik) Service koristi samo kao popis: iz njegova{' '}
          <Term id="endpointslice">EndpointSlicea</Term> pročita adrese spremnih Podova i svaki zahtjev pošalje <strong>izravno na IP adresu Poda</strong>, svojim algoritmom raspodjele (npr. kružno ili „najmanje zahtjeva u obradi” –
          ovisi o implementaciji). Algoritmi iz 4. predavanja tu se vraćaju. kube-proxy i njegov nasumični izbor po vezi i dalje vrijede za promet unutar klastera, preko ClusterIP-a.
        </p>
        <Myth myth="Promet kroz Gateway prolazi kroz ClusterIP.">
          Većina implementacija čita EndpointSlice i svaki zahtjev šalje ravno na IP adresu Poda. ClusterIP i kube-proxy služe prometu unutar klastera.
        </Myth>
        <Analogy
          title="Gradska vrata"
          breaksDown="Vrata samo usmjeravaju: ne vode trgovine u gradu (to rade Podovi). I natpise ne piše jedna osoba – vrata postavlja Davor, a natpise za svoju četvrt piše svaki tim."
        >
          Stari grad ima jedna gradska vrata, a ne zasebna vrata za svaku ulicu. Stražar na vratima pogleda kamo idete – u koju četvrt i ulicu (domena i putanja) – i uputi vas pravim putem.
        </Analogy>
        <KeyIdea>
          Promet izvana ulazi kroz <strong>jedna vrata</strong> (Gateway), a <strong>pravila koja pišu timovi aplikacija</strong> (HTTPRoute) za svaki zahtjev odlučuju kojem Serviceu pripada – i (u većini implementacija) šalju ga izravno na spreman Pod.
        </KeyIdea>
      </Section>

      {/* 3 · scene 2: an add-on */}
      <Section id="dodatak" kicker="kubernetes" title="Dodatak, a ne ugrađeni dio" lead="Gateway API se instalira: CRD-ovi dodaju nove vrste u API, a kontroler im daje život.">
        <p>
          Kubernetes sam po sebi ne zna što je Gateway. Gateway API je <strong>dodatak</strong> u dva dijela. Prvi su <Term id="crd">CRD-ovi</Term>: definicije novih vrsta objekata (GatewayClass, Gateway, HTTPRoute…). Drugi je{' '}
          <strong>kontroler</strong> – program koji te objekte gleda i ostvaruje, isto kao što kontroler Deploymenta ostvaruje broj replika.
        </p>
        <CrdStepper />
        <MarginNote>CRD = nova riječ; kontroler = netko tko je razumije</MarginNote>
        <p>
          Kontrolera ima mnogo i svi razumiju iste objekte: Envoy Gateway, NGINX Gateway Fabric, Traefik, Cilium, Istio, Kong, a i upravljani klasteri u oblaku imaju svoje. U ovom tečaju Klopa koristi Envoy Gateway; YAML koji pišemo radio bi i s
          drugima – promijenio bi se samo GatewayClass.
        </p>
        <Terminal
          title="Davorov laptop · instalacija"
          lines={[
            { cmd: 'kubectl get gatewayclass', prompt: 'davor@klopa:~$' },
            { out: 'error: the server doesn\'t have a resource type "gatewayclass"', tone: 'bad' },
            { comment: 'instaliramo CRD-ove i kontroler (install.sh ispod)' },
            { cmd: 'kubectl get gatewayclass', prompt: 'davor@klopa:~$' },
            { out: 'NAME   CONTROLLER                                      ACCEPTED   AGE' },
            { out: 'eg     gateway.envoyproxy.io/gatewayclass-controller   True       40s', note: 'ACCEPTED True: kontroler je preuzeo ovu vrstu vrata.', who: 'davor' },
          ]}
        />
        <CodeBlock
          title="install.sh"
          lang="bash"
          code={installSh}
          caption="CRD-ovi (ili ih donosi kontroler), kontroler, pa GatewayClass."
          notes={[
            { lines: '1-4', text: 'Standard kanal; za kontrolere bez svojih CRD-ova' },
            { lines: '9-10', text: 'Envoy Gateway: CRD-ovi i kontroler zajedno' },
          ]}
        />
        <Callout kind="fact" title="Verzije (stanje: listopad 2026.)">
          Gateway API je stabilan (GA) od verzije v1.0, 31. listopada 2023. Trenutačna je v1.6.2; v1.6.0 (lipanj 2026.) premjestio je TCPRoute i UDPRoute u Standard kanal. Envoy Gateway 1.9.2, NGINX Gateway Fabric 2.7.2 i Traefik 3.7.13
          neke su od trenutačnih implementacija.
        </Callout>
      </Section>

      {/* 4 · scene 3: roles */}
      <Section id="uloge" kicker="koncept" title="Tko piše koji dio" lead="Vrsta vrata, vrata i pravila imaju različite vlasnike – zato su to tri različita objekta.">
        <p>
          Lanac ide od apstraktnog prema konkretnom: <Term id="gatewayclass">GatewayClass</Term> kaže koji kontroler gradi vrata, Gateway su sama vrata, <Term id="httproute">HTTPRoute</Term> su pravila, a pravila vode na Service i
          njegove Podove. Veze su zapisane u samim objektima: Gateway imenuje svoj GatewayClass (<code>gatewayClassName</code>), ruta imenuje Gateway (<code>parentRefs</code>) i Service (<code>backendRefs</code>), a Service svoje Podove
          bira oznakama (<code>selector</code>).
        </p>
        <RolesChain />
        <p>
          Usporedite to s 4. predavanjem: tamo je load balancer imao jednu konfiguracijsku datoteku i jednog vlasnika. Ovdje Davor drži vrata – adresu, slušatelje, certifikat i tko se smije vezati – a Lana sama dodaje putanje za Klopu.
          Ruta vrijedi tek kad je Gateway prihvati: <code>parentRefs</code> na ruti je molba, a <code>allowedRoutes</code> na Gatewayu odluka.
        </p>
        <DeepDive title="Rute iz drugog Namespacea i ReferenceGrant">
          <p>
            Prema zadanim postavkama Gateway prima rute samo iz svojeg Namespacea (<code>allowedRoutes.namespaces.from: Same</code>). Davor može dopustiti <code>All</code> (svaki Namespace) ili samo Namespace s određenom oznakom (
            <code>Selector</code>) – tako jedna vrata mogu služiti više timova.
          </p>
          <p>
            Obrnuti smjer čuva ReferenceGrant: ako ruta želi poslati promet na Service u <em>drugom</em> Namespaceu, ili Gateway želi certifikat iz Secreta u drugom Namespaceu, vlasnik tog Namespacea mora to izričito dopustiti objektom
            ReferenceGrant. Bez njega referenca ne vrijedi (ResolvedRefs=False, razlog RefNotPermitted).
          </p>
        </DeepDive>
      </Section>

      {/* 5 · scene 4: routing rules */}
      <Section id="pravila" kicker="koncept" title="Koje pravilo vrijedi?" lead="Domena, putanja i zaglavlje – i jednostavno načelo prednosti: preciznije pravilo pobjeđuje.">
        <Predict
          question={
            <>
              Lana na <code>klopa.example</code> ima dva pravila, ovim redom: <code>PathPrefix /</code> → klopa-web i <code>PathPrefix /api</code> → klopa-api. Kamo ide <code>GET /api/jelovnik</code>?
            </>
          }
          options={['na klopa-web – prvo pravilo na popisu pobjeđuje', 'na klopa-api – dulji prefiks je precizniji', 'naizmjence, pola-pola', '404 – odgovaraju dva pravila, pa ne vrijedi nijedno']}
          correct={1}
          explain={
            <>
              Redoslijed na popisu odlučuje tek kad su pravila jednako precizna. <code>/api</code> je dulji prefiks od <code>/</code>, pa pobjeđuje bez obzira na to gdje je napisan.
            </>
          }
          then="Provjerite u alatu ispod."
        />
        <p>Gateway za svaki zahtjev ovim redom traži pravilo:</p>
        <ol>
          <li>
            <strong>Domena.</strong> Ruta s točnom domenom (<code>admin.klopa.example</code>) ima prednost pred zamjenskim znakom (engl. <em>wildcard</em>, <code>*.klopa.example</code>). Zamjenski znak obuhvaća poddomene, ali ne i sam <code>klopa.example</code>.
          </li>
          <li>
            <strong>Točna putanja</strong> (<code>Exact</code>) pobjeđuje svaki prefiks.
          </li>
          <li>
            Između prefiksa pobjeđuje <strong>dulji</strong>.
          </li>
          <li>
            Ako je i to izjednačeno, pobjeđuje pravilo s <strong>više uvjeta na zaglavljima</strong>.
          </li>
          <li>
            Ne odgovara nijedno – Gateway vraća <strong>404</strong>.
          </li>
        </ol>
        <Callout kind="tip" title="PathPrefix gleda cijele dijelove putanje">
          <code>/api</code> hvata <code>/api</code> i <code>/api/narudzbe</code>, ali ne i <code>/apix</code>: prefiks se uspoređuje dio po dio, između kosih crta.
        </Callout>
        <RuleMatcher />
        <DeepDive title="Potpuna pravila prednosti">
          <p>
            Specifikacija Gateway API-ja propisuje redoslijed: točna putanja, pa najdulji prefiks, pa podudarna HTTP metoda, pa najviše podudarnih zaglavlja, pa najviše podudarnih parametara upita. Ako je i dalje neriješeno, prednost ima
            starija ruta (po vremenu stvaranja), pa ruta koja je prva po abecedi (<code>namespace/ime</code>), a unutar jedne rute prvo pravilo na popisu.
          </p>
          <p>
            Neki rubni slučajevi ovise o implementaciji – na primjer putanje zadane regularnim izrazom, ili hoće li se zahtjev za <code>admin.klopa.example</code> koji ne odgovara nijednom pravilu točne rute pokušati s rutom za{' '}
            <code>*.klopa.example</code>. Simulacija u ovom predavanju radi kao uobičajene implementacije: ne pokušava, nego vraća 404.
          </p>
        </DeepDive>
      </Section>

      {/* 6 · scene 5: TLS and weights */}
      <Section id="tls-i-tezine" kicker="sigurnost" title="HTTPS na ulazu, težine iza njega" lead="Certifikat živi u Secretu, TLS završava na vratima, a promet se dijeli zahtjev po zahtjev.">
        <p>
          Lana ima malu ispravku API-ja, verziju 1.4.1, i želi je najprije pustiti na 10 % zahtjeva. Za to ne treba mijenjati broj Podova, nego težine u ruti. A Petra želi da Klopa napokon radi preko HTTPS-a.
        </p>
        <TlsWeightsStepper />
        <p>
          Certifikat i privatni ključ stoje u objektu <Term id="secret">Secret</Term> vrste <code>kubernetes.io/tls</code>, u istom Namespaceu kao Gateway; za Secret iz drugog Namespacea treba ReferenceGrant. Završavanje HTTPS-a na
          ulazu zove se <Term id="tls-termination">terminacija TLS-a</Term>. Što je točno Secret i tko ga smije pročitati, tema je 16. predavanja. Certifikate obično ne izdajemo ručno: alat cert-manager sam ih nabavlja i obnavlja.
        </p>
        <p>
          Težine (<code>weight</code>) su omjer, a ne postotci: 90 i 10 znači isto što i 9 i 1. Svako odredište (engl. <em>backend</em>) dobiva svoju težinu podijeljenu zbrojem svih težina, i to se bira za <strong>svaki zahtjev</strong> posebno.
          Težina 0 znači da to odredište ne dobiva ništa – zgodno za brzo isključivanje nove verzije.
        </p>
        <p>
          Zato su to dva Servicea s odvojenim selektorima: <code>klopa-api</code> bira samo Podove 1.4.0 (oznaka <code>version: 1.4.0</code>), a <code>klopa-api-141</code> samo Pod 1.4.1. Da <code>klopa-api</code> bira sve Podove s{' '}
          <code>app: klopa-api</code>, Pod 1.4.1 dobivao bi i dio od onih 90 % – ukupno oko 32 % zahtjeva umjesto 10 %.
        </p>
      </Section>

      {/* 7 · flagship */}
      <Section id="simulacija" kicker="simulacija" title="Gradska vrata" lead="Sve zajedno: mješoviti promet, jedna vrata i pravila koja slažete sami.">
        <p>
          Simulacija kreće od incidenta s početka. Prebacite ulaz na <strong>Gateway</strong> i riješite zadatke; svaki se sam označi kvačicom kad promet desetak sekundi teče kako treba. Svaki pladanj je jedan zahtjev: zeleni lokot na pladnju
          znači da putuje preko HTTPS-a, a plava točka da nosi zaglavlje <code>x-beta: 1</code>. Kad sve radi, pokvarite nešto gumbima „Pokvarite”.
        </p>
        <GatewaySim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              Bez Gatewaya L4 load balancer ne vidi putanju: svi zahtjevi na <code>/api</code> završili su na webu s 404 – u prvih 60 s to je bilo 44 % svih zahtjeva.
            </li>
            <li>
              Kad obrišete pravilo za <code>/api</code>, zahtjeve hvata prefiks <code>/</code> i šalje ih webu – Gateway radi točno ono što piše, a aplikacija vraća 404.
            </li>
            <li>Krivi Secret ruši HTTPS za sve: slušatelj https nije programiran i nijedno rukovanje ne uspijeva.</li>
            <li>
              Pogrešno ime u <code>backendRefs</code>: ruta dobiva ResolvedRefs=False, a 500 dobivaju zahtjevi koji bi išli na to (nepostojeće) odredište – kod 90 / 10 to je oko 90 % prometa na <code>/api</code>.
            </li>
            <li>Težine se biraju za svaki zahtjev; u prozoru od 20 s udio 1.4.1 pleše oko 10 %, a zbirno, od zadnje promjene pravila, sve mu se više približava.</li>
          </ul>
        </Callout>
      </Section>

      {/* 8 · code */}
      <Section id="kod" kicker="yaml" title="Gateway i HTTPRoute u datotekama" lead="Ono što ste složili u simulaciji, u datotekama koje Klopa drži u repozitoriju.">
        <p>Tri datoteke, tri vlasnika. GatewayClass je kratka i piše se jednom:</p>
        <CodeBlock title="gatewayclass.yaml" code={gatewayClassYaml} mode="closed" caption="Pružatelj infrastrukture: vrsta vrata i kontroler koji ih gradi." />
        <CodeBlock
          title="gateway.yaml"
          code={gatewayYaml}
          caption="Davorova vrata: dva slušatelja, certifikat iz Secreta i tko se smije vezati."
          previewLines={24}
          notes={[
            { lines: '8', text: 'ime GatewayClassa: tko gradi vrata' },
            { lines: '13-15', text: 'HTTPS slušatelj na portu 443' },
            { lines: '17-20', text: 'TLS završava ovdje; Secret kubernetes.io/tls' },
            { lines: '21-23', text: 'rute se smiju vezati samo iz Namespacea klopa' },
          ]}
        />
        <CodeBlock
          title="httproute.yaml"
          code={httprouteYaml}
          caption="Lanina pravila: beta testeri, 90 / 10 na /api, sve ostalo webu – i preusmjeravanje s :80 na https."
          previewLines={40}
          notes={[
            { lines: '8-10', text: 'veži se na Gateway, samo na slušatelj https' },
            { lines: '18-20', text: 'x-beta: 1 → uvijek nova verzija' },
            { lines: '28-34', text: 'težine 90 / 10, bira se za svaki zahtjev' },
            { lines: '35-41', text: 'prefiks / hvata sve ostalo' },
            { lines: '74-78', text: ':80 samo preusmjerava na https://' },
          ]}
        />
        <p>Kad nešto ne radi, prvo pogledajte stanje objekata – Gateway i ruta u statusu pišu što im smeta:</p>
        <Terminal
          title="Lanin laptop · dijagnoza"
          lines={[
            { cmd: 'kubectl get gateway -n klopa' },
            { out: 'NAME       CLASS   ADDRESS        PROGRAMMED   AGE' },
            { out: 'klopa-gw   eg      203.0.113.25   True         3m' },
            { cmd: 'kubectl get httproute -n klopa' },
            { out: 'NAME                    HOSTNAMES                                   AGE' },
            { out: 'klopa                   ["klopa.example"]                           2m' },
            { out: 'klopa-admin             ["admin.klopa.example"]                     2m' },
            { out: 'klopa-http-preusmjeri   ["klopa.example","admin.klopa.example"]     2m' },
            { cmd: 'kubectl describe httproute klopa -n klopa' },
            { comment: '… u odjeljku Status → Parents → Conditions:' },
            { out: '      Reason:   BackendNotFound' },
            { out: '      Status:   False' },
            { out: '      Type:     ResolvedRefs', tone: 'bad', note: 'Tipfeler u backendRefs – zato /api dobiva 500.', who: 'davor' },
          ]}
        />
      </Section>

      {/* 9 · scene 6: Ingress + myths */}
      <Section id="ingress" kicker="koncept" title="Ingress koji ćete sresti" lead="Stariji API s istom namjerom: stabilan, zamrznut i još uvijek u mnogim klasterima.">
        <p>
          Prije Gateway API-ja ulaz u klaster opisivao se objektom <Term id="ingress">Ingress</Term>. Ideja je ista – domena i putanja biraju Service, TLS na ulazu – i jednako treba kontroler. No sve stoji u jednom objektu, a standard zna
          samo domenu i putanju (<code>Exact</code> ili <code>Prefix</code>). Težine, zaglavlja i preusmjeravanja svaki kontroler rješava svojim anotacijama, pa se takav YAML ne prenosi s kontrolera na kontroler.
        </p>
        <Compare
          left={{
            title: 'Ingress',
            tone: 'amber',
            points: ['jedan objekt za vrata i pravila', 'domena i putanja; ostalo u anotacijama kontrolera', 'API je stabilan, ali zamrznut – nema novih mogućnosti', 'kontroler i dalje treba instalirati'],
          }}
          right={{
            title: 'Gateway API',
            tone: 'teal',
            points: ['GatewayClass, Gateway i HTTPRoute: tri vlasnika', 'domena, putanja, zaglavlja, težine, preusmjeravanja – u standardu', 'isti YAML radi s više implementacija', 'preporučeni nasljednik Ingressa'],
          }}
        />
        <CodeBlock title="ingress.yaml (za usporedbu)" code={ingressYaml} mode="closed" caption="Ista pravila zapisana kao Ingress: bez anotacija određenog kontrolera nema težina 90 / 10 ni beta zaglavlja." />
        <p>
          Kontroler <strong>ingress-nginx</strong> dugo je bio zadani izbor. Umirovljen je 24. ožujka 2026.: nema novih izdanja, ispravaka ni sigurnosnih zakrpa. Postojeće instalacije i dalje rade, ali svaka nova ranjivost ostaje otvorena
          – zato ga u novom klasteru ne instaliramo, a postojeće selimo. Za prelazak postoji alat <code>ingress2gateway</code>, koji Ingress objekte pretvara u Gateway i HTTPRoute.
        </p>
        <Myth myth="F5-ov NGINX Ingress Controller isto je što i ingress-nginx.">
          To je drugi projekt, s drugim timom, koji se i dalje održava. Umirovljen je samo kontroler ingress-nginx koji je održavala zajednica Kubernetesa (engl. <em>community</em>).
        </Myth>
        <Callout kind="fact" title="Vremenska crta (stanje: listopad 2026.)">
          <IngressTimeline />
          <p>Ingress API je i dalje stabilan (GA) i zamrznut: nije označen kao zastario i ne uklanja se, ali projekt za nove stvari preporučuje Gateway API.</p>
        </Callout>
        <p>Za kraj, rečenice koje ćete čuti na vježbama, u vodičima na internetu i na forumima. Mit ili istina?</p>
        <MythOrFact
          items={[
            {
              statement: 'Ingress je vrsta Servicea.',
              fact: false,
              explain: 'Ingress je zaseban API objekt i sam ne radi ništa: treba mu Ingress kontroler. Service mu je samo odredište.',
            },
            {
              statement: 'Ingress je zastario i uklonjen iz Kubernetesa.',
              fact: false,
              explain: 'Ingress API je stabilan (GA) i zamrznut – ne dobiva novosti, ali nije uklonjen. Za nove stvari preporučuje se Gateway API.',
            },
            {
              statement: 'Za novi klaster najsigurnije je instalirati ingress-nginx.',
              fact: false,
              explain: 'Kontroler ingress-nginx zajednice Kubernetesa umirovljen je 24. ožujka 2026.: nema izdanja ni sigurnosnih zakrpa. Nove klastere slažemo na Gateway API-ju.',
            },
            {
              statement: 'Gateway API je ugrađen u svaki klaster.',
              fact: false,
              explain: 'Gateway API je dodatak: treba instalirati CRD-ove i kontroler (neki upravljani klasteri to rade za vas).',
            },
            {
              statement: 'Gateway zamjenjuje objekte Service.',
              fact: false,
              explain: 'Rute i dalje imenuju Service – Gateway iz njegova EndpointSlicea čita adrese Podova – a Service i dalje služi prometu unutar klastera.',
            },
            {
              statement: 'Postojeći Ingress objekti i dalje rade ako u klasteru radi neki Ingress kontroler.',
              fact: true,
              explain: 'Istina. Ingress API postoji i radi; problem je samo kontroler ingress-nginx, koji više nitko ne krpa.',
            },
          ]}
        />
      </Section>

      {/* 10 · recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Jedan L7 ulaz (Gateway) iza jednog load balancera zamjenjuje LoadBalancer za svaki Service: jedna adresa, jedan račun, jedno mjesto za certifikat.',
            'Gateway API je dodatak (CRD-ovi i kontroler). Lanac GatewayClass → Gateway → HTTPRoute → Service → Podovi: pružatelj, operater (Davor) i tim aplikacije (Lana) pišu svaki svoj dio.',
            'Točna domena prije zamjenskog znaka; Exact prije duljeg prefiksa, a dulji prije kraćeg; ništa ne odgovara → 404; nepostojeći Service → 500 i ResolvedRefs=False.',
            'TLS završava na Gatewayu s certifikatom iz Secreta; težine biraju odredište za svaki zahtjev, a zahtjev u većini implementacija ide izravno na Pod iz EndpointSlicea.',
            'Ingress je stabilan, ali zamrznut; ingress-nginx je umirovljen, a nove stvari radimo s Gateway API-jem.',
          ]}
        />
        <StoryMap at="15" />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Na <code>klopa.example</code> postoje pravila <code>PathPrefix /</code> → klopa-web i <code>PathPrefix /api</code> → klopa-api. Kamo ide <code>GET /api-docs</code>?
                </>
              ),
              options: ['na klopa-api, jer počinje s /api', 'na klopa-web, jer /api ne obuhvaća /api-docs', '404', 'naizmjence na oba'],
              correct: 1,
              explain: (
                <>
                  PathPrefix uspoređuje cijele dijelove putanje: <code>/api</code> hvata <code>/api</code> i <code>/api/…</code>, ali ne <code>/api-docs</code>. Ostaje prefiks <code>/</code>, dakle klopa-web.
                </>
              ),
            },
            {
              q: (
                <>
                  Nakon Lanina commita svi zahtjevi na <code>/api</code> dobivaju 500, a <code>kubectl describe httproute klopa</code> pokazuje ResolvedRefs=False i BackendNotFound. Što je najvjerojatniji uzrok?
                </>
              ),
              options: ['Podovi klopa-api padaju na provjeri spremnosti', 'backendRefs imenuje Service koji ne postoji, npr. zbog tipkarske pogreške', 'certifikat je istekao', 'Gateway nema slušatelj na portu 80'],
              correct: 1,
              explain: 'BackendNotFound znači da referenca iz rute ne vodi ni na što. Gateway tada za to pravilo vraća 500. Nespremni Podovi ne bi promijenili stanje rute, a s neispravnim certifikatom zahtjev ne bi ni stigao do HTTP-a – pao bi već pri TLS rukovanju.',
            },
            {
              q: (
                <>
                  Davor u <code>certificateRefs</code> upiše Secret <code>klopa-db</code> (vrste Opaque, lozinka baze). Što se dogodi?
                </>
              ),
              options: ['HTTPS radi, preglednik samo upozori', 'slušatelj https nije programiran i HTTPS ne radi nikome', 'prestaje raditi samo /api', 'Gateway sam uzme prethodni certifikat'],
              correct: 1,
              explain: 'Secret nije vrste kubernetes.io/tls, pa referenca ne vrijedi: slušatelj nije programiran i nijedno TLS rukovanje ne uspijeva – za sve domene na tom slušatelju.',
            },
            {
              q: (
                <>
                  Pravilo za <code>/api</code> ima <code>klopa-api</code> s <code>weight: 9</code> i <code>klopa-api-141</code> s <code>weight: 1</code>. Verzija 1.4.0 ima tri Poda, a 1.4.1 jedan (svaki od dvaju Servicea bira samo Podove
                  svoje verzije). Koliki dio zahtjeva na <code>/api</code> dobiva 1.4.1?
                </>
              ),
              options: ['25 % – jedan od četiri Poda', '10 % – težine dijele zahtjeve, a ne Podove', '1 %', '50 %'],
              correct: 1,
              explain: 'Gateway za svaki zahtjev bira backend s vjerojatnošću weight / zbroj težina = 1 / 10. Broj Podova unutar backenda na to ne utječe; dijeli samo opterećenje među njima.',
            },
            {
              q: 'Što je potrebno da bi objekt vrste Gateway u novom klasteru uopće nešto radio?',
              options: ['ništa – Gateway je ugrađen u Kubernetes', 'CRD-ovi Gateway API-ja i kontroler (implementacija) s GatewayClassom', 'samo kontroler ingress-nginx', 'LoadBalancer Service za svaki Pod'],
              correct: 1,
              explain: 'Bez CRD-ova API server ne poznaje vrstu Gateway; bez kontrolera objekt postoji, ali nitko ga ne ostvaruje. ingress-nginx ne razumije Gateway API (i umirovljen je).',
            },
            {
              q: (
                <>
                  Iz 14. predavanja: unutar klastera klopa-web zove <code>klopa-api</code> preko ClusterIP-a, kroz jednu keep-alive vezu. Kako se raspoređuju ti zahtjevi?
                </>
              ),
              options: ['po zahtjevu, kao na Gatewayu', 'kube-proxy nasumično odabere Pod pri otvaranju veze i svi zahtjevi te veze idu na njega', 'na Pod s najmanje zahtjeva u obradi', 'na sve Podove istodobno'],
              correct: 1,
              explain: 'Service (kube-proxy) bira po vezi, nasumično. Raspodjela po zahtjevu i težine žive na L7 – na Gatewayu, koji svaki zahtjev šalje izravno na Pod.',
            },
          ]}
        />
      </Section>

      {/* 11 · cost */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Jedna javna adresa i jedan račun za web, API i administraciju.',
            'HTTPS na ulazu, s certifikatom na jednom mjestu.',
            <>
              <code>/api</code>, <code>admin.klopa.example</code> i 10 % prometa na novu verziju – samo pravilima.
            </>,
            'Lana sama mijenja svoje rute; Davor drži vrata.',
          ]}
          paid={[
            'Novi dijelovi za održavanje: CRD-ove i kontroler treba redovito nadograđivati.',
            'Proxy Podovi Gatewaya na putu su svakog zahtjeva – trebaju barem dvije replike.',
            <>
              Postavke su i dalje upisane izravno u <code>deployment.yaml</code>: <code>klopa-staging</code> treba drugu adresu baze, a slika mora ostati ista.
            </>,
          ]}
          next={
            <>
              HTTPS radi, a certifikat živi u objektu Secret. Ali lozinka baze i ključ SMS-gatewaya i dalje stoje kao obične varijable okruženja u <code>deployment.yaml</code> – u Git repozitoriju koji je jedan dan bio javan.
            </>
          }
        />
      </Section>
    </>
  )
}

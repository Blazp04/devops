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
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  Section,
  StoryMap,
  Term,
  Terminal,
} from '../../kit'
import { HardcodedIp } from './sims/HardcodedIp'
import { ServiceLab } from './sims/ServiceLab'
import { DnsBuilder } from './sims/DnsBuilder'
import { PacketStepper } from './sims/PacketStepper'
import { RackService } from './sims/RackService'
import { TypesStepper } from './sims/TypesStepper'
import { ShutdownRace } from './sims/ShutdownRace'
import serviceYaml from './code/service.yaml?raw'
import readinessDiff from './code/readiness-prestop.diff?raw'
import proxyRules from './code/kube-proxy-rules.txt?raw'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section id="incident" kicker="priča" title="Adresa koja je nestala" lead="Vegetarijanski meni je vani, svi Podovi su zdravi – a web vraća greške.">
        <IncidentCard
          no={14}
          when="utorak, 12:04"
          title={
            <>
              Nakon uvođenja <code>1.4.0</code> web ne može do API-ja, a svi Podovi su spremni
            </>
          }
          who="davor"
          says={['Svi su Podovi', 'Running, a web', 'pada?!']}
          preset="Laboratorij selektora (7. odjeljak) → „Upiši IP pa uvedi novu verziju” (ondje 1.4.0 → 1.4.1; upisuje se adresa prvog spremnog Poda u laboratoriju), 40 s nakon klika, zadnjih 10 s"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '18–19' },
            { label: 'greške', value: '100 %', tone: 'bad' },
            { label: 'spremni API Podovi', value: '4/4', tone: 'ok' },
          ]}
        >
          Samo uvođenje vegetarijanskog menija prošlo je uredno – svi novi Podovi su spremni. Ali klopa-web u konfiguraciji ima <code>API_URL=http://10.244.2.47:8000</code> – adresu jednog starog API Poda. Taj Pod više ne postoji.
        </IncidentCard>
        <p>
          Kako je ta adresa dospjela u konfiguraciju? Lana je prošli tjedan provjeravala vezu između weba i API-ja, prepisala adresu iz <code>kubectl get pods -o wide</code> i ostavila je „samo dok ne proradi”. Proradilo je – i radilo sve
          do prvog uvođenja.
        </p>
        <HardcodedIp />
        <p>
          IP adresa Poda pripada tom Podu, a Pod je prolazan. Iz 13. predavanja znamo da Deployment Podove stalno zamjenjuje: pri svakom uvođenju, padu čvora ili skaliranju nastaju novi Podovi s novim adresama.
        </p>
        <p>
          <strong>Treba nam jedno stalno ime za skupinu Podova koja se stalno mijenja.</strong> Kubernetes za to ima objekt Service. Ali što se krije iza tog imena – i dijeli li promet kao load balancer iz 4. predavanja?
        </p>
      </Section>

      {/* 2 · labels and selector */}
      <Section id="oznake" kicker="koncept" title="Oznake i selektor" lead="Service ne pokazuje na Deployment ni na Podove po imenu – pokazuje na sve Podove koji nose prave oznake.">
        <p>
          <Term id="service">Service</Term> skupini Podova daje <strong>stalno ime</strong> (<code>klopa-api</code>) i <strong>stalnu virtualnu IP adresu</strong> (<Term id="clusterip">ClusterIP</Term>, kod nas{' '}
          <code>10.96.12.7</code>). Koji Podovi pripadaju skupini, Service ne pamti popisom imena. Umjesto toga ima <Term id="selector">selektor</Term>: parove ključ=vrijednost koje Pod mora imati među svojim{' '}
          <Term id="label">oznakama</Term> (engl. <em>labels</em>). Odabrane Podove Kubernetes zapisuje kao endpointe (engl. <em>endpoints</em>, 12. predavanje): IP adresu i port svakog Poda – ne HTTP putanje poput{' '}
          <code>/ready</code>.
        </p>
        <MarginNote>etiketa = Service, kutija za ručak = Pod</MarginNote>
        <ul>
          <li>
            Pod je odabran ako ima <strong>sve</strong> parove iz selektora, s točno istim vrijednostima. Dodatne oznake na Podu ne smetaju.
          </li>
          <li>
            Selektor gleda samo Podove u <Term id="namespace">Namespaceu</Term> Servicea. Ivin testni Pod u <code>klopa-staging</code> ima istu oznaku, ali promet ne dobiva.
          </li>
          <li>Service bira Podove, ne Deployment. Deployment samo stvara Podove s oznakama iz svojeg predloška, pa ih Service pronađe i nakon svakog uvođenja.</li>
        </ul>
        <Analogy
          title="Hashtagovi i spremljena pretraga"
          who="iva"
          breaksDown="Pretraga po hashtagu nađe objave s bilo kojeg profila i dovoljan joj je jedan hashtag. Selektor traži samo u svojem Namespaceu i Pod mora imati SVE navedene parove, s točno istom vrijednošću – #klopaapii nije #klopaapi."
        >
          Oznake su hashtagovi na Podovima (<code>#app=klopa-api</code>, <code>#version=1.4.0</code>), a selektor je spremljena pretraga. Novi Pod s pravim hashtagovima sam se pojavi u rezultatima; Pod koji ih izgubi sam nestane.
        </Analogy>
        <Predict
          question={
            <>
              Davor u selektor Servicea greškom upiše <code>app: klopa-apii</code> (dva „i”) i pokrene <code>kubectl apply</code>. Što će se dogoditi?
            </>
          }
          options={[
            <>
              <code>kubectl</code> odbije promjenu jer takvih Podova nema
            </>,
            'Service postoji, ali ne bira nijedan Pod: svi Podovi su zdravi, a kube-proxy odbija svaku vezu prema klopa-api',
            'Kubernetes pronađe najsličniju oznaku i nastavi slati promet',
            'Podovi se ponovno pokrenu s novom oznakom',
          ]}
          correct={1}
          explain="Selektor koji ne odgovara nijednom Podu potpuno je ispravan YAML. Service ima 0 endpointa, a kube-proxy za njegovu adresu upiše pravilo koje vezu odbija. Podovi ništa ne primjećuju – zato ovaj kvar zna dugo ostati skriven."
        />
        <ServiceLab variant="labels" />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Tipkarska pogreška u selektoru ne izaziva nikakvu poruku o grešci: Service postoji, Podovi su zdravi, a popis endpointa je prazan. kube-proxy odbija svaku novu vezu.</li>
            <li>Pod bez oznake <code>app</code> ispada iz Servicea – i iz ReplicaSeta, pa ReplicaSet odmah stvori novi Pod (13. predavanje). Stari ostaje raditi, ali promet više ne dobiva.</li>
            <li>Pod u drugom Namespaceu nikad nije dio Servicea, koliko god mu oznake bile iste.</li>
          </ul>
        </Callout>
      </Section>

      {/* 3 · only ready endpoints */}
      <Section id="spremni" kicker="koncept" title="Promet dobivaju samo spremni" lead="Service ne šalje promet svakom odabranom Podu – samo onima koji su javili da su spremni.">
        <p>
          Odabrane Podove Kubernetes popisuje u objektu <Term id="endpointslice">EndpointSlice</Term>. Za svaki Pod tu piše njegova IP adresa i tri uvjeta (engl. <em>conditions</em>):
        </p>
        <ul>
          <li>
            <code>ready</code> – Pod prolazi <Term id="readiness-probe">provjeru spremnosti</Term> i ne gasi se. Samo takvi dobivaju nove veze.
          </li>
          <li>
            <code>serving</code> – Pod prolazi provjeru spremnosti, čak i ako se upravo gasi.
          </li>
          <li>
            <code>terminating</code> – Pod je obrisan i gasi se.
          </li>
        </ul>
        <p>
          Na svakom čvoru radi <Term id="kube-proxy">kube-proxy</Term>. On prati EndpointSliceove i od njih piše pravila – samo za endpointe s <code>ready: true</code>. Pod kojem padne provjera spremnosti zato ostaje na popisu, ali s{' '}
          <code>ready: false</code>, i ne dobiva nove veze. Nitko ga ne pokreće ponovno: čim provjera opet prođe, vraća se u pravila.
        </p>
        <Callout kind="tip" title="Spremnost nije živost">
          Kad padne provjera živosti, kubelet ponovno pokreće kontejner. Kad padne provjera spremnosti, Pod samo izlazi iz prometa (12. predavanje).
        </Callout>
        <p>
          Zato je uvođenje iz 13. predavanja prošlo bez grešaka: novi Pod ulazi u pravila tek kad je spreman, a stari smije otići tek kad ga pravila zaborave (to je druga polovica priče, u 6. odjeljku). Ponovimo to
          uvođenje – jednom s provjerom spremnosti, jednom bez nje.
        </p>
        <ServiceLab variant="ready" />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              S provjerom spremnosti uvođenje <code>1.3.2</code> → <code>1.4.0</code> prođe bez ijednog neuspjelog zahtjeva (seed 42). Stari Podovi ovdje već imaju <code>preStop</code> – zašto, vidjet ćemo u 6.
              odjeljku.
            </li>
            <li>
              Bez nje Pod je „spreman” čim se proces pokrene, dok se aplikacija još zagrijava: stotinjak zahtjeva dobije <code>503</code>.
            </li>
            <li>
              Pod s <code>ready: false</code> ostaje u EndpointSliceu i radi dalje – samo ne dobiva promet.
            </li>
          </ul>
        </Callout>
        <Callout kind="fact" title="Endpoints je zastario">
          EndpointSlice je zamijenio stariji objekt Endpoints, koji je zastario (engl. <em>deprecated</em>) od Kubernetesa 1.33 – upute s naredbom <code>kubectl get endpoints</code> gledaju stari API, koji kube-proxy više ne čita. Od verzije 1.28 kube-proxy, kad nijedan
          endpoint nije spreman, šalje promet Podovima koji se gase, a još poslužuju (<code>serving: true</code>, <code>terminating: true</code>). Ako ni takvih nema, veza se odbija.
        </Callout>
      </Section>

      {/* 4 · DNS and the packet path */}
      <Section
        id="put"
        kicker="korak po korak"
        title="Od imena do Poda"
        lead={
          <>
            Kako <code>klopa-api</code> postane paket na pravom Podu – i zašto adresu <code>10.96.12.7</code> nema nijedno računalo.
          </>
        }
      >
        <p>
          Prvi korak je ime. U klasteru radi DNS poslužitelj <Term id="coredns">CoreDNS</Term>, koji za svaki Service zna ime oblika <code>ime.namespace.svc.cluster.local</code>. Pod ne mora pisati cijelo ime: njegov razrješivač
          imena (engl. <em>resolver</em>) ima popis
          nastavaka za pretragu i redom ih dodaje – počevši od vlastitog Namespacea.
        </p>
        <DnsBuilder />
        <p>
          Zato klopa-web, koji je u istom Namespaceu, smije pisati samo <code>klopa-api</code>. Iz drugog Namespacea treba barem <code>klopa-api.klopa</code>, a puno ime radi odasvud.
        </p>
        <p>Drugi korak je adresa. Pošaljimo jedan paket od klopa-weba do API-ja i pratimo što se događa s njegovim zaglavljem.</p>
        <PacketStepper />
        <KeyIdea>
          Service nije kutija kroz koju promet prolazi. To je <strong>stalno ime i virtualna IP adresa</strong>, ostvareni <strong>pravilima na svakom čvoru</strong>. Pravila šalju samo spremnim Podovima i biraju ih{' '}
          <strong>nasumično, po vezi</strong>.
        </KeyIdea>
        <Analogy
          title="Glavni broj telefona menze"
          breaksDown="Nema centrale ni telefonistice – nema procesa kroz koji poziv prolazi, samo pravila preusmjeravanja na svakom čvoru. ClusterIP se obično ne može ni pingati: pravila hvataju samo portove Servicea. I nitko ne traži slobodnu liniju: Pod se bira nasumično, za svaku novu vezu."
        >
          Zovete jedan broj, a poziv završi kod nekoga tko se javlja. Broj se ne mijenja kad netko od kuhara ode ili dođe – kao što se ClusterIP ne mijenja kad se Podovi zamijene.
        </Analogy>
        <Callout kind="fact" title="Načini rada kube-proxyja">
          Na Linuxu je u Kubernetesu 1.37 zadani način <code>iptables</code>. Nasljednik je <code>nftables</code> (GA od 1.33, treba jezgru Linuxa 5.13 ili noviju). Način <code>ipvs</code> zastario je u 1.35, od 1.40 bit će isključen, a
          uklanjanje je planirano za 1.43. Neki mrežni dodaci (npr. Cilium) Service ostvaruju eBPF programima u jezgri operacijskog sustava, bez kube-proxyja – ideja je ista.
        </Callout>
      </Section>

      {/* 5 · not a classic load balancer */}
      <Section
        id="nije-lb"
        kicker="isprobajte"
        title="Service nije klasični load balancer"
        lead="Redar iz 4. predavanja gleda koliko je tko zauzet. Pravila Servicea ne gledaju ništa – za svaku novu vezu bacaju kocku."
      >
        <p>
          U načinima iptables i nftables kube-proxy za svaku novu vezu bira spreman Pod <strong>nasumično</strong>, s jednakom vjerojatnošću. Nema težina, nema „najmanje veza” i nema podataka o veličini čvora. Nasumični izbor u
          prosjeku je blizu kružnom – i ima isti problem s nejednakim poslužiteljima.
        </p>
        <p>
          <strong>IP adresa nije korisnik.</strong> <Term id="session-affinity">sessionAffinity: ClientIP</Term> nove veze s iste izvorne adrese šalje istom Podu (zadano 10 800 s, tri sata). Cijeli kampus iza NAT-a ili eduroama izlazi s
          jedne javne adrese – i završi na jednom Podu. Afinitet po kolačiću moguć je tek na L7 – u proxyju ili Gatewayu koji to podržava.
        </p>
        <RackService />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              Pred poslužiteljima iz 4. predavanja Service se ponaša kao nasumično raspoređivanje: pri 15 zahtjeva/s Mali se guši (oko 2–3 % grešaka; u duljem mjerenju ≈ 2,8 %, kao kružno u 4. predavanju), a klasični LB s
              „najmanje veza” nema grešaka.
            </li>
            <li>Sedam jednakih Podova na istim strojevima nema grešaka – i Veliki dobiva 4/7 prometa jer na njemu radi više Podova.</li>
            <li>
              NAT kampusa sa <code>sessionAffinity: ClientIP</code> šalje sve na jedan Pod; s jednakim Podovima taj se Pod uguši.
            </li>
          </ul>
        </Callout>
        <p>
          Kako onda veći stroj dobije više prometa? Tako da na njega stane više Podova. Podovi jednog Deploymenta su jednaki, a raspoređivač ih slaže po čvorovima prema zajamčenom minimumu resursa (<code>requests</code>, 17.
          predavanje). Kad prometa ima više, HPA dodaje Podove (18. predavanje).
        </p>
        <p>
          <strong>Po vezi, a ne po zahtjevu.</strong> Pravila gledaju pakete, a ne HTTP zahtjeve: odluka pada kad se otvara veza, a svi paketi te veze idu istom Podu (to pamti <Term id="conntrack">conntrack</Term>). Klijent s jednom
          dugotrajnom vezom (<Term id="keep-alive">keep-alive</Term>, HTTP/2, gRPC) zato sve zahtjeve šalje jednom Podu. Što pomaže:
        </p>
        <ul>
          <li>Klijent povremeno zatvori vezu i otvori novu (najdulje trajanje veze). Svaka nova veza ponovno baca kocku.</li>
          <li>Ispred Podova stoji L7 proxy koji razumije HTTP i raspoređuje po zahtjevu – to radi Gateway iz sljedećeg predavanja.</li>
          <li>Klijent sam raspoređuje zahtjeve po svim Podovima preko headless Servicea, koji u DNS-u vraća adrese Podova (19. predavanje).</li>
        </ul>
        <Compare
          left={{
            title: 'Klasični load balancer (4. predavanje)',
            tone: 'amber',
            points: ['proces kroz koji prolazi sav promet', 'algoritam po izboru: kružno, težine, najmanje veza', 'na L7 vidi zahtjeve i kolačiće', 'sam provjerava ispravnost poslužitelja'],
          }}
          right={{
            title: 'Service (kube-proxy)',
            tone: 'blue',
            points: ['pravila u jezgri operacijskog sustava svakog čvora, bez procesa na putu', 'nasumično, za svaku novu vezu, bez težina', 'vidi samo veze (L4), ne zahtjeve', 'spremnost javlja kubelet (provjera spremnosti)'],
          }}
        />
        <DeepDive title="Iza load balancera i blizina">
          <p>
            Iza load balancera u oblaku Pod često vidi tek adresu load balancera ili čvora, a ne studentovu – osim ako je u Serviceu postavljeno <code>externalTrafficPolicy: Local</code>. Tada promet izvana ide samo Podovima na
            čvoru na koji je stigao (slično radi <code>internalTrafficPolicy: Local</code> za promet iznutra).
          </p>
          <Callout kind="fact" title="Iznimka: blizina">
            Polje <code>trafficDistribution</code> (<code>PreferSameZone</code> ili <code>PreferSameNode</code>, stabilno od Kubernetesa 1.35) traži da promet ostane u istoj zoni ili na istom čvoru kad tamo ima spremnih Podova.
            Razlog je kraći put i manje plaćenog prometa između zona – ni ono ne gleda veličinu čvora ni zauzeće Poda. Bez takvih postavki promet se dijeli jednako na sve spremne endpointe.
          </Callout>
        </DeepDive>
      </Section>

      {/* 6 · types and graceful shutdown */}
      <Section id="vrste" kicker="koncept" title="Vrste Servicea i gašenje bez izgubljenih zahtjeva" lead="ClusterIP je dovoljan unutar klastera. Za promet izvana postoje još dvije vrste – a za uvođenje bez grešaka treba pobijediti u jednoj utrci.">
        <TypesStepper />
        <ul>
          <li>
            <code>ClusterIP</code> (zadano) – samo unutar klastera.
          </li>
          <li>
            <code>NodePort</code> – isti port (30000–32767) na svakom čvoru; uz to dobiva i ClusterIP.
          </li>
          <li>
            <code>LoadBalancer</code> – vanjski load balancer koji napravi kontroler oblaka ili dodatak (na vlastitim poslužiteljima npr. MetalLB); uz to dobiva NodePort i ClusterIP.
          </li>
          <li>
            Radi potpunosti: <code>ExternalName</code> je samo DNS alias za vanjsko ime, a <em>headless</em> Service (<code>clusterIP: None</code>) nema virtualnu adresu – njega ćemo trebati za bazu u 19. predavanju.
          </li>
        </ul>
        <Terminal
          title="Lanin laptop – lokalni klaster kind"
          lines={[
            { cmd: 'kubectl get svc klopa-api -n klopa' },
            { out: 'NAME        TYPE           CLUSTER-IP   EXTERNAL-IP   PORT(S)        AGE' },
            { out: 'klopa-api   LoadBalancer   10.96.12.7   <pending>     80:31080/TCP   2m', note: 'kind nema oblak: vanjsku adresu nema tko dodijeliti', who: 'lana' },
          ]}
        />
        <Callout kind="fact" title="LoadBalancer bez oblaka">
          Na lokalnom klasteru kind vanjsku adresu dodjeljuje tek zaseban alat <code>cloud-provider-kind</code>; na vlastitim poslužiteljima to radi dodatak poput MetalLB-a. Polje <code>spec.externalIPs</code> iz starijih uputa
          zastarjelo je od Kubernetesa 1.36 – ne koristite ga.
        </Callout>
        <p>
          <strong>Utrka pri gašenju.</strong> Kad Kubernetes briše Pod (npr. tijekom uvođenja), dvije stvari kreću <em>u isto vrijeme</em>: kubelet šalje aplikaciji signal <code>SIGTERM</code>, a EndpointSlice Pod označi kao{' '}
          <code>terminating</code>. Promjena do pravila na svim čvorovima putuje asinkrono i stiže tek malo kasnije. Aplikacija koja na SIGTERM odmah izađe propušta zahtjeve koji u tom razmaku još stižu.
        </p>
        <ShutdownRace />
        <p>
          Lijek je jednostavan: <code>preStop: sleep 5</code>. Kubelet najprije pet sekundi čeka (aplikacija i dalje odgovara), a tek onda šalje SIGTERM. Za to vrijeme pravila na svim čvorovima zaborave Pod. Ako Pod ni 30 sekundi od
          početka brisanja (<code>terminationGracePeriodSeconds</code>, uključuje i <code>preStop</code>) ne završi, stiže <code>SIGKILL</code>. Samo uredno gašenje (dovrši započeto, nove veze odbija) ne pomaže dovoljno: veze
          koje pravila pošalju u tom razmaku i dalje padaju. Brojke iznad su iz simulacije: 4 Poda, 12 zahtjeva u sekundi, jedan Pod obrisan usred prometa, seed 42.
        </p>
        <Callout kind="fact" title="preStop sleep">
          Akcija <code>sleep</code> u <code>lifecycle.preStop</code> stabilna je (GA) od Kubernetesa 1.34, pa slika ne mora imati naredbu <code>sleep</code>. Zadani <code>terminationGracePeriodSeconds</code> je 30 s.
        </Callout>
      </Section>

      {/* 7 · flagship */}
      <Section id="simulacija" kicker="simulacija" title="Laboratorij selektora" lead="Sve dosad na jednom mjestu: oznake, selektor, spremnost, vrste, veze, uvođenje i put jednog zahtjeva.">
        <p>
          Kliknite Pod na crtežu da ga odaberete: u kontrolama mu možete odlijepiti oznaku, srušiti provjeru spremnosti ili ga obrisati. Linija od etikete do Poda pokazuje što o njemu misli Service (ključ je ispod crteža): puna zelena
          – dobiva promet; iscrtkana s ✗ – u EndpointSliceu, ali nije spreman; narančasta – Pod se gasi ili ga pravila još nisu zaboravila (kašnjenje 1 s, sim); točkasta – novi spreman Pod koji pravila još nemaju; bez linije –
          selektor ga ne bira. Desno je udio zahtjeva koje je Pod dobio u zadnjih 10 sekundi.
        </p>
        <MarginNote tone="red">preStop štiti samo Podove koji ga već imaju!</MarginNote>
        <p>
          Za drugi zadatak: uvođenje bez ijedne greške treba provjeru spremnosti (već je u predlošku) i <code>preStop</code> iz prethodnog odjeljka. Uključite preStop, pričekajte da to uvođenje završi, pa tek onda uvedite
          <code>1.4.1</code>.
        </p>
        <ServiceLab variant="full" />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Upisana IP adresa radi samo dok živi taj jedan Pod – to je incident s početka. Ime klopa-api preživi svako uvođenje.</li>
            <li>Jedna dugotrajna veza nosi sve zahtjeve jednom Podu. Promet se dijeli tek kad se otvaraju nove veze.</li>
            <li>
              <code>sessionAffinity: ClientIP</code> sve s iste IP adrese šalje istom Podu.
            </li>
            <li>kube-proxy kasni za EndpointSliceom (u simulaciji 1 s), pa Pod koji se gasi još kratko dobiva promet.</li>
          </ul>
        </Callout>
      </Section>

      {/* 8 · code */}
      <Section id="kod" kicker="kod" title="Service u YAML-u i u terminalu" lead="Ovo što ste vidjeli u laboratoriju stane u četrnaest redaka YAML-a i nekoliko naredbi.">
        <CodeBlock
          title="service.yaml"
          lang="yaml"
          code={serviceYaml}
          caption="Cijeli Service iz laboratorija. ClusterIP (10.96.12.7) Kubernetes dodjeljuje sam."
          notes={[
            { lines: '7', text: 'zadana vrsta – smije se i izostaviti' },
            { lines: '8-9', text: 'Podovi s oznakom app=klopa-api u Namespaceu klopa' },
            { lines: '13', text: 'klopa-web zove klopa-api:80' },
            { lines: '14', text: 'port na kojem gunicorn sluša u Podu' },
          ]}
        />
        <CodeBlock
          title="deployment.yaml – uvođenje bez grešaka"
          lang="diff"
          code={readinessDiff}
          caption={
            <>
              Provjera spremnosti već je u predlošku; novi su samo <code>preStop</code> i izričito napisan zadani rok gašenja – i vrijede tek za Podove stvorene nakon promjene.
            </>
          }
          notes={[
            { lines: '14-19', text: 'već u predlošku: ready tek kad /ready vrati 2xx/3xx' },
            { lines: '24-27', text: 'radi još 5 s dok pravila ne zaborave Pod' },
            { lines: '8', text: '30 s od početka brisanja, pa SIGKILL (zadano)' },
          ]}
        />
        <Terminal
          title="Lanin laptop – EndpointSlice Servicea"
          lines={[
            { comment: 'EndpointSliceove Servicea nalazimo po oznaci koju im dodaje Kubernetes' },
            { cmd: 'kubectl get endpointslices -n klopa -l kubernetes.io/service-name=klopa-api -o yaml' },
            { out: '  endpoints:' },
            { out: '  - addresses:\n    - 10.244.2.2\n    conditions:\n      ready: true\n      serving: true\n      terminating: false\n    nodeName: node-2' },
            { out: '  - addresses:\n    - 10.244.3.4\n    conditions:' },
            { out: '      ready: false', tone: 'bad', note: 'Pod radi, ali /ready vraća 503 – nema prometa', who: 'davor' },
            { out: '      serving: false\n      terminating: false\n    nodeName: node-3' },
            { out: '  ports:\n  - name: http\n    port: 8000\n    protocol: TCP' },
          ]}
        />
        <Terminal
          title="Lanin laptop – DNS iznutra"
          lines={[
            { comment: 'privremeni Pod s alatima za DNS (slika iz Kubernetesove dokumentacije), u Namespaceu klopa' },
            { cmd: 'kubectl run dnsutils -n klopa --rm -it --restart=Never --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:1.3 -- nslookup klopa-api' },
            { out: 'Server:\t\t10.96.0.10\nAddress:\t10.96.0.10#53' },
            { out: 'Name:\tklopa-api.klopa.svc.cluster.local', note: 'kratko ime dopunio je resolver nastavkom Namespacea klopa', who: 'lana' },
            { out: 'Address: 10.96.12.7' },
            { out: 'pod "dnsutils" deleted', tone: 'muted' },
          ]}
        />
        <DeepDive title="Pravila u jezgri operacijskog sustava: iptables i nftables">
          <p>
            Na svakom čvoru kube-proxy za Service upiše lanac pravila. U načinu iptables nasumičnost se vidi izravno: prvi endpoint dobiva vezu s vjerojatnošću 1/4, inače drugi s 1/3, inače treći s 1/2, inače četvrti – svaki
            ukupno točno 1/4. Zadnje pravilo radi DNAT na adresu Poda. U nftables načinu isto piše kraće: „slučajan broj mod 4”.
          </p>
          <CodeBlock title="na čvoru (skraćeno)" lang="text" code={proxyRules} mode="open" />
          <p>Ova pravila hvataju samo TCP port 80 adrese 10.96.12.7. Zato ping na ClusterIP obično ne dobije odgovor – iako Service radi.</p>
        </DeepDive>
      </Section>

      {/* 9 · myths */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            {
              statement: 'Service je proces ili kutija kroz koju prolazi promet.',
              fact: false,
              explain: 'Service je ime i virtualna IP adresa. Promet ne prolazi ni kroz kakav proces Servicea, nego kroz pravila u jezgri operacijskog sustava na svakom čvoru, koja paket preusmjere ravno na Pod.',
            },
            {
              statement: 'Service raspoređuje kružno, zahtjev po zahtjev.',
              fact: false,
              explain: 'kube-proxy za svaku novu vezu nasumično bira spreman Pod, a svi zahtjevi te veze idu istom Podu.',
            },
            {
              statement: 'Service pokazuje na Deployment.',
              fact: false,
              explain: 'Service bira Podove po oznakama. Tipkarska pogreška u selektoru daje 0 endpointa, iako su Deployment i svi Podovi zdravi.',
            },
            {
              statement: 'EndpointSlice popisuje i Podove koji nisu spremni.',
              fact: true,
              explain: (
                <>
                  Sadrži sve odabrane Podove, svaki s uvjetima. Nespremni imaju <code>ready: false</code> i kube-proxy ih preskače – ali ostaju na popisu.
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>type: LoadBalancer</code> radi svugdje.
                </>
              ),
              fact: false,
              explain: (
                <>
                  Treba kontroler oblaka ili dodatak poput MetalLB-a. Na lokalnom kindu <code>EXTERNAL-IP</code> ostaje <code>&lt;pending&gt;</code>, osim ako radi <code>cloud-provider-kind</code>.
                </>
              ),
            },
            {
              statement: 'gRPC se kroz Service raspoređuje po zahtjevu.',
              fact: false,
              explain: 'gRPC radi preko HTTP/2, koji drži jednu dugotrajnu vezu – a ona ostaje na jednom Podu. Treba L7 proxy, raspoređivanje na klijentu ili povremeno nove veze.',
            },
          ]}
        />
      </Section>

      {/* 10 · recap and quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Service je stalno ime i ClusterIP za Podove odabrane oznakama – samo u svojem Namespaceu i samo ako odgovaraju SVI parovi selektora.',
            <>
              EndpointSlice popisuje sve odabrane Podove s uvjetima <code>ready</code>, <code>serving</code> i <code>terminating</code>; promet dobivaju samo spremni.
            </>,
            'ClusterIP nema nijedno računalo: pravila kube-proxyja na klijentovu čvoru DNAT-om biraju Pod, a conntrack u odgovoru vraća adresu Servicea.',
            <>
              Izbor je nasumičan i po vezi: dugotrajna veza ostaje na jednom Podu, a <code>sessionAffinity: ClientIP</code> vidi samo IP adresu.
            </>,
            <>
              ClusterIP je za unutra, NodePort otvara port na svakom čvoru, LoadBalancer treba oblak ili dodatak; <code>preStop: sleep</code> pokriva kašnjenje pravila pri gašenju.
            </>,
          ]}
        />
        <StoryMap at="14" />
        <Quiz
          id="l14"
          questions={[
            {
              q: (
                <>
                  <code>kubectl get pods</code> pokazuje četiri Poda klopa-api <code>1/1 Running</code>, a klopa-web dobiva „connection refused” od klopa-api. Što prvo provjeriti?
                </>
              ),
              options: [
                'Ponovno pokrenuti sve Podove',
                'EndpointSlice Servicea: je li prazan (selektor ne odgovara ili je Service u drugom Namespaceu)',
                'Povećati broj replika na 8',
                'Promijeniti vrstu Servicea u LoadBalancer',
              ],
              correct: 1,
              explain: (
                <>
                  Zdravi Podovi i odbijena veza najčešće znače da Service ne bira nijedan Pod – tipkarska pogreška u selektoru ili krivi Namespace. Naredba{' '}
                  <code>kubectl get endpointslices -l kubernetes.io/service-name=klopa-api</code> odmah pokaže prazan popis.
                </>
              ),
            },
            {
              q: (
                <>
                  Što je ClusterIP <code>10.96.12.7</code>?
                </>
              ),
              options: ['IP adresa posebnog Poda koji prosljeđuje promet', 'Virtualna adresa za koju pravila na svakom čvoru rade DNAT na spreman Pod', 'IP adresa čvora node-1', 'Javna adresa na koju dolaze studenti'],
              correct: 1,
              explain: 'Tu adresu nema nijedna mrežna kartica. Paket za nju presretnu pravila na klijentovu čvoru i zamijene odredište adresom nasumično odabranog spremnog Poda.',
            },
            {
              q: 'klopa-web ima jednu keep-alive vezu prema Serviceu iza kojeg su 4 Poda. Kako se dijeli promet?',
              options: ['Svaki Pod dobiva 25 %', 'Sav promet ide jednom Podu dok se veza ne zatvori', 'Kružno, zahtjev po zahtjev', 'Najviše dobiva najmanje zauzet Pod'],
              correct: 1,
              explain: 'Pod se bira kad se veza otvara; svi zahtjevi na toj vezi idu istom Podu. Nove veze (ili L7 proxy) dijele promet.',
            },
            {
              q: (
                <>
                  Pod u Namespaceu <code>klopa-staging</code> zove <code>http://klopa-api</code>, a Service klopa-api je u Namespaceu <code>klopa</code>. Što se dogodi?
                </>
              ),
              options: [
                'Stigne do klopa-api u Namespaceu klopa',
                <>
                  DNS odgovori <code>NXDOMAIN</code>: kratko ime traži se u <code>klopa-staging</code>
                </>,
                'Stigne do nasumičnog Servicea istog imena',
                <>
                  <code>kubectl apply</code> javi grešku
                </>,
              ],
              correct: 1,
              explain: (
                <>
                  Razrješivač imena kratkom imenu najprije dodaje Namespace Poda koji pita: <code>klopa-api.klopa-staging.svc.cluster.local</code> – a toga nema. Treba barem <code>klopa-api.klopa</code>.
                </>
              ),
            },
            {
              q: (
                <>
                  Zašto <code>preStop: sleep 5</code> smanjuje broj neuspjelih zahtjeva pri uvođenju?
                </>
              ),
              options: [
                'Novi Pod se brže pokrene',
                'Stari Pod odgovara još 5 s, dok se njegovo brisanje iz EndpointSlicea ne proširi do pravila na svim čvorovima',
                'kube-proxy čeka 5 s prije nego što obriše Pod',
                'Provjera spremnosti radi češće',
              ],
              correct: 1,
              explain: 'SIGTERM i uklanjanje endpointa kreću istodobno, a pravila kasne. preStop odgodi SIGTERM pa zahtjevi u tom razmaku ipak dobiju odgovor (u simulaciji 10 → 0 neuspjelih).',
            },
            {
              q: 'Iz 4. predavanja: Mali (1 vCPU), Srednji (2 vCPU) i Veliki (4 vCPU) stavimo iza Servicea. Pri 15 zahtjeva/s Mali se guši. Zašto, i kako se to rješava u Kubernetesu?',
              options: [
                'Service svakome daje trećinu prometa; u Kubernetesu Podovi su jednaki, a na veći čvor stane ih više',
                'Service zna veličinu čvora, pa je Mali trebao dobiti manje – riječ je o grešci',
                <>
                  Treba uključiti <code>sessionAffinity: ClientIP</code>
                </>,
                'Treba prijeći na NodePort',
              ],
              correct: 0,
              explain: (
                <>
                  Service nema težina ni podataka o veličini; ponaša se kao nasumično raspoređivanje (oko 2–3 % grešaka, u duljem mjerenju ≈ 2,8 %, kao kružno u 4. predavanju). Jednaki Podovi, raspoređeni prema{' '}
                  <code>requests</code>, dijele promet razmjerno broju Podova po čvoru.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* 11 · cost */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'klopa-web zove ime klopa-api i preživi svako uvođenje.',
            'Promet dobivaju samo spremni Podovi – uvođenje bez ijednog neuspjelog zahtjeva.',
            'Unutar klastera svaki se Service nalazi po imenu, bez upisanih adresa.',
          ]}
          paid={[
            'Service raspoređuje veze, ne zahtjeve: keep-alive i gRPC ostaju na jednom Podu.',
            'Za promet izvana LoadBalancer po Serviceu: web, API i administracija – tri javne adrese i tri računa.',
            <>
              HTTPS i usmjeravanje <code>/api</code> na jedan Service, a <code>/</code> na drugi, Service ne zna: on vidi samo veze.
            </>,
          ]}
          next={
            <>
              Unutar klastera sve se nalazi po imenu. Ali kako studenti s interneta dolaze do Klope? Tri LoadBalancer Servicea znače tri javne adrese i tri računa – a trebaju nam i HTTPS i usmjeravanje <code>/api</code> na
              drugi Service nego <code>/</code>.
            </>
          }
        />
      </Section>
    </>
  )
}

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
  Myth,
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
import { INCIDENT_PRESET, INCIDENT_SEED } from './lib/flagship'
import { OneImageStepper } from './sims/OneImageStepper'
import { DecodeLab } from './sims/DecodeLab'
import { WhereStepper } from './sims/WhereStepper'
import { WhoCanRead } from './sims/WhoCanRead'
import { UpdateTimeline } from './sims/UpdateTimeline'
import { PutTajne } from './sims/PutTajne'
import { Checklist, StagingBeat } from './sims/StoryBits'
import deploymentPrije from './code/deployment-prije.yaml?raw'
import configmapYaml from './code/configmap.yaml?raw'
import secretYaml from './code/secret.yaml?raw'
import deploymentEnv from './code/deployment-env.yaml?raw'
import deploymentVolume from './code/deployment-volume.yaml?raw'
import rbacYaml from './code/rbac.yaml?raw'
import encryptionYaml from './code/encryption-config.yaml?raw'

export default function Lecture() {
  return (
    <>
      <Section id="incident" kicker="priča" title="Ključ iz javnog repozitorija" lead={
          <>
            Lozinka baze i ključ za SMS stajali su u <code>deployment.yaml</code> kao obične varijable okruženja.
          </>
        }>
        <IncidentCard
          no={16}
          when="ponedjeljak, 08:40"
          title="Netko troši Klopin ključ za SMS-gateway"
          who="davor"
          says={['Račun za SMS?!', 'Tko je slao?']}
          metrics={[
            { label: 'tko čita lozinku', value: '7 od 9', tone: 'bad' },
            { label: 'lozinka u Gitu', value: 'čitljiva', tone: 'bad' },
            { label: 'šifriranje u mirovanju', value: 'isključeno', tone: 'warn' },
          ]}
          preset={INCIDENT_PRESET}
          seed={INCIDENT_SEED}
        >
          Repozitorij s <code>deployment.yaml</code> greškom je bio javan i netko je Klopinim ključem slao SMS-ove. Stigao je račun za poruke koje Klopa nije poslala.
        </IncidentCard>
        <p>
          „7 od 9” znači: od devet ljudi i strojeva koji bi mogli doći do lozinke baze, sedam je može pročitati. Upoznat ćemo ih u simulaciji „Put tajne”.
        </p>
        <p>
          Davor je odmah zatražio novi ključ od pružatelja SMS usluge i ugasio stari. Lozinka baze bila je u istom javnom repozitoriju, pa i nju treba promijeniti. Ali pravo pitanje tek dolazi: gdje bi lozinke uopće trebale živjeti? Ovako je izgledao Deployment iz javnog repozitorija:
        </p>
        <CodeBlock
          title="deployment.yaml (prije)"
          code={deploymentPrije}
          mode="open"
          highlight="9-12"
          notes={[
            { lines: '10', text: 'lozinka baze – u Gitu zauvijek' },
            { lines: '12', text: 'ovaj je ključ netko iskoristio' },
          ]}
        />
        <p>
          Isti dan stiže i drugi problem. Petra treba testno okruženje, Namespace <code>klopa-staging</code>, koje se spaja na svoju bazu. Najbrže bi bilo izgraditi još jednu sliku s drugom adresom – ali onda u produkciju ide slika koju nitko nije testirao. Lana to ne želi:
        </p>
        <StagingBeat />
        <Callout kind="info" title="Pitanje ovog predavanja">
          Gdje u Kubernetesu žive postavke i tajne, tko ih može pročitati i što se dogodi kad ih promijenimo?
        </Callout>
      </Section>

      <Section id="jedna-slika" kicker="koncept" title="Jedna slika, tri okruženja" lead="Slika nosi kod, a okruženje joj izvana daje postavke.">
        <p>
          <Term id="container-image">Slika kontejnera</Term> je nepromjenjiva: isti <Term id="digest">digest</Term> znači iste bajtove. Ako adresu baze ugradimo u sliku, svako okruženje treba svoju sliku – i u produkciju stiže nešto što nitko nije testirao. Zato postavke držimo izvan slike, a sliku pokrećemo jednaku svugdje.
        </p>
        <MarginNote>ConfigMap = postavke koje smiju na oglasnu ploču</MarginNote>
        <p>
          <Term id="configmap">ConfigMap</Term> je Kubernetes objekt s parovima ključ–vrijednost za postavke koje nisu tajne: adresu baze, razinu logova, uključene mogućnosti. Živi u <Term id="namespace">Namespaceu</Term>, pa svako okruženje može imati svoj ConfigMap pod istim imenom. Pogledajmo kako ista slika dobije tri ponašanja.
        </p>
        <OneImageStepper />
        <p>
          Aplikacija ne zna da ConfigMap postoji. Ona vidi samo varijable okruženja ili datoteke, kao i na Laninu laptopu. Isto vrijedi za Secret, objekt za lozinke – i upravo zato je važno znati kako točno vrijednost stiže u kontejner.
        </p>
      </Section>

      <Section id="dekodirajte" kicker="isprobajte" title="Dekodirajte Secret" lead="Secret izgleda kao da je šifriran. Provjerimo.">
        <p>
          Za lozinke i ključeve Kubernetes ima poseban objekt: <Term id="secret">Secret</Term>. Lana je lozinku baze spremila u Secret <code>klopa-db</code>. Kad ga zatražimo od API-ja, vrijednost ne izgleda kao lozinka nego kao niz slova i znakova jednakosti.
        </p>
        <Predict
          question={
            <>
              U polju <code>data</code> stoji <code>a2xvcGFfZGI=</code>. Što treba napadaču da iz toga dobije lozinku?
            </>
          }
          options={['privatni ključ klastera', 'lozinku administratora klastera', <>ništa posebno – jednu naredbu <code>base64 -d</code></>]}
          correct={2}
          explain={
            <>
              <Term id="base64">Base64</Term> je kodiranje, a ne šifriranje: samo drugi zapis istih bajtova. Svaka tri bajta postaju četiri znaka po javnoj tablici. Nema ključa ni tajnog koraka, pa se zapis vraća jednako lako kao što je nastao.
            </>
          }
          then="Provjerite gumbom „Dekodiraj”."
        />
        <DecodeLab />
        <Compare
          left={{
            title: 'Kodiranje (base64)',
            tone: 'rose',
            points: ['nema ključa', 'svatko ga vrati jednom naredbom', 'svrha: prenijeti bilo koje bajtove kroz tekst (YAML, JSON)'],
          }}
          right={{
            title: 'Šifriranje',
            tone: 'green',
            points: ['treba ključ', 'bez ključa ostaje samo šum', 'svrha: tajnost'],
          }}
        />
        <Myth myth="Secreti su šifrirani.">
          U API-ju Secret je samo kodiran u base64, a u bazi etcd po zadanom leži nešifriran. Zaštitu treba dodati: šifriranje u mirovanju i RBAC.
        </Myth>
        <Analogy title="Secret je ConfigMap s naljepnicom „pažljivo”" breaksDown="Naljepnica mijenja samo postupanje: posebna pravila RBAC-a i alati koji vrijednost ne ispisuju. Šifriranja nema – kutiju otvara svatko tko je dobije u ruke.">
          Teta Mira na kutiju s receptom za tajni umak zalijepi naljepnicu „pažljivo”. Kuhari s tom kutijom postupaju drukčije: ne ostavljaju je na pultu i ne čitaju je naglas gostima. Ali kutija nema bravu.
        </Analogy>
        <DeepDive title="Još o Secretu">
          <ul>
            <li>
              Polje <code>stringData</code> prima običan tekst. API vrijednost iz <code>stringData</code> prebaci u polje <code>data</code>; kad Secret pročitamo, vidimo je kodiranu u base64. Zgodno za pisanje – i podsjetnik da je ista vrijednost u datoteci vidljiva golim okom.
            </li>
            <li>Secret (kao i ConfigMap) može imati najviše 1 MiB.</li>
            <li>
              Polje <code>type</code> govori čemu služi: <code>Opaque</code> (zadano, bilo što), <code>kubernetes.io/tls</code> (certifikat i ključ – onaj iz prošlog predavanja), <code>kubernetes.io/dockerconfigjson</code> (pristup registru slika), <code>kubernetes.io/basic-auth</code>, <code>kubernetes.io/ssh-auth</code>, <code>kubernetes.io/service-account-token</code>.
            </li>
            <li>
              S <code>immutable: true</code> Secret se više ne može mijenjati, samo obrisati i stvoriti novi. To štiti od slučajne promjene i rasterećuje API poslužitelj.
            </li>
          </ul>
        </DeepDive>
      </Section>

      <Section id="gdje-zivi" kicker="koncept" title="Gdje tajna živi" lead="Base64 je samo prikaz u API-ju. Što leži na disku, ovisi o šifriranju u mirovanju.">
        <p>
          Svaki objekt koji pošaljemo <Term id="api-server">API poslužitelju</Term> završi u bazi <Term id="etcd">etcd</Term> na disku <Term id="control-plane">upravljačke ravnine</Term>, pa tako i Secret. Što točno tamo leži, odlučuje <Term id="encryption-at-rest">šifriranje u mirovanju</Term>. Prođimo tri moguća stanja.
        </p>
        <WhereStepper />
        <p>
          Šifriranje u mirovanju uključuje se u konfiguraciji API poslužitelja (objekt <code>EncryptionConfiguration</code> u datoteci <code>encryption-config.yaml</code>, u odjeljku s kodom). Obično se šifriraju samo Secreti; ConfigMape i Deploymenti ostaju čitljivi ako ih ne navedemo. I to je razlika između ConfigMapa i Secreta: lozinka u ConfigMapu ostaje čitljiva u kopiji baze, čak i uz uključeno šifriranje.
        </p>
        <p>
          Uključivanje ne šifrira ono što je već u bazi. Postojeći Secreti ostaju nešifrirani dok ih ponovno ne zapišemo: izlaz naredbe <code>kubectl get secrets -A -o json</code> proslijedimo naredbi <code>kubectl replace -f -</code>. Stare kopije baze ostaju čitljive.
        </p>
        <Callout kind="fact" title="Upravljani klasteri">
          KMS v2 je stabilan od Kubernetesa 1.29, a KMS v1 je zastario. Upravljani klasteri razlikuju se: Amazon EKS od 5. ožujka 2025. sve podatke Kubernetes API-ja šifrira omotničkim šifriranjem (engl. <em>envelope encryption</em>, KMS v2) na klasterima verzije 1.28 i novijima. Za svoj klaster provjerite dokumentaciju pružatelja. (stanje: listopad 2026.)
        </Callout>
        <DeepDive title="Omotnica: DEK i KEK">
          <p>
            KMS v2 ne šalje svaki Secret vanjskom KMS-u. API poslužitelj podatke šifrira ključem za podatke (DEK, engl. <em>data encryption key</em>), a sam DEK šifrira KMS svojim glavnim ključem (KEK, engl. <em>key encryption key</em>), koji nikad ne napušta KMS. API poslužitelj čuva šifrirani DEK uz podatke, pa na disku leže šifrat i šifrirani DEK.
          </p>
          <p>
            Kradljivac diska zato ima dvije zaključane stvari i nijedan ključ: da bi dobio DEK, morao bi ga dati dešifrirati KMS-u, a KMS to radi samo za API poslužitelj klastera. Zato se pristup KMS-u strogo ograničava i bilježi.
          </p>
        </DeepDive>
      </Section>

      <Section id="tko-cita" kicker="isprobajte" title="Tko može pročitati Secret?" lead={
          <>
            Odgovor nije samo „tko smije napisati <code>kubectl get secret</code>”.
          </>
        }>
        <p>
          Kontrola pristupa temeljena na ulogama (engl. <em>role-based access control</em>, <Term id="rbac">RBAC</Term>) određuje tko smije što raditi s kojom vrstom objekata. Uloga (Role) nabraja dopuštene glagole (<code>get</code>, <code>list</code>, <code>watch</code>, <code>create</code>…) na vrstama objekata u jednom Namespaceu. RoleBinding tu ulogu dodjeljuje korisniku ili ServiceAccountu – identitetu pod kojim rade Podovi i botovi. Ugrađene uloge <code>view</code> i <code>edit</code> su ClusterRole; RoleBinding ih veže na jedan Namespace.
        </p>
        <MarginNote tone="red">RBAC samo dopušta – nema pravila „zabrani”</MarginNote>
        <p>
          Dozvole iz više uloga zato se zbrajaju. Isprobajmo tko sve dolazi do lozinke u Namespaceu <code>klopa</code>.
        </p>
        <WhoCanRead />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <code>get</code> nije jedina vrata: <code>list</code> i <code>watch</code> vraćaju cijele objekte, sa sadržajem.
            </li>
            <li>
              Ugrađena uloga <code>view</code> čita Podove, Deploymente i ConfigMape, ali namjerno ne i Secrete. To je stvarna razlika između ConfigMapa i Secreta.
            </li>
            <li>Tko smije stvarati Podove u Namespaceu, može u novi Pod montirati bilo koji Secret iz tog Namespacea – bez ijednog prava na Secrete.</li>
            <li>Napadač u Podu aplikacije čita ono što aplikacija zna. To je granica koju nijedna postavka ne zatvara: aplikacija mora znati lozinku da bi se spojila na bazu.</li>
          </ul>
        </Callout>
        <p>
          Zato vrijedi načelo najmanjih ovlasti: svaki čovjek, bot i ServiceAccount dobiva samo ono što mu treba. Razvojnom timu u produkciji obično je dovoljna uloga s pravom čitanja svega osim Secreta, a pravo stvaranja Podova ima samo pipeline za postavljanje. Ni ServiceAccount same aplikacije ne treba nikakva prava na Secrete: lozinku joj donosi kubelet.
        </p>
      </Section>

      <Section id="promjena" kicker="isprobajte" title="Kada aplikacija vidi novu lozinku" lead="Promjena Secreta u API-ju još nije promjena u aplikaciji.">
        <Predict
          question={
            <>
              Lana promijeni lozinku u Secretu <code>klopa-db</code>. Tri Poda čitaju isti Secret: kao varijablu okruženja, kao datoteku u volumenu i kao jednu datoteku montiranu sa <code>subPath</code>. Što se dogodi?
            </>
          }
          options={['Sva tri Poda odmah koriste novu lozinku.', 'Varijabla odmah, datoteke nakon nekoliko minuta.', 'Datoteka u volumenu osvježi se s odgodom; varijabla tek nakon ponovnog pokretanja; subPath nikad.', 'Nijedan, dok se ne promijeni i Deployment.']}
          correct={2}
          explain={
            <>
              Varijabla okruženja upisuje se pri pokretanju kontejnera. Datoteku u volumenu kubelet osvježi pri sljedećoj sinkronizaciji. Datoteka montirana sa <code>subPath</code> vezana je za staru kopiju i nikad se ne osvježava.
            </>
          }
          then="Provjerite u simulaciji ispod."
        />
        <UpdateTimeline />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Varijabla okruženja upisana je pri pokretanju kontejnera i ne mijenja se do ponovnog pokretanja.</li>
            <li>Datoteku u volumenu kubelet osvježi s odgodom (sinkronizacija i predmemorija, stvarno do oko minute i pol). Aplikacija je mora ponovno pročitati – inače ni nova datoteka ne pomaže.</li>
            <li>
              Datoteka montirana sa <code>subPath</code> nikad se ne osvježava; potreban je novi Pod.
            </li>
            <li>
              Naredba <code>kubectl rollout restart</code> postupno zamijeni Podove Deploymenta novima (kao uvođenje iz predavanja 13), a novi Podovi pročitaju novu vrijednost.
            </li>
          </ul>
        </Callout>
        <Callout kind="tip" title="Promjena konfiguracije kao novo uvođenje">
          Alati poput Helma ili Kustomizea pri generiranju manifesta upišu sažetak (hash) ConfigMapa u predložak Poda. Nova verzija ConfigMapa tada znači i novi predložak, pa Deployment pokrene uvođenje. Ručna promjena ConfigMapa to ne radi.
        </Callout>
      </Section>

      <Section id="simulacija" kicker="simulacija" title="Put tajne" lead="Lozinka baze Klope i devet očiju koje bi je htjele pročitati.">
        <p>
          Sad složimo sve zajedno. Simulacija kreće od stanja iz incidenta: lozinka je varijabla okruženja u <code>deployment.yaml</code>. Svako oko je netko tko bi mogao doći do lozinke. Otvoreno crveno oko čita je, a zatvoreno sivo ne može.
        </p>
        <Predict
          question="Lozinka je u Secretu, uključeno je šifriranje u mirovanju s KMS-om v2 i RBAC s najmanjim ovlastima. Koliko očiju ostaje crveno?"
          options={['nijedno', 'dva', 'pet']}
          correct={1}
          explain="Dva. Pod aplikacije mora znati lozinku, a tko smije stvarati Podove, smije u njih montirati Secret. Ta dva oka ne zatvaraju ni šifriranje ni oduzeta prava na Secrete – samo pažljiv izbor tko smije stvarati Podove i dobro zaštićena aplikacija."
          then="Provjerite u simulaciji."
        />
        <PutTajne />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              Premještanje lozinke iz <code>deployment.yaml</code> u ConfigMap ne zatvara nijedno oko (i dalje 7): lozinka završi u bazi etcd, a uloga view čita i Podove i ConfigMape.
            </li>
            <li>Tek Secret zatvara oko Gita i oko uloge view (5), a šifriranje u mirovanju zatvara kopiju baze (4).</li>
            <li>Lozinka u slici ima jednako crvenih očiju kao Secret bez zaštita (5), ali oči Gita i registra ne zatvara nijedna postavka: stare oznake slike ostaju u registru, a Dockerfile u Gitu. Secretu zaštite dodajemo jednu po jednu.</li>
            <li>Lokalni ključ ostavlja kradljivca diska otvorenim: ključ leži pokraj brave. KMS v2 zatvara i njega.</li>
            <li>
              „Spremi <code>secret.yaml</code> u Git” otvara oko čitatelja Gita i ono ostaje otvoreno – sve dok stara lozinka vrijedi. Zatvara ga tek rotacija.
            </li>
            <li>
              Rotacija s volumenom i aplikacijom koja ponovno čita datoteku ne treba ponovno pokretanje Poda. S varijablom okruženja treba, a sa <code>subPath</code> bez novog Poda ne ide.
            </li>
          </ul>
        </Callout>
        <KeyIdea>
          Base64 je <strong>kostim, a ne brava</strong>. Zaštita dolazi u slojevima: <strong>RBAC s najmanjim ovlastima</strong>, <strong>šifriranje u mirovanju s ključem izvan diska</strong> i lozinka izvan Gita i slike. A tko smije <strong>stvarati Podove u Namespaceu</strong>, čita i njegove Secrete.
        </KeyIdea>
        <DeepDive title="Gdje je simulacija pojednostavljena">
          <ul>
            <li>Postoji jedan Namespace i jedna lozinka. NetworkPolicy, Pod Security Admission i napadi preko čvora nisu modelirani.</li>
            <li>Osvježavanje volumena traje 10 s (sim); u stvarnom klasteru do oko minute i pol.</li>
            <li>Rotacija pretpostavlja da baza neko vrijeme prihvaća i staru i novu lozinku, dok svi Podovi ne prijeđu na novu. U stvarnosti to traži pripremu: dva korisnika baze ili dva ključa.</li>
            <li>Šifriranje u mirovanju pokriva samo Secrete, kao u većini stvarnih konfiguracija. Zato ConfigMap s lozinkom ostaje čitljiv u kopiji baze i uz KMS v2.</li>
          </ul>
        </DeepDive>
      </Section>

      <Section id="kod" kicker="kod" title="ConfigMap, Secret i RBAC u YAML-u" lead="Sve što ste vidjeli u simulaciji stane u nekoliko kratkih datoteka.">
        <p>Postavke koje nisu tajne idu u ConfigMap – po jedan u svakom Namespaceu:</p>
        <CodeBlock
          title="configmap.yaml"
          code={configmapYaml}
          notes={[
            { lines: '6', text: 'u produkciji isti ConfigMap, drugi Namespace' },
            { lines: '8-10', text: 'svaki ključ: jedna varijabla ili datoteka' },
          ]}
        />
        <Callout kind="danger" title="NE SPREMATI U GIT">
          Datoteka <code>secret.yaml</code> sadrži lozinku u običnom tekstu (a i base64 je običan tekst). Lana je primjenjuje sa svojeg laptopa i ne sprema je u repozitorij. Kako tajne ipak držati u Gitu – šifrirane – vidjet ćemo u predavanju 23.
        </Callout>
        <CodeBlock title="secret.yaml" code={secretYaml} mode="open" highlight="10" notes={[{ lines: '10', text: 'stringData: običan tekst – API ga vraća kao base64' }]} />
        <p>Deployment vrijednosti uzima na jedan od dva načina:</p>
        <Tabs
          tabs={[
            {
              label: 'varijable okruženja',
              content: (
                <CodeBlock
                  title="deployment.yaml (env)"
                  code={deploymentEnv}
                  mode="open"
                  notes={[
                    { lines: '8-10', text: 'envFrom: cijeli ConfigMap kao varijable' },
                    { lines: '14-16', text: 'jedna vrijednost iz Secreta; samo pri pokretanju' },
                  ]}
                />
              ),
            },
            {
              label: 'datoteke (volumen)',
              content: (
                <CodeBlock
                  title="deployment.yaml (volumen)"
                  code={deploymentVolume}
                  mode="open"
                  notes={[
                    { lines: '9-11', text: 'Secret kao direktorij: osvježava se s odgodom' },
                    { lines: '12-14', text: 'subPath: ova se datoteka nikad ne osvježava' },
                  ]}
                />
              ),
            },
          ]}
        />
        <p>Koliko je base64 „zaštita”, pokazuje jedna naredba:</p>
        <Terminal
          title="Lanin laptop"
          lines={[
            { cmd: "kubectl get secret klopa-db -n klopa -o jsonpath='{.data.DB_PASSWORD}'" },
            { out: 'a2xvcGFfZGI=' },
            { cmd: "kubectl get secret klopa-db -n klopa -o jsonpath='{.data.DB_PASSWORD}' | base64 -d" },
            { out: 'klopa_db', tone: 'bad', note: 'Jedna naredba i lozinka je vani.', who: 'davor' },
          ]}
        />
        <p>
          Zato je važno tko smije izvršiti prvu naredbu. Uloga <code>razvoj</code> daje Ivi pravo čitanja svega što joj treba – osim Secreta:
        </p>
        <CodeBlock
          title="rbac.yaml"
          code={rbacYaml}
          notes={[
            { lines: '8-10', text: 'čitanje svega potrebnog – bez secrets' },
            { lines: '22-25', text: 'tko dobiva ulogu' },
          ]}
        />
        <Terminal
          title="Davorov laptop"
          lines={[
            { comment: 'Davor (cluster-admin) provjerava tuđa prava; --as traži pravo impersonate' },
            { comment: 'Iva ima ulogu razvoj, Lana ugrađenu ulogu edit' },
            { cmd: 'kubectl auth can-i get secrets -n klopa --as iva@klopa.example' },
            { out: 'no', tone: 'ok' },
            { cmd: 'kubectl auth can-i get configmaps -n klopa --as iva@klopa.example' },
            { out: 'yes' },
            { cmd: 'kubectl auth can-i list secrets -n klopa --as lana@klopa.example' },
            { out: 'yes', tone: 'warn' },
            { cmd: 'kubectl auth can-i create pods -n klopa --as lana@klopa.example' },
            { out: 'yes', tone: 'warn', note: 'create pods = i čitanje Secreta, zaobilaznim putem.', who: 'davor' },
          ]}
        />
        <p>Šifriranje u mirovanju postavlja se u konfiguraciji API poslužitelja. Na upravljanim klasterima to radi pružatelj; na vlastitom klasteru izgleda ovako:</p>
        <CodeBlock title="encryption-config.yaml" code={encryptionYaml} mode="closed" notes={[{ lines: '7-8', text: 'šifriraju se samo navedene vrste' }, { lines: '10-14', text: 'KMS v2: ključ (KEK) je izvan klastera' }, { lines: '20', text: 'nakon uključivanja ponovno zapišite postojeće Secrete' }]} />
      </Section>

      <Section id="pravila" kicker="sigurnost" title="Pravila za tajne" lead="Kratki popis koji Davor lijepi iznad stola.">
        <Checklist
          items={[
            <>
              Secret s pravom vrijednošću nikad ne spremajte u Git – ni kao base64. Ako je procurio, <Mark c="pink">rotirajte</Mark>: brisanje commita ne pomaže, klonovi ga čuvaju.
            </>,
            <>
              Nikad <code>ENV</code> ni <code>ARG</code> s tajnom u Dockerfileu. Za tajne pri izgradnji koristite BuildKit secret mount (predavanje 8).
            </>,
            <>Radije datoteka nego varijabla okruženja: varijable nasljeđuju svi procesi-djeca, a alati za dijagnostiku i izvješća o rušenju rado ih ispisuju, pa lako završe u logovima i ispisima memorije.</>,
            <>Uključite šifriranje u mirovanju, s ključem izvan upravljačke ravnine (KMS v2) gdje god možete.</>,
            <>
              RBAC s najmanjim ovlastima: tko ne treba Secrete, nema ni <code>get</code>, ni <code>list</code>, ni <code>watch</code> na njima. I pazite tko smije stvarati Podove.
            </>,
            <>Postavke koje nisu tajne – u ConfigMap, tajne – u Secret. Odvojeno ih štite RBAC i šifriranje.</>,
          ]}
        />
        <DeepDive title="Namespace nije sigurnosna granica">
          <p>
            Namespace dijeli imena i određuje opseg uloga, ali sam ne zaustavlja ništa. Podovi iz različitih Namespacea po zadanom razgovaraju mrežom, a Pod s povišenim ovlastima može doći do čvora i svega što je na njemu – pa i do Secreta drugih Podova na tom čvoru.
          </p>
          <p>Granicu čine tek zajedno: RBAC po Namespaceu, NetworkPolicy (tko smije razgovarati s kim) i Pod Security Admission, koji po Namespaceu provodi razinu privileged, baseline ili restricted.</p>
          <Callout kind="fact">PodSecurityPolicy uklonjen je u Kubernetesu 1.25; zamijenio ga je Pod Security Admission. (stanje: listopad 2026.)</Callout>
        </DeepDive>
        <p>
          Jedno pravilo ostaje neugodno: <code>secret.yaml</code> ne smije u Git, a sve ostalo Klopa drži u Gitu. U predavanju 23 vidjet ćemo kako tajnu držati u Gitu šifriranu (Sealed Secrets) ili je dovlačiti iz vanjskog trezora (External Secrets Operator).
        </p>
      </Section>

      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            {
              statement: 'Samo administratori, ili samo oni s pravom get, mogu čitati Secrete.',
              fact: false,
              explain: (
                <>
                  I <code>list</code> i <code>watch</code> vraćaju sadržaj, a tko smije stvarati Podove u Namespaceu, može u njih montirati njegove Secrete.
                </>
              ),
            },
            {
              statement: 'Secret smijem spremiti u Git, ionako je kodiran.',
              fact: false,
              explain: 'Base64 dekodira svatko s klonom repozitorija – i to zauvijek, jer povijest Gita pamti svaki commit.',
            },
            {
              statement: 'ConfigMap ili Secret, svejedno je.',
              fact: false,
              explain: 'Imaju odvojen RBAC (uloga view čita ConfigMape, ali ne Secrete), alati s njima postupaju drukčije, a šifriranje u mirovanju obično pokriva samo Secrete.',
            },
            {
              statement: 'Varijable okruženja najsigurniji su način predaje tajne.',
              fact: false,
              explain: 'Nasljeđuju ih svi procesi-djeca, a alati za dijagnostiku i izvješća o rušenju rado ih ispisuju, pa završe u logovima i ispisima memorije. Datoteka je bolji izbor.',
            },
            {
              statement: 'Tko smije stvarati Podove u Namespaceu, može pročitati i njegove Secrete.',
              fact: true,
              explain: 'Novi Pod montira Secret, a kubelet mu donese dešifriranu vrijednost. Zato je pravo stvaranja Podova jednako osjetljivo kao pravo čitanja Secreta.',
            },
          ]}
        />
      </Section>

      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Ista slika, različite postavke: ConfigMap za ono što nije tajna, Secret za lozinke i ključeve. Aplikacija ih vidi kao varijable okruženja ili datoteke.',
            'Base64 je kodiranje, ne šifriranje. Po zadanom Secret leži nešifriran u bazi etcd; šifriranje u mirovanju s ključem izvan diska (KMS v2) štiti kopije i diskove.',
            <>
              Secret čitaju: tko ima <code>get</code>, <code>list</code> ili <code>watch</code> na <code>secrets</code>, tko smije stvarati Podove u Namespaceu i aplikacija koja ga koristi. Uloga <code>view</code> vidi ConfigMape, ali ne Secrete.
            </>,
            <>
              Nova vrijednost: varijabla okruženja tek nakon ponovnog pokretanja, volumen s odgodom (ako je aplikacija ponovno pročita), <code>subPath</code> nikad.
            </>,
            'Tajne nikad u Git ni u sliku. Procurjelu tajnu treba rotirati – brisanje commita ne pomaže.',
          ]}
        />
        <StoryMap at="16" caption="Klopa nakon ovog predavanja: postavke u ConfigMapima, lozinke u Secretima." />
        <Quiz
          id="l16"
          questions={[
            {
              q: (
                <>
                  Lana je promijenila lozinku u Secretu <code>klopa-db</code>. Deset minuta poslije API Podovi i dalje šalju staru lozinku. Lozinku čitaju preko <code>secretKeyRef</code>. Što je najvjerojatniji uzrok?
                </>
              ),
              options: [
                'kubelet još nije osvježio volumen',
                <>
                  varijabla okruženja upisuje se samo pri pokretanju kontejnera – Podove treba ponovno pokrenuti, npr. <code>kubectl rollout restart</code>
                </>,
                <>
                  Secret je označen s <code>immutable: true</code>, pa promjena nije prošla
                </>,
                'nova vrijednost nije ispravno kodirana u base64',
              ],
              correct: 1,
              explain: (
                <>
                  <code>secretKeyRef</code> puni varijablu okruženja pri pokretanju kontejnera i više je ne osvježava. Volumen bi se osvježio s odgodom, a promjenu nepromjenjivog Secreta API bi odbio s greškom.
                </>
              ),
            },
            {
              q: (
                <>
                  Petra ima ugrađenu ulogu <code>view</code> u Namespaceu <code>klopa</code>. Što od ovoga može pročitati?
                </>
              ),
              options: [
                <>
                  Secret <code>klopa-db</code>
                </>,
                'ConfigMap i varijable okruženja napisane izravno u Deploymentu',
                'ništa, view vidi samo imena objekata',
                'sve u Namespaceu',
              ],
              correct: 1,
              explain: 'Uloga view čita Podove, Deploymente, ConfigMape i logove, ali namjerno ne Secrete. Lozinka napisana izravno u Deploymentu ili u ConfigMapu zato nije tajna ni za koga s ulogom view.',
            },
            {
              q: (
                <>
                  CI bot smije stvarati Deploymente u Namespaceu <code>klopa</code>, a nema nijedno pravo na <code>secrets</code>. Može li doći do lozinke iz Secreta <code>klopa-db</code>?
                </>
              ),
              options: [
                <>
                  ne – bez <code>get secrets</code> nema pristupa
                </>,
                'da – stvori Deployment čiji Pod montira Secret i pošalje vrijednost van klastera',
                'samo ako je šifriranje u mirovanju isključeno',
                <>
                  samo uz <code>kubectl exec</code>
                </>,
              ],
              correct: 1,
              explain: 'Tko smije stvarati Podove u Namespaceu, smije u njih montirati njegove Secrete; kubelet vrijednost sam donese u Pod. Šifriranje u mirovanju tu ne pomaže, jer API poslužitelj kubeletu daje dešifriranu vrijednost.',
            },
            {
              q: (
                <>
                  Klaster šifrira Secrete pružateljem <code>secretbox</code>, s ključem u datoteci na upravljačkoj ravnini. Od koga to štiti?
                </>
              ),
              options: ['od kradljivca kopije baze etcd, ali ne od kradljivca cijelog diska upravljačke ravnine', 'od svakoga tko dođe do diska', <>od korisnika s pravom <code>get secrets</code></>, 'ni od koga, secretbox je samo base64'],
              correct: 0,
              explain: 'Kopija baze sadrži samo šifrat, ali ključ leži na istom disku, pa kradljivac diska ima oboje. Korisnik s pravom get dobije dešifriranu vrijednost od API-ja – šifriranje u mirovanju štiti samo podatke na disku. Ključ izvan diska daje tek KMS v2.',
            },
            {
              q: (
                <>
                  Datoteka <code>postavke.ini</code> montirana je iz ConfigMapa sa <code>subPath</code>. Lana promijeni ConfigMap. Kada će aplikacija u postojećem Podu vidjeti promjenu?
                </>
              ),
              options: [
                'odmah',
                'nakon sljedeće sinkronizacije kubeleta',
                'nikad – tek novi Pod dobiva novu datoteku',
                <>
                  nakon sljedećeg <code>kubectl apply</code> Deploymenta, bez obzira na promjene
                </>,
              ],
              correct: 2,
              explain: (
                <>
                  Datoteka montirana sa <code>subPath</code> vezana je za kopiju napravljenu pri pokretanju i nikad se ne osvježava. Volumen bez <code>subPath</code> osvježio bi se s odgodom.
                </>
              ),
            },
            {
              q: (
                <>
                  Ponovimo predavanje 8: je li sigurno lozinku upisati u Dockerfile s <code>ENV</code> ako je repozitorij privatan?
                </>
              ),
              options: [
                'da, privatni repozitorij je dovoljan',
                'ne – vrijednost ostaje u slici, pa je čita svatko tko povuče sliku, a usto je i u Dockerfileu u Gitu',
                <>
                  da, ako slika ima oznaku verzije, a ne <code>latest</code>
                </>,
                <>
                  da, jer Kubernetes vrijednost iz <code>ENV</code> uvijek zamijeni vrijednošću iz Secreta
                </>,
              ],
              correct: 1,
              explain: (
                <>
                  <code>ENV</code> je zapisan u konfiguraciji slike (vidi ga <code>docker image inspect</code>) i ostaje u svakoj oznaci u registru. Tajne za izgradnju idu kroz BuildKit secret mount, a tajne za rad u Secret.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Ista slika radi u razvoju, u testnom okruženju i u produkciji; razlike žive u ConfigMapima.',
            'Lozinka je izvan Gita i slike, a uloga view je više ne vidi.',
            'Rotacija lozinke bez ponovnog pokretanja Podova: volumen i aplikacija koja ponovno čita datoteku.',
          ]}
          paid={[
            'Secret je i dalje samo base64: bez šifriranja u mirovanju i strogog RBAC-a lozinka je otvorena.',
            <>
              <code>secret.yaml</code> ne smije u Git, pa ga Lana zasad primjenjuje ručno, s laptopa.
            </>,
            'Testno okruženje sada živi u istom klasteru kao produkcija i dijeli iste čvorove.',
          ]}
          next={
            <>
              Testno okruženje sada živi u istom klasteru, u Namespaceu <code>klopa-staging</code>. Ivini Podovi za test opterećenja rezerviraju po cijelu procesorsku jezgru ili jednu i pol, a novi potrošač iz reda poruka koji obrađuje fotografije jela nema ograničenje memorije i pojede memoriju čvora node-2. Produkcijski API Podovi umiru, a novi Pod koji Lana pokrene ostaje u stanju <code>Pending</code>, iako nadzor pokazuje da klaster troši tek 30 % procesora.
            </>
          }
        />
      </Section>
    </>
  )
}

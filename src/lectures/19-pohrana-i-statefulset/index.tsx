import {
  Analogy,
  Callout,
  CodeBlock,
  Compare,
  CostNote,
  DeepDive,
  Figure,
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
  Term,
  Terminal,
} from '../../kit'
import pvcYaml from './code/pvc.yaml?raw'
import statefulsetYaml from './code/statefulset.yaml?raw'
import { AccessModes } from './sims/AccessModes'
import { ClaimStepper } from './sims/ClaimStepper'
import { DecisionTree } from './sims/DecisionTree'
import { IdentitySim } from './sims/IdentitySim'
import { NodeLossStepper } from './sims/NodeLossStepper'
import { ThreeDbStepper } from './sims/ThreeDbStepper'
import { VolumesSim } from './sims/VolumesSim'

export default function Lecture() {
  return (
    <>
      <Section id="incident" kicker="priča" title="Jutro bez narudžbi" lead="Pod smije umrijeti. Narudžbe ne smiju.">
        <IncidentCard
          no={19}
          when="utorak, 07:40"
          title="Postgres se preselio na drugi čvor – bez ijedne narudžbe"
          who="davor"
          says={['Baza je prazna!', 'Sve narudžbe?!']}
          preset="volumeni · db-kontejner (Obriši Pod u 60. s) · statefulset · Deployment postgres bez volumena (60. s)"
          seed={42}
          metrics={[
            { label: 'izgubljeno', value: '111', tone: 'bad' },
            { label: 'u novom Podu', value: '0', tone: 'bad' },
            { label: 'baze iza Servicea', value: '3', tone: 'bad' },
            { label: 'čitanje uspije', value: '33 %', tone: 'bad' },
          ]}
        >
          Cluster Autoscaler je noću ispraznio i uklonio čvor. Postgres, koji je Iva pokrenula „kao i sve ostalo” u Deploymentu bez trajnog volumena, dobio je novi Pod na drugom čvoru – s praznom bazom. A tjedan ranije, uz <code>replicas: 3</code>, narudžbe su se dijelile na tri baze.
        </IncidentCard>
        <p>
          Ono što je jučer bilo dobro za <code>klopa-api</code> pokazalo se pogubnim za bazu. Pod je prolazan: Kubernetes ga smije ubiti i zamijeniti novim Podom na drugom čvoru kad god mu to odgovara, a <Term id="cluster-autoscaler">Cluster Autoscaler</Term> to radi svaku noć. Za aplikaciju bez stanja to je odlično. Za bazu je to katastrofa – ako podatci žive u samom Podu.
        </p>
        <p>
          Druga polovica priče još je gora. Tjedan prije, Iva je Postgresu postavila <code>replicas: 3</code>, „za svaki slučaj”. Nastale su tri baze s tri različite tablice narudžbi, a Service je svaku novu vezu slao jednoj od njih nasumično. Studenti su naručivali, a narudžbe su „nestajale” i „vraćale se”.
        </p>
        <Callout kind="key" title="Pitanje ovog predavanja">
          Gdje u Kubernetesu žive podatci tako da prežive Pod – i kako bazi dati stalan identitet, a da ne dobijemo dvije baze s istim imenom?
        </Callout>
      </Section>

      <Section id="prezivljavaju" kicker="simulacija" title="Preživljavaju li podatci?" lead="Tri Postgresa, tri mjesta za podatke, tri načina da ih uništimo.">
        <p>
          Postgres sprema retke u datoteke. Pitanje je samo <em>gdje</em> su te datoteke. Usporedimo tri mjesta:
        </p>
        <ul>
          <li>
            <strong>sloj kontejnera za pisanje</strong> (engl.{' '}
            <Term id="writable-layer">
              <em>writable layer</em>
            </Term>
            , iz 8. predavanja) – ako baza nema volumen, piše ovdje;
          </li>
          <li>
            <strong>
              <Term id="emptydir">emptyDir</Term>
            </strong>{' '}
            – prazan direktorij koji nastaje s Podom i nestaje s njim;
          </li>
          <li>
            <strong>
              <Term id="persistentvolume">PersistentVolume</Term>
            </strong>{' '}
            (trajni volumen) – disk s vlastitim životnim vijekom, u oblaku obično mrežni disk izvan čvora.
          </li>
        </ul>
        <Predict
          question="Proces Postgresa padne i kubelet ponovno pokrene kontejner u istom Podu. U kojim bazama narudžbe ostaju?"
          options={['Samo na PersistentVolumeu', 'U emptyDiru i na PersistentVolumeu', 'U sve tri – Pod je isti', 'Ni u jednoj']}
          correct={1}
          explain="Novi kontejner kreće od slike, pa je njegov sloj za pisanje prazan. emptyDir pripada Podu, a Pod je ostao isti. PersistentVolume ionako ne ovisi o Podu."
          then="Provjerite u simulaciji: najprije „Ponovno pokreni kontejner”, zatim „Obriši Pod”."
        />
        <VolumesSim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <strong>Ponovno pokretanje kontejnera</strong> briše samo sloj kontejnera: db-kontejner kreće od nule, emptyDir i PV ostaju.
            </li>
            <li>
              <strong>Brisanje Poda</strong> (i svako „preseljenje”: stari Pod se briše, a novi nastaje drugdje) briše i emptyDir – zato <code>kubectl drain</code> takav Pod seli tek uz zastavicu <code>--delete-emptydir-data</code>. Preživi samo PV.
            </li>
            <li>
              <strong>Pad čvora</strong> je najsporiji: novi Pod nastaje tek kad se stari označi za brisanje, a disk se smije premjestiti tek nakon prisilnog odspajanja (6 min) ili oznake out-of-service. Do toga dolazimo za dva odjeljka.
            </li>
          </ul>
        </Callout>
        <Analogy
          title="Kutija za ručak i hladnjak menze"
          breaksDown="Hladnjak (disk RWO) smije biti priključen samo u jednu zgradu-čvor odjednom, a seljenje nakon nestanka struje traje minutama. I ništa se u hladnjaku samo ne kopira."
        >
          Hrana u posudici (kontejner) baca se čim teta Mira zamijeni jelo. emptyDir je pretinac u kutiji za ručak (Pod): preživi zamjenu jela, ali ne i kad se kutija baci. PersistentVolume je hladnjak menze: kutije dolaze i odlaze, a hrana u hladnjaku ostaje.
        </Analogy>
        <DeepDive title="Zar slika postgres nema VOLUME?">
          <p>
            Ima. Zato je u Docker Composeu (9. predavanje) bez imenovanog volumena nastajao anonimni volumen. Kubernetes ne stvara anonimne volumene: kontejnerski runtime takav direktorij veže uz sam kontejner, pa nestaje s ponovnim pokretanjem. Bez volumena u Podu podatci žive i umiru s kontejnerom – baš kao db-kontejner u simulaciji.
          </p>
        </DeepDive>
      </Section>

      <Section id="narudzbenica" kicker="koncept" title="Narudžbenica za disk: PVC, PV i StorageClass">
        <MarginNote>PVC = što Pod traži, PV = što dobije</MarginNote>
        <p>
          Pod ne zna ništa o diskovima u oblaku. On samo kaže što treba: koliko prostora, kako mu se pristupa i iz koje „tvornice”. Taj zahtjev zove se <Term id="persistentvolumeclaim">PersistentVolumeClaim</Term> (PVC). Klaster ga poveže s jednim <strong>PersistentVolumeom</strong> (PV) – zapisom o stvarnom disku.
        </p>
        <p>
          Disk danas gotovo uvijek nastaje na zahtjev. To radi <Term id="storageclass">StorageClass</Term> (klasa pohrane): predložak u kojem piše koji <Term id="csi-driver">CSI driver</Term> izrađuje disk, kada i što se s diskom događa nakon brisanja. Pogledajmo cijeli put jedne narudžbenice.
        </p>
        <ClaimStepper />
        <Callout kind="warn" title="Brisanje PVC-a briše podatke">
          Dinamički stvoreni volumeni imaju zadani <code>reclaimPolicy: Delete</code>: kad nestane PVC, nestanu i PV i disk. Zaštita <code>pvc-protection</code> samo odgađa brisanje dok ga neki Pod koristi. Za važne podatke trebaju sigurnosne kopije, a ne nada.
        </Callout>
      </Section>

      <Section id="pristup" kicker="koncept" title="Tko smije do diska – i što kad čvor padne">
        <p>
          Mrežni disk u oblaku je poput USB diska: u jednom trenutku spojen je na jedno računalo. To opisuje <Term id="access-mode">način pristupa</Term> (engl. <em>access mode</em>). Pazite na <Mark>RWO: znači jedan čvor, ne jedan Pod</Mark>. Dva Poda na istom čvoru smiju dijeliti RWO disk; ako baš treba jedan Pod, postoji RWOP.
        </p>
        <Figure caption="Načini pristupa kao pitanje „tko se smije priključiti na hladnjak”. Za RWX treba dijeljeni datotečni sustav (npr. NFS); obični diskovi u oblaku nude RWO." wide>
          <AccessModes />
        </Figure>
        <p>
          Kod planiranog seljenja (npr. <code>kubectl drain</code>) sve je brzo: kubelet zaustavi Pod, disk se odspoji i spoji na novi čvor. Problem je <strong>nagli pad</strong>: stroj ostane bez struje i nitko ne može potvrditi da je stari Postgres stvarno stao. Dok to nije potvrđeno, spojiti isti disk drugom stroju značilo bi riskirati dva procesa nad istim datotekama. Zato Kubernetes čeka.
        </p>
        <NodeLossStepper />
        <Callout kind="fact" title="Taint out-of-service">
          Oporavak nakon naglog gašenja čvora (engl. <em>non-graceful node shutdown</em>) stabilan je od Kubernetesa 1.28 i radi taintom{' '}
          <code style={{ overflowWrap: 'anywhere', whiteSpace: 'normal', wordBreak: 'break-all' }}>kubectl taint nodes node-3 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute</code>. Taint stavite tek kad ste sigurni da je stroj ugašen, a maknite ga kad se čvor popravi. Zadana čekanja: ≈ 50 s do NotReady, zatim 300 s dok se Podovi ne označe za brisanje i još 6 minuta do prisilnog odspajanja (stanje: listopad 2026.).
        </Callout>
      </Section>

      <Section id="tri-baze" kicker="problem" title="Tri baze umjesto jedne">
        <p>
          Vratimo se drugoj polovici incidenta. Deployment je savršen za <code>klopa-api</code>: svi Podovi su jednaki, a Service šalje vezu bilo kojem. Upravo zato je Deployment krivi alat za bazu – Podovi Postgresa <em>nisu</em> jednaki, jer svaki drži svoje podatke.
        </p>
        <ThreeDbStepper />
        <Myth myth={<>Postgres s <code>replicas: 3</code> je klaster baze.</>}>
          Dobili ste tri neovisne baze (ili, s jednim diskom, procese koji se svađaju oko istog direktorija). Kopije podataka radi <Term id="read-replica">replikacija</Term> same baze: primarna baza šalje promjene replikama, kao što smo spomenuli u 5. predavanju. Kubernetes za to nema gumb.
        </Myth>
      </Section>

      <Section id="statefulset" kicker="isprobajte" title="Identitet: StatefulSet" lead="Stalno ime, stalan disk, red – i nikad dva Poda s istim imenom.">
        <p>
          Goli Pod nije rješenje: nakon pada čvora nitko ga ne vraća (12. predavanje). Bazi ne treba ni „bilo koji Pod”, nego <em>određeni</em> Pod sa svojim diskom. To daje <Term id="statefulset">StatefulSet</Term>:
        </p>
        <ul>
          <li>
            <strong>ime</strong>: Podovi se zovu <code>db-0</code>, <code>db-1</code>, <code>db-2</code>, a obrisani <code>db-1</code> vraća se kao <code>db-1</code>;
          </li>
          <li>
            <strong>disk</strong>: iz <code>volumeClaimTemplates</code> svaki dobiva svoj PVC (<code>data-db-1</code>) i uvijek se vraća na njega;
          </li>
          <li>
            <strong>red</strong>: <code>db-1</code> nastaje tek kad je <code>db-0</code> spreman, a smanjuje se od najvišeg broja;
          </li>
          <li>
            <strong>adresu</strong>: <Term id="headless-service">headless Service</Term> (<code>clusterIP: None</code>) u DNS-u vraća IP adrese samih Podova, pa <code>db-1.db.klopa.svc.cluster.local</code> uvijek vodi do <code>db-1</code>.
          </li>
        </ul>
        <Analogy title="Numerirana mjesta u dvorani" who="petra" breaksDown="Mjesto ne kopira ono što vam je u torbi: StatefulSet ne replicira podatke između db-0, db-1 i db-2.">
          Na predavanju bez rasporeda sjedate bilo gdje (Deployment). Na ispitu svatko ima svoje numerirano mjesto: db-1 uvijek sjeda na mjesto 1, sa svojom torbom (PVC) ispod stolca.
        </Analogy>
        <Compare
          left={{
            title: 'Deployment',
            tone: 'blue',
            points: [
              <>
                nasumična imena (<code>postgres-…-q5f9g</code>)
              </>,
              'svi Podovi koriste isti PVC (ili nijedan)',
              'novi Pod odmah, i dok stari još „postoji”',
              <>
                idealno za <code>klopa-api</code>
              </>,
            ],
          }}
          right={{
            title: 'StatefulSet',
            tone: 'teal',
            points: [
              <>
                stalna imena <code>db-0</code>, <code>db-1</code>, <code>db-2</code>
              </>,
              <>
                PVC po Podu: <code>data-db-N</code>
              </>,
              <>
                nikad dva <code>db-1</code>: radije čeka
              </>,
              'za aplikacije sa stanjem – bez replikacije',
            ],
          }}
        />
        <IdentitySim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Smanjenje briše najviši redni broj, a PVC ostaje. Vraćeni db-2 nastavlja točno gdje je stao.</li>
            <li>Brojevi na hladnjacima se razlikuju: svaki db-N je zasebna baza. StatefulSet ne kopira ništa.</li>
            <li>Nakon naglog pada čvora db-N ostaje Terminating dok netko ne potvrdi da je stroj ugašen. Deployment bi stvorio zamjenski Pod čim stari postane Terminating (nakon oko 6 minuta), a taj bi onda čekao disk (Multi-Attach).</li>
          </ul>
        </Callout>
        <KeyIdea>
          Podovi su prolazni, a <strong>pohrana ima vlastiti životni vijek</strong>. StatefulSet bazi daje <strong>identitet – ime, disk i red</strong> – i radije čeka nego da riskira dva db-1. <strong>Replikacija ostaje posao baze.</strong>
        </KeyIdea>
      </Section>

      <Section id="kad-nije-dovoljno" kicker="koncept" title="Kad StatefulSet nije dovoljan" prop="helm">
        <p>
          StatefulSet zna pokrenuti tri Postgresa s imenima i diskovima, ali ne zna ništa o Postgresu. Ne zna da <code>db-0</code> treba biti primarna baza, ne zna prebaciti ulogu kad ona padne i ne radi sigurnosne kopije. To znanje dodaje <Term id="operator">operator</Term>: vlastiti tip objekta (<Term id="crd">CRD</Term>, npr. <code>Cluster</code>) i kontroler koji vodi bazu – primjer je CloudNativePG. Druga mogućnost je upravljana baza: bazu vodi pružatelj usluge, a mi plaćamo.
        </p>
        <Figure caption="Gdje bi trebao živjeti Postgres? Za produkcijsku Klopu preporučujemo upravljanu bazu ili operator. U tečaju Postgres ostaje u StatefulSetu da bismo vidjeli mehaniku." wide>
          <DecisionTree />
        </Figure>
        <p>
          Što god odabrali, trebaju vam <strong>sigurnosne kopije</strong>: snimka diska (engl. <em>snapshot</em>) ili <code>pg_dump</code> na drugo mjesto. Trajni volumen štiti od pada Poda, ali ne i od <code>DROP TABLE</code> ni od obrisanog PVC-a.
        </p>
        <Callout kind="fact" title="Stari vodiči s bitnami slikama">
          Mnogi stari vodiči pokreću bazu sa slikama <code>bitnami/postgresql</code>. Besplatni katalog premješten je 2025. u <code>bitnamilegacy</code>, bez nadogradnji, a 29. rujna 2025. iz <code>docker.io/bitnami</code> uklonjene su verzionirane oznake – ostao je samo mali skup slika s oznakom <code>latest</code>. Primjeri s fiksnom oznakom poput <code>bitnami/postgresql:16.x</code> danas ne rade (stanje: listopad 2026.).
        </Callout>
      </Section>

      <Section id="kod" kicker="kod" title="Volumeni i StatefulSet u YAML-u">
        <p>Ovo što ste vidjeli u animacijama upravo su ovi retci. Najprije narudžbenica i tvornica:</p>
        <CodeBlock
          title="pvc.yaml"
          code={pvcYaml}
          caption="PVC traži 10Gi u načinu RWO iz StorageClassa standard; StorageClass obično postavlja pružatelj klastera."
          notes={[
            { lines: '8-9', text: 'RWO: jedan čvor, ne jedan Pod' },
            { lines: '10', text: 'koja „tvornica” izrađuje disk' },
            { lines: '23', text: 'zadano: s PVC-om nestaje i disk' },
            { lines: '24', text: 'prvo čvor (i zona), pa disk' },
          ]}
        />
        <p>StatefulSet i headless Service za Klopin Postgres:</p>
        <CodeBlock
          title="statefulset.yaml"
          code={statefulsetYaml}
          mode="preview"
          previewLines={24}
          caption="Headless Service daje DNS imena, a volumeClaimTemplates po jedan PVC za svaki redni broj."
          notes={[
            { lines: '8', text: 'headless: DNS vraća IP adrese Podova' },
            { lines: '21', text: 'db-0.db.klopa.svc.cluster.local' },
            { lines: '22', text: 'jedna baza; db-1, db-2 tek uz replikaciju' },
            { lines: '55', text: 'postgres:18+: volumen na /var/lib/postgresql' },
            { lines: '56-64', text: 'svaki db-N dobiva svoj PVC data-db-N' },
            { lines: '65-67', text: 'zadano: PVC-ovi ostaju' },
          ]}
        />
        <Callout kind="warn" title="Na koju se bazu spaja klopa-api?">
          <code>klopa-api</code> se spaja na <code>db-0.db.klopa.svc.cluster.local</code> – zato u ConfigMapu iz 16. predavanja mijenjamo <code>DB_HOST</code>. Tri Poda u simulaciji služe samo da vidimo redoslijed i diskove: bez replikacije to su tri baze.
        </Callout>
        <Callout kind="fact" title="Putanja podataka u slici postgres">
          Slike <code>postgres:18</code> i novije drže podatke u <code>/var/lib/postgresql/&lt;glavna verzija&gt;/docker</code> (za 18: <code>/var/lib/postgresql/18/docker</code>), pa volumen montiramo na <code>/var/lib/postgresql</code>. To je dobro i za diskove u oblaku: novi disk u korijenu ima direktorij <code>lost+found</code>, a Postgres ne želi pokrenuti bazu u direktoriju koji nije prazan. Stari vodiči montiraju <code>/var/lib/postgresql/data</code> – sa slikom 18 tamo podatci ne završe (stanje: listopad 2026.).
        </Callout>
        <p>
          Kad je PVC dulje vrijeme <code>Pending</code>, odgovor je gotovo uvijek u događajima. Uz <code>WaitForFirstConsumer</code> Pending je normalan dok ga nijedan Pod ne koristi – ali ne i ovo:
        </p>
        <Terminal
          title="Zašto je PVC Pending?"
          lines={[
            { cmd: 'kubectl get sc,pv,pvc -n klopa' },
            { out: 'NAME                                            PROVISIONER       RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE' },
            { out: 'storageclass.storage.k8s.io/standard (default)  ebs.csi.aws.com   Delete          WaitForFirstConsumer   true                   40d' },
            { out: '' },
            { out: 'NAME                                STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE' },
            { out: 'persistentvolumeclaim/db-pvc-data   Pending                                      standrad       <unset>                 3m' },
            { cmd: 'kubectl describe pvc db-pvc-data -n klopa' },
            { out: 'Events:' },
            { out: '  Type     Reason              Age                From                         Message' },
            { out: '  Warning  ProvisioningFailed  12s (x14 over 3m)  persistentvolume-controller  storageclass.storage.k8s.io "standrad" not found', tone: 'bad', note: 'tipfeler u storageClassName – takva tvornica ne postoji', who: 'iva' },
          ]}
        />
        <p>A ovako se oporavlja StatefulSet nakon naglog pada čvora – tek nakon provjere da je stroj stvarno ugašen:</p>
        <Terminal
          title="node-3 je ugašen"
          lines={[
            { cmd: 'kubectl get pods -o wide -n klopa' },
            { out: 'NAME   READY   STATUS        RESTARTS   AGE   IP           NODE     NOMINATED NODE   READINESS GATES' },
            { out: 'db-0   1/1     Terminating   0          3d    10.244.3.2   node-3   <none>           <none>', note: 'db-0 čeka: StatefulSet ne radi drugi db-0', who: 'davor' },
            { comment: 'U konzoli oblaka provjereno: stroj node-3 je ugašen.' },
            { comment: 'node-2 je u istoj zoni kao disk data-db-0.' },
            { cmd: 'kubectl taint nodes node-3 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute' },
            { out: 'node/node-3 tainted', tone: 'ok' },
            { cmd: 'kubectl get pod db-0 -o wide -n klopa' },
            { out: 'NAME   READY   STATUS    RESTARTS   AGE   IP           NODE     NOMINATED NODE   READINESS GATES' },
            { out: 'db-0   1/1     Running   0          21s   10.244.2.3   node-2   <none>           <none>' },
            { comment: 'Kad se node-3 popravi, taint se makne:' },
            { cmd: 'kubectl taint nodes node-3 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute-' },
          ]}
        />
      </Section>

      <Section id="provjera" kicker="provjera" title="Mit ili istina, pa provjera">
        <MythOrFact
          items={[
            { statement: 'Datotečni sustav kontejnera je trajan.', fact: false, explain: 'Sloj za pisanje pripada jednom kontejneru. Ponovno pokrenut ili zamijenjen kontejner kreće od slike – bez vaših redaka.' },
            {
              statement: (
                <>
                  PVC koji Pod koristi neće nestati odmah nakon <code>kubectl delete pvc</code>.
                </>
              ),
              fact: true,
              explain: (
                <>
                  Zaštita <code>pvc-protection</code> drži ga u stanju <code>Terminating</code> dok ga neki Pod koristi. Tek tada nestaju PVC, PV i (uz <code>reclaimPolicy: Delete</code>) disk.
                </>
              ),
            },
            { statement: 'StatefulSet replicira podatke između svojih Podova.', fact: false, explain: 'StatefulSet daje samo identitet: ime, disk, red i DNS. Kopije podataka radi baza (replikacija) ili operator.' },
            {
              statement: 'Brisanje StatefulSeta briše i podatke.',
              fact: false,
              explain: (
                <>
                  Podovi nestaju, a PVC-ovi ostaju (zadano: <code>Retain</code>). Ponovno primijenjen StatefulSet nađe svoje stare diskove.
                </>
              ),
            },
          ]}
        />
        <Recap
          points={[
            'Sloj kontejnera nestaje s ponovnim pokretanjem, emptyDir s Podom, a PersistentVolume ima vlastiti životni vijek.',
            'PVC je narudžbenica, StorageClass tvornica s CSI driverom, a PV zapis o disku. Zadano: s PVC-om nestaje i disk.',
            'RWO je jedan čvor. Nakon naglog pada čvora disk se oslobađa tek nakon ≈ 12 minuta (≈ 50 s + 5 min + 6 min) – ili kad čovjek stavi taint out-of-service.',
            <>
              StatefulSet daje ime, disk, red i stalnu DNS adresu, ali ne i replikaciju. <code>replicas: 3</code> u Deploymentu su tri baze.
            </>,
            'Za produkciju: upravljana baza ili operator. U tečaju Postgres ostaje StatefulSet.',
          ]}
        />
        <StoryMap at="19" caption="Postgres kao StatefulSet s trajnim volumenom (PVC) – u tečaju StatefulSet, u produkciji upravljana baza ili operator." />
        <Quiz
          questions={[
            {
              q: 'Deployment db-emptydir dobije novi Pod jer je stari obrisan. Što je s narudžbama?',
              options: ['Ostaju u emptyDiru i novi Pod ih vidi', 'Nestale su – emptyDir nestaje s Podom', 'Kubernetes ih kopira u novi Pod', 'Ostaju na starom čvoru dok se Pod ne vrati'],
              correct: 1,
              explain: 'emptyDir je vezan uz Pod: preživi ponovno pokretanje kontejnera, ali s brisanjem Poda nestaje. Novi Pod dobiva novi, prazan emptyDir.',
            },
            {
              q: 'PVC je već sat vremena Pending, a Pod koji ga koristi također je Pending. Što prvo napraviti?',
              options: [
                'Ponovno pokrenuti čvor',
                <>
                  Pogledati događaje: <code>kubectl describe pvc</code>
                </>,
                <>
                  Povećati <code>replicas</code>
                </>,
                'Obrisati sve PV-ove',
              ],
              correct: 1,
              explain: (
                <>
                  Događaji kažu zašto disk nije nastao: nepostojeća StorageClass (krivo upisano ime), nedostupan CSI driver, kvota u oblaku… Uz <code>WaitForFirstConsumer</code> PVC je normalno Pending samo dok ga nijedan Pod ne koristi.
                </>
              ),
            },
            {
              q: 'RWO disk spojen je na node-1. Drugi Pod s istim PVC-om raspoređen je također na node-1. Smije li ga Kubernetes spojiti?',
              options: ['Da – RWO ograničava čvor, ne Pod', 'Ne – RWO znači jedan Pod', 'Samo za čitanje', 'Samo ako je Pod iz StatefulSeta'],
              correct: 0,
              explain: 'RWO = jedan čvor, pa Kubernetes dopušta. Hoće li aplikacija to podnijeti, drugo je pitanje: drugi Postgres u najboljem slučaju stane na bravi <code>postmaster.pid</code>, a u najgorem oštećuje podatke. Za „točno jedan Pod” postoji RWOP.',
            },
            {
              q: 'node-3 je naglo ugašen, a na njemu je bio db-1. Što radi StatefulSet 10 minuta nakon pada?',
              options: ['Odmah stvara db-1 na drugom čvoru', 'Ništa: db-1 je Terminating, a StatefulSet ne stvara drugi db-1 dok netko ne potvrdi da je čvor ugašen', 'Stvara db-3 umjesto db-1', 'Briše PVC data-db-1'],
              correct: 1,
              explain: 'Stari objekt db-1 još postoji jer kubelet ne može potvrditi gašenje. StatefulSet radije čeka nego da riskira dva db-1 nad istim diskom. Taint out-of-service (ili prisilno brisanje) to razrješava.',
            },
            {
              q: 'StatefulSet db smanjen je s 3 na 1, a sutra vraćen na 3. Što dobije novi db-2?',
              options: ['Prazan disk', 'Svoj stari PVC data-db-2 sa svim podatcima', 'Kopiju podataka iz db-0', 'PVC od db-1'],
              correct: 1,
              explain: 'Smanjenje ne briše PVC-ove (zadano Retain). db-2 se veže na data-db-2 i nastavlja gdje je stao – to ste vidjeli u simulaciji.',
            },
            {
              q: 'U 5. predavanju, u dijelu za znatiželjne, spomenute su replike baze za čitanje. Kako nastaju?',
              options: ['Replikacijom: primarna baza šalje promjene replikama', 'Load balancerom koji kopira svaki zahtjev', 'Zajedničkim diskom za sve kopije', 'Pokretanjem više Podova u Deploymentu'],
              correct: 0,
              explain: (
                <>
                  Repliku za čitanje održava sama baza: primarna šalje promjene replikama. To vrijedi i u Kubernetesu – zato <code>replicas: 3</code> u Deploymentu nije klaster baze, a operator uključuje upravo replikaciju.
                </>
              ),
            },
            {
              q: 'Klopa ide u produkciju, tim je malen i nitko nije dežuran za bazu. Gdje bi trebao živjeti Postgres?',
              options: [
                'U upravljanoj bazi pružatelja usluge',
                <>
                  U StatefulSetu s <code>replicas: 3</code>
                </>,
                'U Deploymentu s PVC-om',
                'U Deploymentu bez volumena',
              ],
              correct: 0,
              explain: 'Replikaciju, preuzimanje rada i sigurnosne kopije tada radi pružatelj. Operator ima smisla kad baza mora ostati u klasteru, a sam StatefulSet ne radi ništa od toga.',
            },
          ]}
        />
      </Section>

      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={['Narudžbe preživljavaju ponovno pokretanje, brisanje Poda i preseljenje: žive na PersistentVolumeu.', 'Postgres ima stalno ime i svoj disk, a nikad ne postoje dva Poda s istim imenom.', 'Znamo što napraviti kad čvor naglo padne: provjeriti stroj i staviti out-of-service.']}
          paid={['Disk je vezan uz zonu i jedan čvor: premještanje nakon pada traje minutama ili čeka čovjeka.', 'StatefulSet ne radi replikaciju ni sigurnosne kopije – to je posao baze, operatora ili upravljane usluge.', 'Infrastruktura je stabilna, pa je najveći rizik sada ono što sami mijenjamo.']}
          next={<>Petak, 11:30: izlazi <code>klopa-api:2.0.0</code> s novom košaricom, a mijenja i shemu baze. Podovi se obnavljaju, skaliraju i čuvaju podatke – ali što ako je greška u samom izdanju?</>}
        />
      </Section>
    </>
  )
}

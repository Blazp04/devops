import { Analogy, Callout, CodeBlock, CostNote, DeepDive, IncidentCard, KeyIdea, MarginNote, Myth, MythOrFact, Predict, Quiz, Recap, Section, StoryMap, Term, Terminal } from '../../kit'
import { ClusterLab } from './sims/ClusterLab'
import { PlocaStepper } from './sims/PlocaStepper'
import { PutStepper } from './sims/PutStepper'
import { ObjectAnatomy } from './sims/ObjectAnatomy'
import { RuntimeStepper } from './sims/RuntimeStepper'
import { NamespaceLab } from './sims/NamespaceLab'
import { WhoIsWho } from './sims/WhoIsWho'
import { WhereCards } from './sims/WhereCards'
import styles from './styles.module.css'
import namespaceYaml from './code/namespace.yaml?raw'
import kindYaml from './code/kind-menza.yaml?raw'
import describeLog from './code/describe-events.log?raw'

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook: „created” is not „running” */}
      <Section id="incident" kicker="priča" title="Piše „created”, a ništa ne radi" lead="Lana je poslala prve manifeste i dobila dvije potvrde. Minutu kasnije Klopa i dalje ne odgovara.">
        <IncidentCard
          no={11}
          when="ponedjeljak, 10:14"
          title="Dva Poda „created”, a ne radi nijedan"
          who="lana"
          says={['Piše created…', 'a ništa ne radi?']}
          metrics={[
            { label: 'Podovi Running', value: '0 od 2', tone: 'bad' },
            { label: 'čvorovi s mjestom', value: '0 od 3', tone: 'bad' },
            { label: 'ErrImagePull', value: '3', tone: 'warn' },
            { label: 'uspjeh (10 s)', value: '0 %', tone: 'bad' },
          ]}
          preset="prvi-apply"
          seed={42}
        >
          Minutu nakon naredbe <code>kubectl apply</code> Pod <code>klopa-api</code> stoji u stanju <Term id="imagepullbackoff">ImagePullBackOff</Term>, a <code>klopa-worker</code> u stanju <Term id="pending">Pending</Term> (čeka čvor). Studenti šalju
          10 zahtjeva u sekundi, a u zadnjih deset sekundi nije uspio nijedan. (U simulaciji ove brojke vrijede oko t = 60 s.)
        </IncidentCard>
        <p>
          U prošlom je predavanju Lana opisala željeno stanje i predala ga Kubernetesu: dva <Term id="manifest">manifesta</Term>, jedan za API, jedan za potrošača iz reda poruka. Alat <Term id="kubectl">kubectl</Term> odgovorio je
          upravo onako kako je očekivala.
        </p>
        <Terminal
          title="Lanin laptop"
          lines={[
            { cmd: 'kubectl apply -f klopa-api.yaml -f klopa-worker.yaml' },
            { out: 'pod/klopa-api created', tone: 'ok' },
            { out: 'pod/klopa-worker created', tone: 'ok' },
            { comment: 'minutu kasnije' },
            { cmd: 'kubectl get pods -n klopa' },
            { out: 'NAME                 READY   STATUS             RESTARTS   AGE' },
            { out: 'ivina-proba-node-1   1/1     Running            0          62s', note: 'čiji su ovo Podovi?' },
            { out: 'ivina-proba-node-2   1/1     Running            0          62s' },
            { out: 'ivina-proba-node-3   1/1     Running            0          62s' },
            { out: 'klopa-api            0/1     ImagePullBackOff   0          61s' },
            { out: 'klopa-worker         0/1     Pending            0          61s', note: 'created… a gdje je Klopa?', who: 'lana' },
          ]}
        />
        <MarginNote tone="red">„created” ≠ „radi”</MarginNote>
        <p>
          Dakle, riječ „created” obećala je manje nego što je Lana mislila. Netko je primio njezin zahtjev i zapisao ga. Netko drugi trebao je za oba Poda odabrati stroj, netko treći povući sliku i pokrenuti kontejner. Na dva različita mjesta nešto je zapelo. Da
          bismo znali gdje tražiti, moramo znati <strong>tko je sve u tom lancu i tko što radi</strong>.
        </p>
        <Predict
          question={
            <>
              Što je Lani zapravo potvrdila riječ <code>created</code>?
            </>
          }
          options={['Kontejneri su pokrenuti i rade.', 'Slika je povučena na čvor.', 'Klaster je zapisao objekt; sve ostalo tek slijedi.', 'Klaster je već odabrao stroj za oba Poda.']}
          correct={2}
          explain={
            <>
              API poslužitelj odgovara čim je objekt spremljen. Odabir čvora, povlačenje slike i pokretanje kontejnera rade druge komponente – kasnije, neovisno i bez javljanja natrag naredbi <code>kubectl</code>.
            </>
          }
          then="Pogledajmo tko su te druge komponente."
        />
      </Section>

      {/* 2 ─ The whiteboard: components and who talks to whom */}
      <Section id="ploca" kicker="koncept" prop="helm" title="Ploča na zidu" lead="Kubernetes nema šefa koji izdaje naredbe. Ima ploču na koju se piše i nekoliko pomoćnika koji je neprestano gledaju.">
        <p>
          Klaster ima dva dijela. <Term id="control-plane">Upravljačka ravnina</Term> (engl. <em>control plane</em>) odlučuje i pamti: što treba postojati i gdje. <Term id="node">Radni čvorovi</Term> su strojevi – najčešće virtualni – na kojima se
          kontejneri stvarno izvode. Klopa sada ima upravljačku ravninu i tri radna čvora. Pogledajmo kako dijelovi surađuju.
        </p>
        <PlocaStepper />
        <p>
          U sredini je <Term id="api-server">API poslužitelj</Term>, a iza njega baza <Term id="etcd">etcd</Term>. Sve što klaster zna – svaki objekt sa svojim željenim i stvarnim stanjem – zapisano je u bazi <code>etcd</code>, i to je{' '}
          <strong>izvor istine</strong>. Oko ploče rade <Term id="scheduler">raspoređivač</Term> (engl. <em>scheduler</em>), koji novim Podovima bira čvor, i <Term id="controller-manager">controller-manager</Term>, u kojem kontroleri paze
          da svega ima koliko treba. Nijedna od tih komponenti ne čuva vlastitu kopiju istine: kad se ponovno pokrene, pročita sve s ploče i nastavi.
        </p>
        <Analogy
          title="Analogija: ploča s narudžbama u kuhinji"
          who="mira"
          breaksDown="na ploči u kuhinji piše naredba („dva ćevapa”), a u klasteru željeno stanje („neka postoje dva Poda”) – svaka komponenta sama zaključi što je njezin posao. I ploču u kuhinji svatko može obrisati krpom, a u klasteru po njoj piše samo API poslužitelj, nakon što provjeri tko piše i smije li."
        >
          U mojoj kuhinji na zidu visi ploča. Blagajnica napiše narudžbu, kuharice je pročitaju i kuhaju, a tko raznosi, gleda što je gotovo. Nitko nikoga ne doziva – svi gledaju ploču, a ploča ne zaboravlja. (Ploča = etcd, blagajnica koja jedina
          smije pisati = API poslužitelj, kuharice = kubeleti na čvorovima.)
        </Analogy>
        <p>Evo cijele postave, s jednom rečenicom za svaku komponentu:</p>
        <WhoIsWho />
        <Myth myth="Na „master čvoru” radi Kubernetes, a na ostalima aplikacije.">
          Riječ <em>master</em> se više ne koristi: kažemo <strong>upravljačka ravnina</strong>. A Kubernetes ne radi samo ondje: na svakom radnom čvoru radi agent kubelet (i obično kube-proxy). Alat kubeadm čvorove upravljačke ravnine
          označava oznakom i zabranom (engl. <em>taint</em>) <code className={styles.mythCode}>node-role.kubernetes.io/control-plane</code>, zbog koje se obični Podovi ondje ne raspoređuju. U upravljanim klasterima te strojeve uopće ne vidite –
          njih vodi pružatelj usluge.
        </Myth>
      </Section>

      {/* 3 ─ The path of one statement + anatomy of an object */}
      <Section id="put" kicker="korak po korak" title="Put jedne izjave" lead="Šest koraka od Lanine naredbe do kontejnera koji radi – a kubectl čeka samo prva dva.">
        <p>
          Pratimo jedan manifest kroz klaster. Brojevi su poruke, a svaka prolazi <strong>kroz API poslužitelj</strong>. Zamislimo da Lana umjesto golog Poda pošalje <Term id="replicaset">ReplicaSet</Term> – objekt koji drži zadani broj
          kopija Poda (pretpregled; detaljno u 13. predavanju). Zatim prebacite izbornik na goli Pod, kakav je Lanin <code>klopa-worker</code>, i pogledajte koji korak nestaje.
        </p>
        <PutStepper />
        <Callout kind="info" title="Tri provjere prije zapisa">
          Svaki zahtjev za promjenu prolazi tri vrata: <strong>autentikaciju</strong> (tko ste?), <strong>autorizaciju</strong> (smijete li to? – obično pravila RBAC) i <strong>kontrolu prihvata</strong> (engl. <em>admission</em>), koja objekt smije
          dopuniti zadanim vrijednostima ili odbiti ako krši pravila klastera. Tek zatim objekt ide u <code>etcd</code>. (Čitanja prolaze samo prva dva.)
        </Callout>
        <h3>Anatomija objekta</h3>
        <p>
          Što je točno zapisano na ploči? Svaki Kubernetes objekt ima isti kostur: <code>apiVersion</code> i <code>kind</code> kažu što je, <code>metadata</code> kako se zove i gdje živi, <code>spec</code> kakav ga želimo, a{' '}
          <code>status</code> kakav je zapravo. Lana piše samo gornji dio; <code>status</code> pišu komponente klastera.
        </p>
        <ObjectAnatomy />
        <p>
          To je <Term id="desired-state">željeno stanje</Term> iz prošlog predavanja, ovaj put s imenom polja. Svaki kontroler vrti svoju <Term id="reconciliation-loop">petlju usklađivanja</Term>: pročita <code>spec</code>, pogleda stvarnost i
          napravi jedan korak da ih približi.
        </p>
      </Section>

      {/* 4 ─ Who actually starts containers */}
      <Section id="kontejneri" kicker="kontejner" title="Tko zapravo pokreće kontejnere" lead="Ni API poslužitelj ni raspoređivač ne pokreću ništa. To radi agent kubelet na čvoru – preko posrednika.">
        <p>
          Na svakom čvoru radi agent <Term id="kubelet">kubelet</Term>. On je jedini dio Kubernetesa koji dodiruje kontejnere, ali ni on ih ne pokreće sam: zove <Term id="container-runtime">izvršno okruženje kontejnera</Term> preko standardnog sučelja{' '}
          <Term id="cri">CRI</Term>. Usporedimo to s Dockerom iz 8. predavanja.
        </p>
        <RuntimeStepper />
        <Callout kind="fact" title="Izvršna okruženja (stanje: listopad 2026.)">
          Dockershim je uklonjen u Kubernetesu 1.24. Dokumentirana izvršna okruženja su containerd, CRI-O, Docker Engine preko dodatka cri-dockerd i Mirantis Container Runtime. Kubernetes 1.35 posljednje je izdanje koje podržava containerd 1.x;
          od 1.36 treba containerd 2.x (trenutačno 2.4.1). Aktualni Kubernetes je 1.37.1. U Namespaceu kube-system vidjet ćete i CoreDNS (DNS unutar klastera); stariji kube-dns zastario je u 1.37.
        </Callout>
        <DeepDive title="Zašto slika iz naredbe docker build radi u klasteru bez Dockera?">
          <p>
            „Docker” je cijeli komplet: naredba, demon <code>dockerd</code>, izgradnja slika i mreža. Slika koju taj komplet napravi standardna je OCI slika (slojevi + opis) i containerd je zna povući i pokrenuti jednako kao slike koje su
            izgradili drugi alati – ako je izgrađena za arhitekturu procesora čvora (npr. amd64). Slika izgrađena na laptopu s procesorom Apple M (arm64) na čvoru amd64 ne radi (<code>exec format error</code>); tada je gradite s
            <code>--platform linux/amd64</code>. Kad kažemo „Kubernetes više ne koristi Docker”, mislimo samo na to da kubelet više ne razgovara s demonom <code>dockerd</code>. Za izgradnju slika Docker i
            dalje možete koristiti.
          </p>
        </DeepDive>
      </Section>

      {/* 5 ─ Flagship: the cluster under a microscope */}
      <Section id="simulacija" kicker="simulacija" title="Klaster pod mikroskopom" lead="Riješite Lanin incident, a zatim gasite komponente jednu po jednu i gledajte koji simptom ostavlja koja.">
        <p>
          U simulaciji je cijeli klaster: upravljačka ravnina gore, tri čvora dolje, a studenti stalno šalju narudžbe na <code>klopa-api</code> (10 zahtjeva u sekundi). Jedna razlika u odnosu na Lanin terminal: iza <code>klopa-api</code> ovdje stoji
          pretpregled ReplicaSeta, da biste klizačem mogli mijenjati broj kopija. <code>klopa-worker</code> je goli Pod, točno kao u Laninu manifestu. Dok je Lana slala manifeste, Iva je u isti klaster pokrenula tri probna Poda i zauzela sva
          slobodna mjesta. Svako „mjesto” na čvoru je dio memorije koji Pod rezervira – kako se to računa, vidjet ćemo u 17. predavanju.
        </p>
        <Predict
          question="Ugasimo cijelu upravljačku ravninu – API poslužitelj, etcd, raspoređivač i controller-manager. Što se događa s klopa-api koji već radi i poslužuje studente?"
          options={['Odmah prestaje odgovarati.', 'Odgovara dalje, ali se ništa ne može promijeniti ni popraviti.', 'kubelet gasi kontejnere jer ne može javiti stanje.']}
          correct={1}
          explain="Kontejneri žive na čvorovima, a kubelet radi i bez API poslužitelja. Stane samo ono što mora pisati na ploču: kubectl, raspoređivanje, zamjena izgubljenih Podova."
          then="Provjerite: odaberite „Zdrav klaster” i isključite sve četiri komponente."
        />
        <ClusterLab />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <code>ImagePullBackOff</code> je posao kubeleta: slika s tagom <code>1.3.20</code> ne postoji, pa kubelet pokušava sve rjeđe (10, 20, 40 s…). Popravak taga u ReplicaSetu ne mijenja Pod koji već postoji – tek novi Pod dobiva ispravnu
              sliku.
            </li>
            <li>
              <code>Pending</code> bez čvora (<code>Node: &lt;none&gt;</code>) je posao raspoređivača: Ivini probni Podovi zauzeli su sva mjesta. Čim se mjesto oslobodi, raspoređivač sam smjesti Pod – nitko ga ne mora zvati.
            </li>
            <li>
              Isključen controller-manager: obrisani Pod se ne vraća. Kad se controller-manager ponovno uključi, odmah nadoknadi razliku, jer gleda stanje, a ne propuštene događaje.
            </li>
            <li>Isključen API poslužitelj ili etcd: kubectl ne može ništa, a Klopa i dalje odgovara.</li>
            <li>
              Isključen kubelet: čvor nakon pedesetak sekundi (u simulaciji 10 s) postaje NotReady. Kontejneri na njemu rade dalje, ali upravljačka ravnina njegove Podove označi kao nespremne, pa promet na njih više ne ide. Nakon pet minuta (u
              simulaciji 20 s) Podovi ReplicaSeta nastaju na drugim čvorovima, stari vise u <code>Terminating</code>, a goli <code>klopa-worker</code> nitko ne zamjenjuje.
            </li>
          </ul>
        </Callout>
        <KeyIdea>
          <strong>kubectl apply samo piše na ploču.</strong> Neovisne komponente je gledaju i svaka asinkrono radi svoj dio – zato <strong>Podovi koji rade preživljavaju pad upravljačke ravnine</strong>, ali se bez nje ništa ne popravlja ni ne
          mijenja.
        </KeyIdea>
        <DeepDive title="Zašto stari Podovi vise u Terminating?">
          <p>
            Kad se čvor prestane javljati, upravljačka ravnina ne zna je li stroj ugašen ili je samo prekinuta mreža. Kontejneri možda i dalje rade. Zato Pod označi za brisanje, ali ga ne makne s ploče dok kubelet ne potvrdi da je kontejner zaustavljen
            (ili dok netko ne napravi prisilno brisanje). Za Podove ReplicaSeta to nije problem – zamjene već rade drugdje. Za bazu podataka, gdje dvije kopije istog Poda mogu pokvariti podatke, to je presudno: zato StatefulSet čeka potvrdu (19.
            predavanje).
          </p>
        </DeepDive>
      </Section>

      {/* 6 ─ Namespace */}
      <Section id="namespace" kicker="isprobajte" title="Namespace: iste stvari u dvije mape" lead="Produkcija i probno okruženje mogu dijeliti isti klaster i ista imena – svako u svojoj mapi.">
        <p>
          Zato je Lana pisala <code>-n klopa</code>. <Term id="namespace">Namespace</Term> je mapa za objekte: imena moraju biti jedinstvena samo unutar jednog Namespacea. Klopa ima <code>klopa</code> za produkciju i <code>klopa-staging</code> za
          probe, a u oba postoji Pod <code>klopa-api</code>. Odaberite Namespace i pogledajte što vidi <code>kubectl get pods</code>.
        </p>
        <NamespaceLab />
        <p>
          U Namespaceu <code>kube-system</code> žive dijelovi samog klastera. U klasteru za učenje kind tu se vidi i upravljačka ravnina, jer i ona radi u kontejnerima; u upravljanom klasteru nju vodi pružatelj usluge, pa je ondje ne vidite. Neki
          objekti nisu ni u jednom Namespaceu: čvorovi i sami Namespacei pripadaju cijelom klasteru.
        </p>
        <Callout kind="warn" title="Namespace nije sigurnosna granica">
          Namespace odvaja imena, ali sam po sebi ne odvaja ništa drugo. Pod iz <code>klopa-staging</code> i dalje može mrežom razgovarati s bazom iz <code>klopa</code>, osim ako to ne zabranite mrežnim pravilima (NetworkPolicy). Tko smije čitati i
          mijenjati što, određuje se pravilima RBAC po Namespaceu, a koliko resursa smije potrošiti – kvotama (ResourceQuota).
        </Callout>
      </Section>

      {/* 7 ─ Real cluster: where it lives, kind, manifests, events */}
      <Section id="kod" kicker="kubectl" title="Pogled u pravi klaster" lead="Gdje klaster obično živi, kako ga podići na vlastitom računalu i kako iz njega čitati što se dogodilo.">
        <WhereCards />
        <Myth myth="Za pregled klastera instalirajte Kubernetes Dashboard.">
          Kubernetes Dashboard više se ne razvija – projekt je arhiviran. Preporučeni nasljednik je <strong>Headlamp</strong>; a sve što prikazuje, dobit ćete i naredbama <code>kubectl get</code> i <code>kubectl describe</code>.
        </Myth>
        <p>
          Za vježbu je najbrži kind (engl. <em>Kubernetes in Docker</em>). Ova konfiguracija podiže čvor upravljačke ravnine i tri radna čvora, kao u simulaciji:
        </p>
        <CodeBlock title="kind-menza.yaml" lang="yaml" code={kindYaml} notes={[{ lines: '7', text: 'ime klastera: kontekst će biti kind-menza' }, { lines: '9-12', text: 'jedan upravljački i tri radna čvora' }]} />
        <Terminal
          title="Lanin laptop"
          caption="Ispis je skraćen; brojevi verzija ovise o slici čvora koju kind koristi."
          lines={[
            { cmd: 'kind create cluster --config kind-menza.yaml' },
            { out: 'Creating cluster "menza" ...' },
            { out: ' ✓ Starting control-plane', tone: 'ok' },
            { out: ' ✓ Joining worker nodes', tone: 'ok' },
            { out: 'Set kubectl context to "kind-menza"' },
            { cmd: 'kubectl get nodes -o wide' },
            { out: 'NAME                  STATUS   ROLES           AGE   VERSION   INTERNAL-IP   CONTAINER-RUNTIME' },
            { out: 'menza-control-plane   Ready    control-plane   2m    v1.37.1   172.18.0.4    containerd://2.4.1' },
            { out: 'menza-worker          Ready    <none>          2m    v1.37.1   172.18.0.2    containerd://2.4.1', note: 'u čvoru kubelet radi s containerdom, Docker ovdje samo glumi strojeve', who: 'davor' },
            { out: 'menza-worker2         Ready    <none>          2m    v1.37.1   172.18.0.5    containerd://2.4.1' },
            { out: 'menza-worker3         Ready    <none>          2m    v1.37.1   172.18.0.3    containerd://2.4.1' },
            { cmd: 'kubectl apply -f namespace.yaml' },
            { out: 'namespace/klopa created', tone: 'ok' },
            { out: 'namespace/klopa-staging created', tone: 'ok' },
          ]}
        />
        <p>
          kind koristi Docker samo da bi glumio strojeve; unutar svakog čvora kubelet razgovara s containerdom, kao u pravom klasteru. Prije Podova u klasteru moraju postojati i mape u koje će ići – Lanin <code>namespace.yaml</code>. Kraći manifest
          teško da postoji:
        </p>
        <CodeBlock title="namespace.yaml" lang="yaml" code={namespaceYaml} notes={[{ lines: '3', text: 'kind: što je objekt' }, { lines: '5', text: 'ime je jedinstveno u cijelom klasteru' }, { lines: '8', text: '--- odvaja dva objekta u jednoj datoteci' }]} />
        <p>
          Kad nešto zapne, prvi korak je <code>kubectl describe pod</code>. Na dnu ispisa su <strong>događaji</strong> (engl. <em>events</em>), a stupac <code>From</code> kaže tko je što zapisao na ploču. Upravo tako izgleda Lanin incident:
        </p>
        <CodeBlock
          title="kubectl describe pod (događaji)"
          lang="log"
          code={describeLog}
          mode="open"
          notes={[
            { lines: '5', text: 'faza Pending: čvor je dodijeljen, ali kontejner još ne radi' },
            { lines: '14', text: 'raspoređivač je obavio svoje: node-2' },
            { lines: '15-17', text: 'kubelet: slika s tagom 1.3.20 ne postoji' },
            { lines: '18-19', text: 'kubelet čeka sve dulje: 10, 20, 40 s…' },
            { lines: '24-25', text: 'Pending i Node: <none> → posao raspoređivača' },
            { lines: '29', text: 'nema čvora s mjestom' },
          ]}
        />
        <div className={`k-card k-pinned ${styles.handbook}`}>
          <div className={styles.handbookTitle}>Davorov dežurni priručnik · 1. stranica</div>
          <table role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader">Simptom</th>
                <th role="columnheader">Tko je zapeo</th>
                <th role="columnheader">Što pokrenuti</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              <tr role="row">
                <td role="cell" data-label="Simptom">
                  <code>Pending</code> i <code>Node: &lt;none&gt;</code>
                </td>
                <td role="cell" data-label="Tko je zapeo">raspoređivač nije našao čvor (ili ne radi)</td>
                <td role="cell" data-label="Što pokrenuti">
                  <code>kubectl describe pod X</code> → <code>FailedScheduling</code>; nema tog događaja → raspoređivač ne radi
                </td>
              </tr>
              <tr role="row">
                <td role="cell" data-label="Simptom">
                  <code>ImagePullBackOff</code>
                </td>
                <td role="cell" data-label="Tko je zapeo">kubelet ne može povući sliku: tag, registar, prava</td>
                <td role="cell" data-label="Što pokrenuti">
                  <code>kubectl describe pod X</code> → <code>Failed to pull image</code>
                </td>
              </tr>
              <tr role="row">
                <td role="cell" data-label="Simptom">
                  čvor <code>NotReady</code>
                </td>
                <td role="cell" data-label="Tko je zapeo">kubelet se ne javlja: ugašen stroj, mreža ili sam kubelet</td>
                <td role="cell" data-label="Što pokrenuti">
                  <code>kubectl get nodes</code>, <code>kubectl describe node X</code>
                </td>
              </tr>
              <tr role="row">
                <td role="cell" data-label="Simptom">
                  <code>connection refused</code> / <code>request timed out</code>
                </td>
                <td role="cell" data-label="Tko je zapeo">API poslužitelj ili etcd; aplikacije i dalje rade</td>
                <td role="cell" data-label="Što pokrenuti">provjeriti upravljačku ravninu (ili status pružatelja usluge)</td>
              </tr>
              <tr role="row">
                <td role="cell" data-label="Simptom">obrisani Pod se ne vraća</td>
                <td role="cell" data-label="Tko je zapeo">goli Pod bez vlasnika ili ne radi controller-manager</td>
                <td role="cell" data-label="Što pokrenuti">
                  <code>kubectl get rs -n klopa</code> (DESIRED i CURRENT) i <code>kubectl get pods -n kube-system</code> (radi li <code>kube-controller-manager</code>?)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* 8 ─ Misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            { statement: 'Upravljačka ravnina pokreće moje kontejnere.', fact: false, explain: 'Upravljačka ravnina odlučuje i zapisuje. Kontejnere pokreće kubelet na čvoru, preko izvršnog okruženja kao što je containerd.' },
            { statement: 'Ako padne upravljačka ravnina, padaju sve aplikacije.', fact: false, explain: 'Podovi koji rade i dalje poslužuju promet – vidjeli ste to u simulaciji. Prestaju popravci, raspoređivanje i sve promjene.' },
            { statement: 'Raspoređivač pokreće kontejnere.', fact: false, explain: 'Raspoređivač samo upiše čvor u objekt Poda. Sve ostalo radi kubelet na tom čvoru.' },
            { statement: 'Raspoređivač javlja kubeletu koji Pod treba pokrenuti.', fact: false, explain: 'Komponente se ne pozivaju izravno: sve gledaju API poslužitelj, a s bazom etcd razgovara samo on.' },
            { statement: 'Kubernetes koristi Docker za pokretanje kontejnera.', fact: false, explain: 'kubelet razgovara s izvršnim okruženjem preko CRI-ja (containerd, CRI-O). Slike izgrađene Dockerom i dalje rade jer su standardne OCI slike.' },
            { statement: 'Pod istog imena smije postojati u dva Namespacea.', fact: true, explain: 'Imena su jedinstvena unutar Namespacea, pa klopa i klopa-staging mogu imati svaki svoj klopa-api.' },
          ]}
        />
      </Section>

      {/* 9 ─ Recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            <>
              <code>kubectl apply</code> samo zapisuje željeno stanje: „created” znači „zapisano”, ne „radi”.
            </>,
            <>Sve komponente razgovaraju samo s API poslužiteljem, a s bazom etcd samo on. Nitko nikoga ne zove – svi gledaju ploču.</>,
            <>Raspoređivač samo bira čvor; kontejner pokreće kubelet preko containerda, bez Dockera.</>,
            <>Kad stane upravljačka ravnina, Podovi koji rade i dalje poslužuju, ali se ništa ne mijenja ni ne popravlja.</>,
            <>
              <code>Pending</code> i <code>Node: &lt;none&gt;</code> → raspoređivač; <code>ImagePullBackOff</code> → kubelet i slika. Događaji u <code>kubectl describe pod</code> kažu tko je što zapisao.
            </>,
          ]}
        />
        <StoryMap at="11" caption="Klopina karta: klaster više nije kutija – vidimo upravljačku ravninu i tri radna čvora." />
        <Quiz
          id="l11"
          questions={[
            {
              q: (
                <>
                  U događajima Poda <code>klopa-worker</code> piše <code>FailedScheduling</code> s porukom „0/3 nodes are available: 3 Insufficient memory”. Tko je to zapisao i što znači?
                </>
              ),
              options: ['kubelet: kontejneru je ponestalo memorije.', 'Raspoređivač: nijedan čvor nema dovoljno slobodne memorije za taj Pod, pa Pod čeka.', 'etcd: baza je puna.', 'controller-manager: odbio je stvoriti Pod.'],
              correct: 1,
              explain: (
                <>
                  U stupcu <code>From</code> piše <code>default-scheduler</code>. Pod još nema čvor, pa kubelet za njega ni ne zna. Treba osloboditi mjesto ili dodati čvor; kako se mjesto računa, vidjet ćemo u 17. predavanju.
                </>
              ),
            },
            {
              q: (
                <>
                  Lana dobije <code>pod/klopa-api created</code>. Što je u tom trenutku sigurno istina?
                </>
              ),
              options: ['Kontejner radi.', 'Slika je povučena na čvor.', 'Objekt je zapisan u etcd; ostali koraci tek slijede.', 'Raspoređivač je već odabrao čvor.'],
              correct: 2,
              explain: 'API poslužitelj odgovara čim etcd potvrdi zapis. Raspoređivač, kubelet i containerd rade tek nakon toga, svaki kad na ploči primijeti promjenu.',
            },
            {
              q: (
                <>
                  controller-manager je isključen, a Lana obriše jedan od tri Poda <code>klopa-api</code> iz ReplicaSeta (<code>replicas: 3</code>). Što se događa?
                </>
              ),
              options: [
                'Raspoređivač odmah stvori zamjenu.',
                'Zamjena ne nastaje dok se controller-manager ne vrati; tada je kontroler odmah stvori.',
                'Pod se vraća sam jer je zapisan u etcd.',
                'Zamjena nastaje, ali tek nakon pet minuta.',
              ],
              correct: 1,
              explain: 'Nove Podove za ReplicaSet stvara kontroler u controller-manageru. Kad se vrati, usporedi stanje (traženo 3, postoji 2) i nadoknadi razliku – ne treba mu propušteni događaj.',
            },
            {
              q: 'Na čvoru node-2 stane kubelet, a stroj i dalje radi. Što vidimo?',
              options: [
                'Svi Podovi na node-2 odmah se ruše.',
                'Čvor nakon pedesetak sekundi postaje NotReady; kontejneri rade dalje, ali promet na njih više ne ide. Nakon oko pet minuta Podovi ReplicaSeta nastaju drugdje, a stari vise u Terminating.',
                'Raspoređivač odmah premjesti sve Podove na druge čvorove.',
                'Ništa – kubelet je potreban samo pri pokretanju.',
              ],
              correct: 1,
              explain: 'Kontejnere nitko ne gasi, ali nitko ni ne javlja njihovo stanje. Upravljačka ravnina zato Podove s tog čvora označi kao nespremne i makne ih iz prometa. Nakon zadanih 300 s tolerancije Podovi se označe za brisanje; ReplicaSet stvara zamjene, a stari čekaju potvrdu kubeleta.',
            },
            {
              q: (
                <>
                  Lana u Namespaceu <code>klopa-staging</code> pokrene Pod <code>klopa-api</code>, a Pod istog imena već postoji u Namespaceu <code>klopa</code>. Što se dogodi?
                </>
              ),
              options: ['Greška: ime je zauzeto.', 'Nastane drugi, potpuno odvojen Pod istog imena.', 'Prepiše se Pod u klopa.', 'Kubernetes ga sam preimenuje.'],
              correct: 1,
              explain: 'Imena su jedinstvena unutar Namespacea. Ali Namespace nije sigurnosna granica: mrežu ograničavaju NetworkPolicy pravila, a pristup RBAC.',
            },
            {
              q: (
                <>
                  Iz 8. predavanja: Lana je sliku <code>klopa-api</code> izgradila naredbom <code>docker build</code>. Hoće li je klaster s containerdom pokrenuti?
                </>
              ),
              options: ['Neće – na svaki čvor treba instalirati Docker.', 'Hoće – to je standardna OCI slika koju containerd zna povući i pokrenuti.', 'Hoće, ali tek nakon pretvorbe u poseban format.', 'Neće – Kubernetes radi samo sa slikama za CRI-O.'],
              correct: 1,
              explain: 'Docker i containerd dijele isti format slike (OCI). Kubernetesu ne treba Docker da bi sliku pokrenuo – samo neka je slika izgrađena za arhitekturu procesora čvora (npr. amd64). Docker i dalje možete koristiti za izgradnju.',
            },
          ]}
        />
      </Section>

      {/* 10 ─ Cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Znamo tko radi što: API poslužitelj i etcd pamte, kontroleri i raspoređivač odlučuju, kubelet pokreće.',
            'Iz događaja čitamo tko je zapeo: Pending je posao raspoređivača, ImagePullBackOff kubeleta.',
            'Pad upravljačke ravnine ne ruši Klopu koja već radi.',
          ]}
          paid={[
            'Upravljačka ravnina je još jedan sustav koji netko mora čuvati – ili platiti nekome da ga čuva.',
            '„Running” znači samo da proces radi, ne i da je aplikacija zdrava.',
            'Goli Pod koji nestane nitko ne vraća.',
          ]}
          next={
            <>
              Lana je ispravila tag i Podovi s <code>klopa-api</code> pišu <code>Running</code> i <code>1/1</code> – ali narudžbe ne prolaze. Aplikacija 40 sekundi puni predmemoriju, kontejner se prije toga ruši, a kubelet ga podiže sve sporije: nakon 10, 20 pa 40 sekundi. Što je točno Pod i kako Kubernetes
              zna je li aplikacija zdrava?
            </>
          }
        />
      </Section>
    </>
  )
}

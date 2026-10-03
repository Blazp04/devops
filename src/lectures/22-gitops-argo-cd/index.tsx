import {
  Analogy,
  Callout,
  CodeBlock,
  CostNote,
  DeepDive,
  DoodleIcon,
  Figure,
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
  Tabs,
  Term,
  Terminal,
} from '../../kit'
import { PushPullStepper } from './sims/PushPullStepper'
import { IncidentLab } from './sims/IncidentLab'
import { LoopsStepper } from './sims/LoopsStepper'
import { CommitToSync } from './sims/CommitToSync'
import { DriftLab } from './sims/DriftLab'
import { RevertStepper } from './sims/RevertStepper'
import { ChainFigure } from './sims/ChainFigure'
import { TugOfWar } from './sims/TugOfWar'
import { GitIstinaSim } from './sims/GitIstinaSim'
import { revertStory, revertTerminal } from './lib/story'
import applicationYaml from './code/application.yaml?raw'
import appprojectYaml from './code/appproject.yaml?raw'
import repoTree from './code/repo-struktura.txt?raw'
import kustomizationYaml from './code/kustomization-prod.yaml?raw'
import ciStep from './code/ci-korak.yaml?raw'
import ignoreYaml from './code/ignore-differences.yaml?raw'
import installSh from './code/install.sh?raw'
import migrationJob from './code/migracija-job.yaml?raw'
import styles from './styles.module.css'

const story = revertStory()

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section id="incident" kicker="priča" title="Tko je to promijenio u 02:00?" lead="Pipeline iz prošlog predavanja provjerava svaku promjenu – ali u produkciju i dalje gura sam, ključem administratora klastera.">
        <IncidentCard
          no={22}
          when="srijeda, 09:20"
          title="Novi klaster radi – ali nije isti kao stari"
          who="davor"
          says={['Što je radilo', 'u produkciji?!']}
          preset="l22Push (simulacija „Isti kvar, dva modela”): „Izdaj 2.0.1 kroz CI”, pa „Ručni kubectl edit (02:00)”"
          seed={22}
          metrics={[
            { label: 'Git ↔ klaster', value: '2 razlike', tone: 'bad' },
            { label: 'upozorenja o odstupanju', value: '0', tone: 'bad' },
            { label: 'ključ cluster-admin', value: 'u CI-ju', tone: 'warn' },
          ]}
        >
          Stari klaster trebalo je obnoviti, pa ga je Davor napunio iz Gita. Git je opisivao <code>klopa-api:1.4.0</code> i popust od 20 %. A u produkciji je radio <code>2.0.1</code>, koji je CI postavio mimo Gita, i popust koji je netko u 02:00 promijenio naredbom <code>kubectl edit</code>.
        </IncidentCard>
        <p>
          Ispravak PDV-a <code>2.0.1</code> prošao je kroz pipeline iz prošlog predavanja: izgradnja, testovi, slika s digestom u registru. Na kraju je CI sam pokrenuo <code>kubectl apply</code> – s kubeconfigom koji u tajnama CI-ja ima prava administratora klastera. U Git nitko nije zapisao da produkcija sada radi <code>2.0.1</code>.
        </p>
        <p>
          U 02:00 netko je još naredbom <code>kubectl edit</code> promijenio <code>POPUST_CEVAP_PETAK</code> s 20 na 25. Ni to nije zapisano. Kad je klaster u srijedu trebalo podići iznova, Davor ga je napunio iz Gita – i Klopa se vratila na staru verziju sa starim popustom. Nitko ne zna rekonstruirati što je točno radilo.
        </p>
        <p>Dva su problema, a oba su posljedica istog modela:</p>
        <ul>
          <li>
            <strong>ključ</strong> – kubeconfig iz CI-ja otvara cijeli klaster. Ako procuri iz loga ili s nečijeg laptopa, napadač ima sve;
          </li>
          <li>
            <strong>istina</strong> – Git ne opisuje produkciju, a ručne promjene nitko ne primijeti jer nitko ne uspoređuje.
          </li>
        </ul>
        <p>
          Pitanje ovog predavanja: <strong>što ako bi klaster sam povlačio željeno stanje iz Gita i neprestano ga uspoređivao – kao termostat iz desetog predavanja?</strong>
        </p>
      </Section>

      {/* 2 · push vs pull */}
      <Section id="gurati-ili-povlaciti" kicker="koncept" prop="lock" title="Gurati ili povlačiti" lead="Isti cilj – nova verzija u klasteru – ali ključ leži na drugom mjestu.">
        <p>
          Do sada smo u klaster <em>gurali</em>: netko izvana (Davor, pa CI) ima ključ klastera i šalje promjene unutra. Obrnuti model je <em>povlačenje</em>: agent koji radi u samom klasteru čita Git i sam primjenjuje ono što tamo piše.
        </p>
        <PushPullStepper />
        <p>
          Taj način rada zove se <Term id="gitops">GitOps</Term>. Zajednica OpenGitOps opisuje ga s četiri načela – i tek kad su ispunjena sva četiri, to je GitOps:
        </p>
        <div className={styles.principles}>
          <StickyNote c="yellow" rotate={-1} className={styles.principle}>
            <div className={styles.principleHead}>
              <span className={styles.principleNo}>1</span>
              <DoodleIcon kind="config" className={styles.principleIcon} /> deklarativno
            </div>
            <p className={styles.principleText}>Opisujemo željeno stanje („4 Poda, slika 2.0.1”), a ne korake kako do njega doći.</p>
          </StickyNote>
          <StickyNote c="blue" rotate={0.8} className={styles.principle}>
            <div className={styles.principleHead}>
              <span className={styles.principleNo}>2</span>
              <DoodleIcon kind="git" className={styles.principleIcon} /> verzionirano i nepromjenjivo
            </div>
            <p className={styles.principleText}>Svaka promjena je novi commit. Ništa se ne prepisuje, pa je cijela povijest sačuvana.</p>
          </StickyNote>
          <StickyNote c="green" rotate={-0.6} className={styles.principle}>
            <div className={styles.principleHead}>
              <span className={styles.principleNo}>3</span>
              <DoodleIcon kind="eye" className={styles.principleIcon} /> automatski povučeno
            </div>
            <p className={styles.principleText}>Agent sam dohvaća željeno stanje iz Gita – nitko ga ne gura u klaster.</p>
          </StickyNote>
          <StickyNote c="pink" rotate={0.7} className={styles.principle}>
            <div className={styles.principleHead}>
              <span className={styles.principleNo}>4</span>
              <DoodleIcon kind="loop" className={styles.principleIcon} /> neprestano usklađivano
            </div>
            <p className={styles.principleText}>Agent stalno uspoređuje Git i klaster i ispravlja razliku – ne samo kad netko nešto postavi.</p>
          </StickyNote>
        </div>
        <p>
          Prva dva načela Klopa ispunjava tek napola: manifesti su deklarativni i u Gitu su – ali CI je <code>2.0.1</code> postavio mimo Gita. Nedostaju i zadnja dva, a za njih treba agent u klasteru. Najpoznatiji je <Term id="argo-cd">Argo CD</Term>. Ponovimo incident u oba modela: najprije guranje, pa istu noć s Argo CD-om.
        </p>
        <IncidentLab />
        <Callout kind="warn" title="Povlačenje premješta ključeve – ne uklanja ih">
          <p>
            CI više nema ključ klastera, ali tko god smije spremiti u granu <code>main</code> <Term id="config-repo">config repozitorija</Term>, postavlja u produkciju – a Argo CD u klasteru ima široka prava. Zato config repozitorij čuvamo kao ključ produkcije:
          </p>
          <ul>
            <li>zaštita grane: u <code>main</code> samo kroz pull request (zahtjev za spajanje) s obveznim pregledom;</li>
            <li>potpisani commitovi, a Argo CD smije provjeriti potpis prije sinkronizacije;</li>
            <li>
              <Term id="appproject">AppProject</Term> koji aplikacijama Klope dopušta samo config repozitorij, samo Namespacee <code>klopa</code> i <code>klopa-staging</code> i nijedan objekt na razini klastera. To provodi sam Argo CD – njegova vlastita prava u Kubernetesu smanjuje tek RBAC.
            </li>
          </ul>
        </Callout>
        <Callout kind="fact" title="Provjera potpisa u Argo CD-u">
          Od Argo CD-a 3.5 (izdan 4. kolovoza 2026.) AppProject ima polje <code>spec.sourceIntegrity</code>: Argo CD provjerava GnuPG potpis commita koji postavlja (<code>mode: head</code>) ili i svih njegovih predaka (<code>mode: strict</code>). Nepotpisan commit i dalje vidi kao razliku, ali ga ne sinkronizira. Javni ključevi moraju biti uvezeni u Argo CD (<code>argocd gpg add</code>), a ako Git poslužitelj pri spajanju pull requesta stvara vlastiti commit, i njegov ključ mora biti na popisu. (stanje: listopad 2026.)
        </Callout>
        <CodeBlock title="appproject.yaml" lang="yaml" code={appprojectYaml} mode="closed" caption="AppProject za Klopu: dopušteni repozitorij, odredišta i provjera potpisa." notes={[{ lines: '8-15', text: 'samo config repo i dva Namespacea' }, { lines: '16-28', text: 'Argo CD 3.5: postavlja samo potpisane commitove; ključevi uvezeni naredbom argocd gpg add' }]} />
      </Section>

      {/* 3 · nested loops */}
      <Section id="petlje" kicker="koncept" prop="loop" title="Matrjoška petlji" lead="Argo CD nije nova ideja, nego stara petlja usklađivanja – razinu više.">
        <LoopsStepper />
        <p>
          Argo CD govori o dva stanja. <strong>Ciljano stanje</strong> (engl. <em>target state</em>) su manifesti koje izračuna iz Gita – naše <Term id="desired-state">željeno stanje</Term>. <strong>Stvarno stanje</strong> (engl. <em>live state</em>) su objekti koji upravo postoje u klasteru. Između njih vrti se ista <Term id="reconciliation-loop">petlja usklađivanja</Term> kao u Kubernetesu: usporedi, ispravi razliku, ponovi.
        </p>
        <KeyIdea>
          Kubernetes usklađuje Podove s onim što piše u API poslužitelju (spremljeno u bazi <code>etcd</code>), a Argo CD usklađuje klaster s onim što piše u Gitu. <strong>Git postaje izvor istine</strong>: povijest Gita je povijest postavljanja, rollback je commit – a <strong>config repozitorij postaje ono što treba čuvati</strong>.
        </KeyIdea>
        <Analogy title="Termostat s postavkom u bilježnici" who="mira" breaksDown="Argo CD u bilježnicu ne gleda neprestano, nego po zadanom svake dvije do tri minute (osim uz webhook). Sam ništa ne kuha – slike gradi CI. I tko god smije pisati u bilježnicu, upravlja cijelom kuhinjom.">
          Kao termostat u kuhinji – samo što postavku ne okrećemo na zidu, nego je zapisujemo u bilježnicu. Termostat svako malo pogleda u bilježnicu i izjednači kuhinju s onim što piše. Tko želi toplije, ne dira radijator, nego prepravi bilježnicu.
        </Analogy>
      </Section>

      {/* 4 · commit → sync */}
      <Section id="od-commita" kicker="isprobajte" title="Od commita do sinkronizacije" lead="Argo CD ne čeka da mu netko javi: sam provjerava Git – po zadanom svake dvije minute, uz dodatak do jedne minute.">
        <Predict
          question={
            <>
              Lana u 12:00:00 spremi u Git commit sa slikom <code>2.0.1</code>. Webhook nije postavljen. Kad će Argo CD najkasnije znati za taj commit?
            </>
          }
          options={['odmah, u istoj sekundi', 'za otprilike 10 sekundi', 'najkasnije za otprilike 3 minute', 'tek kad netko klikne Sync']}
          correct={2}
          explain="Argo CD provjerava Git svakih 120 s i svakoj provjeri doda nasumičnih do 60 s, da tisuće aplikacija ne pitaju Git u istoj sekundi. U najgorem slučaju to je oko 3 minute. Webhook iz Gita to skraćuje na sekundu-dvije."
          then="Provjerite u simulaciji ispod – vrijeme je skraćeno deset puta."
        />
        <p>Dvije riječi iz sučelja Argo CD-a lako je pomiješati:</p>
        <ul>
          <li>
            <strong>osvježavanje</strong> (engl. <em>refresh</em>) – Argo CD pročita Git i usporedi ga s klasterom. To se događa samo od sebe, pri svakoj provjeri;
          </li>
          <li>
            <strong>sinkronizacija</strong> (engl. <em>sync</em>) – Argo CD primijeni razliku u klaster. Po zadanom čeka vas (gumb <em>Sync</em>), osim ako uključite automatsku sinkronizaciju.
          </li>
        </ul>
        <MarginNote>u simulaciji 12–18 s umjesto 120–180 s</MarginNote>
        <CommitToSync />
        <p>
          Nakon svake usporedbe Argo CD pokazuje dvije oznake. <Term id="sync-status">Status sinkronizacije</Term> pita „je li klaster isti kao Git?”, a <Term id="app-health">zdravlje</Term> pita „radi li to što je u klasteru?”. Oznake su neovisne, pa je moguće i <em>Synced + Degraded</em>: klaster vjerno izvodi ono što piše u Gitu – a to ne radi.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Oznaka</th>
                <th>Vrijednosti</th>
                <th>Znači</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>sinkronizacija</td>
                <td>
                  <code>Synced</code>, <code>OutOfSync</code>
                </td>
                <td>klaster jest ili nije isti kao commit koji Argo CD zna</td>
              </tr>
              <tr>
                <td>zdravlje</td>
                <td>
                  <code>Healthy</code>, <code>Progressing</code>, <code>Degraded</code>, <code>Suspended</code>, <code>Missing</code>, <code>Unknown</code>
                </td>
                <td>radi li, još se uvodi, ne radi, pauzirano, nema ga u klasteru, ne zna se</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout kind="fact" title="Koliko često Argo CD pita Git">
          Postavke <code>timeout.reconciliation</code> (zadano 120 s) i <code>timeout.reconciliation.jitter</code> (zadano do 60 s) u ConfigMapu <code>argocd-cm</code>. Webhook iz GitHuba, GitLaba ili Bitbucketa pokreće osvježavanje odmah, a redovita provjera ostaje kao rezerva. (stanje: listopad 2026.)
        </Callout>
      </Section>

      {/* 5 · drift */}
      <Section id="odstupanje" kicker="pokvarite" title="Odstupanje: kad netko dirne klaster" lead="Argo CD ručnu promjenu primijeti za sekundu – ali hoće li je vratiti, odlučujete vi.">
        <Predict
          question={
            <>
              Automatska sinkronizacija je uključena, a selfHeal nije. Davor naredbom <code>kubectl scale --replicas=10</code> poveća Deployment koji u Gitu ima <code>replicas: 4</code>. Što će Argo CD napraviti?
            </>
          }
          options={['odmah vratiti na 4', 'ništa ne mijenja: aplikacija je OutOfSync, a u klasteru ostaje 10', 'upisati 10 u Git', 'obrisati Deployment']}
          correct={1}
          explain="Automatska sinkronizacija reagira na nove commitove u Gitu. Promjenu koja nastane u klasteru vraća tek selfHeal – a on je po zadanom isključen. Sinkronizacija nikad ne piše u Git – ide samo iz Gita u klaster."
        />
        <p>
          Svaka razlika koja nastane u klasteru, a ne u Gitu, je <Term id="drift">odstupanje</Term> (engl. <em>drift</em>). Argo CD prati klaster i odstupanje vidi za otprilike sekundu – ali što s njim napravi, ovisi o tri postavke aplikacije, i sve tri su po zadanom isključene:
        </p>
        <ul>
          <li>
            <strong>automatska sinkronizacija</strong> – sinkronizira sama kad se u Gitu pojavi nešto novo;
          </li>
          <li>
            <strong>
              <Term id="self-heal">selfHeal</Term>
            </strong>{' '}
            – vraća i ručne promjene u klasteru (radi samo uz automatsku sinkronizaciju);
          </li>
          <li>
            <strong>
              <Term id="prune">prune</Term>
            </strong>{' '}
            – briše objekte koje je Argo CD postavio, a nestali su iz Gita. Bez njega takav objekt ostaje u klasteru, a aplikacija je OutOfSync.
          </li>
        </ul>
        <p>
          Objekt koji netko ručno <em>stvori</em> u klasteru Argo CD uopće ne prati: ne vidi ga kao razliku, a prune ga ne briše – prune briše samo ono što je Argo CD sam postavio.
        </p>
        <DriftLab />
        <Callout kind="fact" title="Obrisani Deployment: Missing, a aplikacija Healthy?">
          Resurs koji nedostaje označen je kao <code>Missing</code>, a aplikacija kao <code>OutOfSync</code> – ali zdravlje aplikacije ostaje <code>Healthy</code>, jer se računa samo od objekata koji postoje. Cijela aplikacija je <code>Missing</code> tek kad u klasteru nema ničega iz Gita. (stanje: listopad 2026.)
        </Callout>
        <p>
          A ako sinkronizacija ne uspije – npr. API poslužitelj odbije manifest s <code>replicas: "četiri"</code>? Automatska sinkronizacija pokuša još nekoliko puta, a onda za taj commit odustane. Dalje pomaže novi commit (najčešće <code>git revert</code>) ili ponovni klik na <em>Sync</em>. Broj pokušaja određuje <code>syncPolicy.retry</code>.
        </p>
        <Callout kind="fact" title="Koliko puta Argo CD ponavlja sinkronizaciju">
          Bez <code>syncPolicy.retry</code> Argo CD 3.x automatsku sinkronizaciju ponovi 5 puta (stanka 5 s, 10 s, 20 s …), a ručnu nijednom. (stanje: listopad 2026.)
        </Callout>
        <CodeBlock
          title="application.yaml"
          lang="yaml"
          code={applicationYaml}
          caption="Application za produkciju Klope: odakle čita, kamo postavlja i kako se ponaša pri odstupanju."
          notes={[
            { lines: '8-11', text: 'odakle: config repo, grana main, overlay za prod' },
            { lines: '15-18', text: 'ovo su tri prekidača iz simulacije' },
            { lines: '19-24', text: 'neuspjela sinkronizacija: 5 pokušaja, 5 s, 10 s, 20 s…' },
          ]}
        />
        <Callout kind="fact" title="Koliko brzo selfHeal vraća">
          Stranica dokumentacije o automatskoj sinkronizaciji još spominje 5 sekundi, ali u Argo CD-u 3.x kontroler vraća odstupanje čim ga primijeti, a ponovljeno odstupanje na istom commitu čeka sve dulje: 2 s, 6 s, 18 s … najviše 5 minuta. (stanje: listopad 2026.)
        </Callout>
        <CodeBlock title="Instalacija Argo CD-a" lang="bash" code={installSh} mode="closed" caption="Argo CD je i sam skup Deploymenata i jednog StatefulSeta u Namespaceu argocd; verzija je zadana točno (bez latest)." />
      </Section>

      {/* 6 · rollback */}
      <Section id="rollback" kicker="git" title="Rollback je git revert" lead="Kad je produkcija opisana u Gitu, i povratak na staro samo je još jedan commit.">
        <RevertStepper />
        <p>Isto stanje u Laninu terminalu – Synced, a ne radi:</p>
        <Terminal
          title="lana@klopa"
          lines={revertTerminal(story)}
          caption={`Izlaz iz simulacije (preset l22Auto + webhook, seed 22). Revert stvori commit ${story.revertShort}; nakon pregleda pull requesta Argo CD ga sinkronizira kao i svaki drugi.`}
        />
        <p>
          Zašto ne gumb <em>Rollback</em> u sučelju Argo CD-a? On bi vratio klaster na stariju sinkronizaciju, ali Git bi i dalje tvrdio <code>2.0.l</code> – i aplikacija bi ostala OutOfSync. Dok je automatska sinkronizacija uključena, Argo CD takvo <Term id="rollback">vraćanje na prethodnu verziju</Term> (engl. <em>rollback</em>) ni ne dopušta. <code>git revert</code> čuva Git kao istinu i ostavlja zapis: što je pošlo po zlu, tko je vratio i zašto.
        </p>
        <h3>Tko što radi: CI ili Argo CD</h3>
        <p>
          <Term id="pipeline">Pipeline</Term> iz prošlog predavanja ostaje, samo mu je kraj drukčiji. CI gradi, testira i objavljuje sliku, a zatim njegov bot u config repozitorij spremi novi digest slike – potpisanim commitom, kroz pull request, s tokenom koji vrijedi samo za taj repozitorij. Postavljanje radi Argo CD.
        </p>
        <Figure caption="Put jedne promjene. CI ne zna ni adresu klastera; Argo CD ne zna ništa o izgradnji." wide>
          <ChainFigure />
        </Figure>
        <Tabs
          tabs={[
            {
              label: 'repozitorij',
              content: <CodeBlock title="klopa-config/" lang="text" code={repoTree} mode="open" caption="Kod aplikacije živi u svom repozitoriju; ovdje je samo željeno stanje. Kustomize spaja zajedničku osnovu (base/) i dodatke za pojedino okruženje (engl. overlay, overlays/prod) u gotove manifeste." />,
            },
            {
              label: 'overlay prod',
              content: <CodeBlock title="apps/klopa-api/overlays/prod/kustomization.yaml" lang="yaml" code={kustomizationYaml} mode="open" notes={[{ lines: '7-9', text: 'ovaj digest mijenja CI bot' }]} />,
            },
            {
              label: 'CI korak',
              content: (
                <CodeBlock
                  title=".github/workflows/ci.yaml (isječak)"
                  lang="yaml"
                  code={ciStep}
                  notes={[
                    { lines: '10', text: 'token samo za config repo – nema kubeconfiga' },
                    { lines: '17', text: 'kustomize edit set image: novi digest' },
                    { lines: '21-25', text: 'potpis ključem ci-bota – njemu AppProject vjeruje' },
                    { lines: '27', text: 'u main tek nakon pregleda' },
                  ]}
                />
              ),
            },
          ]}
        />
        <Callout kind="info" title="Helm i Kustomize u Argo CD-u">
          Argo CD sam izradi manifeste iz predložaka: za Kustomize pokrene <code>kustomize build</code>, a za Helm chart <code>helm template</code> – i zatim sam vodi objekte. Helm zato ne zna za to izdanje, pa je <code>helm list</code> prazan:
          <Terminal title="lana@klopa" animate={false} lines={[{ cmd: 'helm list -n klopa' }, ...story.helmLines.map((l) => ({ out: l, tone: 'muted' as const }))]} />
        </Callout>
        <DeepDive title="Valovi sinkronizacije: migracija baze prije novih Podova">
          <p>
            Nova verzija ponekad treba i novu shemu baze. Argo CD redoslijed određuje anotacijom <code>argocd.argoproj.io/sync-wave</code> (zadano 0; manji val ide prije). Job s migracijom u valu −1 izvrši se prije Deploymenta u valu 0. Između valova Argo CD napravi kratku stanku i čeka da prethodni val bude zdrav – ako migracija ne uspije, Deployment se ni ne dira.
          </p>
          <p>Nakon zadnjeg vala sinkronizacija je gotova odmah nakon primjene: novi Podovi se možda još pale, pa je zdravlje tada Progressing.</p>
          <CodeBlock title="migracija-job.yaml" lang="yaml" code={migrationJob} notes={[{ lines: '6', text: 'hook: novi Job pri svakoj sinkronizaciji' }, { lines: '8', text: 'val −1 = prije Deploymenta' }]} />
        </DeepDive>
      </Section>

      {/* 7 · Argo CD vs HPA */}
      <Section id="hpa" kicker="pokvarite" prop="helm" title="Argo CD i HPA: tko drži uže?" lead="Kad isto polje pišu dva kontrolera, svaki misli da popravlja ono drugo.">
        <p>
          Iz osamnaestog predavanja: <Term id="horizontalpodautoscaler">HPA</Term> svakih 15 s izračuna koliko replika treba i upiše broj u <code>spec.replicas</code> Deploymenta. Ali u Gitu i dalje piše <code>replicas: 4</code>. Uz selfHeal Argo CD vidi odstupanje i vrati 4. HPA za 15 s opet upiše 6 – i tako u krug.
        </p>
        <TugOfWar />
        <p>Dva popravka – i jedna zamka:</p>
        <ol>
          <li>
            <strong>
              Uklonite <code>spec.replicas</code> iz Deploymenta u Gitu.
            </strong>{' '}
            Broj replika tada vodi samo HPA. Oprez: ako polje jednostavno obrišete iz postojećeg manifesta, prva sinkronizacija Deployment jednom spusti na zadanu vrijednost – 1 replika – dok HPA ne reagira. Zato slijedite postupak migracije na HPA iz dokumentacije Kubernetesa (najprije se polje ukloni iz zapisa zadnje primjene, pa tek onda iz Gita).
          </li>
          <li>
            <strong>Ako replicas mora ostati u Gitu:</strong> <Term id="ignore-differences">ignoreDifferences</Term> za <code>/spec/replicas</code> <em>zajedno</em> s opcijom <code>RespectIgnoreDifferences=true</code>.
          </li>
        </ol>
        <Callout kind="warn" title="Zamka: samo ignoreDifferences">
          Razlika se više ne prikazuje, ali sljedeća sinkronizacija – npr. zbog nove slike – opet upiše <code>replicas: 4</code>. To nije popravak, nego skrivanje borbe.
        </Callout>
        <CodeBlock title="ignoreDifferences + RespectIgnoreDifferences" lang="yaml" code={ignoreYaml} notes={[{ lines: '3-8', text: 'samo prikaz: razlika se ne broji' }, { lines: '9-11', text: 'tek ovo štiti replicas pri sinkronizaciji' }]} />
        <Callout kind="info" title="Argo CD nije jedini">
          Isti model povlačenja ima i <strong>Flux</strong>, projekt koji je u CNCF-u, kao i Argo, dosegnuo najvišu razinu zrelosti (engl. <em>graduated</em>). Flux je skup kontrolera bez središnjeg sučelja; tvrtka Weaveworks koja ga je pokrenula zatvorila se 2024., ali projekt se i dalje redovito izdaje. Načela iz ovog predavanja vrijede za oba alata.
        </Callout>
        <p>
          U config repozitoriju sada je sve što opisuje Klopu: Deploymenti, objekti Service, HPA, ConfigMapovi. Sve – osim jednog. <strong>A lozinke?</strong>
        </p>
      </Section>

      {/* 8 · flagship */}
      <Section id="simulacija" kicker="simulacija" title="Git je istina" lead="Sve zajedno: config repozitorij lijevo, Argo CD i klaster desno. Četiri zadatka – samo kroz Git i postavke Argo CD-a.">
        <GitIstinaSim />
        <Callout kind="key" title="Što ste upravo vidjeli">
          <ul>
            <li>Nova verzija stiže commitom (CI bot) i sinkronizacijom – bez ijedne naredbe <code>kubectl</code>.</li>
            <li>Ručna promjena je OutOfSync odmah, a vraća je tek selfHeal; obrisani Deployment selfHeal stvori ponovno.</li>
            <li>Loš commit je Synced, ali Degraded – popravak je <code>git revert</code>, a povijest ostaje.</li>
            <li>replicas u Gitu i HPA se bore; mir donosi uklanjanje polja iz Gita ili ignoreDifferences uz RespectIgnoreDifferences.</li>
          </ul>
        </Callout>
      </Section>

      {/* 9 · misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            { statement: 'Argo CD gradi i testira kod.', fact: false, explain: 'Gradnju, testove i objavu slike radi CI. Argo CD samo uspoređuje manifeste u Gitu s klasterom i primjenjuje razliku.' },
            { statement: 'Argo CD reagira odmah na svaki push.', fact: false, explain: 'Po zadanom provjerava Git svakih 120 s plus do 60 s – najviše oko 3 minute. Za sekundu-dvije samo ako postavite webhook.' },
            { statement: 'GitOps znači da je YAML u Gitu.', fact: false, explain: 'YAML u Gitu pokriva tek prva dva načela. GitOps traži i agenta koji stanje sam povlači i neprestano usklađuje.' },
            { statement: 'Ako netko ručno promijeni klaster, automatska sinkronizacija to odmah vrati.', fact: false, explain: 'Odstupanje se odmah vidi kao OutOfSync, ali vraća ga samo selfHeal – po zadanom isključen. (prune je nešto drugo: briše objekte koje ste uklonili iz Gita.)' },
            { statement: 'ignoreDifferences rješava borbu s HPA-om.', fact: false, explain: 'ignoreDifferences mijenja samo prikaz razlike. Bez RespectIgnoreDifferences=true sljedeća sinkronizacija opet upiše replicas iz Gita.' },
            { statement: 'S GitOpsom CI nema ključ klastera, pa je sve sigurno.', fact: false, explain: 'Ključ se premjestio: tko smije spremiti u config repozitorij, postavlja u produkciju, a Argo CD ima široka prava. Zaštitite repozitorij, AppProjectom ograničite što aplikacije smiju, a RBAC-om prava samog Argo CD-a.' },
            { statement: 'Rollback je najbolje napraviti naredbom git revert.', fact: true, explain: 'Novi commit vraća staro stanje, Git ostaje istina, a povijest pokazuje tko je što vratio i zašto. Gumb Rollback u sučelju ostavio bi Git i klaster različitima.' },
            { statement: 'Argo CD pokreće helm install.', fact: false, explain: 'Argo CD iz charta izradi manifeste naredbom helm template i sam vodi objekte – zato je helm list prazan.' },
          ]}
        />
      </Section>

      {/* 10 · recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'GitOps: željeno stanje je deklarativno i verzionirano u Gitu, a agent u klasteru ga sam povlači i neprestano usklađuje.',
            'Argo CD je petlja usklađivanja razinu više: Git → klaster. Argo CD provjerava Git svakih 120 s plus do 60 s; webhook to skraćuje na sekundu.',
            'Synced/OutOfSync i Healthy/Degraded su dvije neovisne oznake – Synced + Degraded znači da u Gitu piše nešto što ne radi.',
            'Ručno odstupanje Argo CD vidi odmah, ali vraća ga samo selfHeal; objekte uklonjene iz Gita briše samo prune – oboje je po zadanom isključeno.',
            'Rollback je git revert. CI gradi i sprema commit, Argo CD povlači i postavlja – a config repozitorij je sada ključ produkcije.',
          ]}
        />
        <StoryMap at="22" caption="Klopa nakon ovog predavanja: CI sprema u config repozitorij, a Argo CD u klasteru iz njega povlači. CI više ne dira klaster." />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Lana je u 12:00 spremila commit, webhook nije postavljen, a u 12:01 Argo CD i dalje pokazuje <code>Synced</code> na starom commitu. Što se događa?
                </>
              ),
              options: ['Argo CD je pokvaren.', 'Argo CD još nije provjerio Git – provjera je svakih 120 s plus do 60 s.', 'Git je odbio commit.', 'Klaster je već na novom commitu.'],
              correct: 1,
              explain: 'Dok ne provjeri Git, Argo CD uspoređuje sa starim commitom – i s njim je klaster stvarno isti. Novi commit vidi najkasnije za oko 3 minute, a s webhookom za sekundu.',
            },
            {
              q: 'Aplikacija je Synced, ali Degraded. Novi Podovi stoje u ImagePullBackOff, stari i dalje rade. Što je najvjerojatniji uzrok i popravak?',
              options: [
                'Netko je ručno promijenio klaster – uključite selfHeal.',
                'U Gitu je oznaka slike koja ne postoji – git revert tog commita.',
                'Argo CD nije vidio zadnji commit – kliknite Refresh.',
                'HPA se bori s Argo CD-om – uklonite replicas iz Gita.',
              ],
              correct: 1,
              explain: 'Synced znači da klaster točno odgovara Gitu. Ako to ne radi, problem je u samom Gitu – ovdje pogrešna oznaka slike. Popravak je novi commit: git revert.',
            },
            {
              q: (
                <>
                  Automatska sinkronizacija je uključena, selfHeal i prune nisu. Iz Gita uklonite ConfigMap <code>klopa-promo</code> (datoteku i njezin redak u <code>kustomization.yaml</code>). Što je u klasteru?
                </>
              ),
              options: ['ConfigMap se odmah briše.', 'ConfigMap ostaje, a aplikacija je OutOfSync dok ne uključite prune.', 'Argo CD vrati datoteku u Git.', 'Cijela aplikacija postaje Missing.'],
              correct: 1,
              explain: 'Bez prune Argo CD ne briše ništa što je nestalo iz Gita – samo ga označi da zahtijeva brisanje, pa je aplikacija OutOfSync.',
            },
            {
              q: (
                <>
                  Deployment u Gitu ima <code>replicas: 4</code>, HPA želi 6, selfHeal je uključen. Uključite samo ignoreDifferences za <code>/spec/replicas</code>. Što se dogodi kod sljedećeg commita s novom slikom?
                </>
              ),
              options: ['Ništa – borba je gotova.', 'Sinkronizacija opet upiše replicas: 4 – još jedna borba.', 'Argo CD obriše HPA.', 'HPA prestane raditi.'],
              correct: 1,
              explain: 'ignoreDifferences utječe samo na usporedbu. Sinkronizacija i dalje primjenjuje cijeli manifest – osim ako je uključen RespectIgnoreDifferences=true (ili replicas uopće nije u Gitu).',
            },
            {
              q: 'Klopa je prešla na model povlačenja. Tko sada može postaviti novu verziju u produkciju?',
              options: ['Samo administrator klastera.', 'Svatko tko smije spremiti u granu main config repozitorija – zato se ona štiti pregledom i potpisima.', 'Nitko – Argo CD odlučuje sam.', 'Samo CI, svojim ključem klastera.'],
              correct: 1,
              explain: 'Povlačenje premješta ključ iz CI-ja u config repozitorij. Zaštita grane, obvezan pregled, potpisani commitovi i AppProject zatvaraju taj put.',
            },
            {
              q: 'Iz 18. predavanja: što HPA mijenja kad odluči da treba više Podova?',
              options: ['Sam pokreće nove kontejnere.', 'Polje spec.replicas u Deploymentu.', 'Broj čvorova u klasteru.', 'Datoteku deployment.yaml u Gitu.'],
              correct: 1,
              explain: 'HPA upiše novi broj u spec.replicas, a Podove stvara ReplicaSet. Zato se sukobi s Argo CD-om kad isto polje piše i u Gitu.',
            },
          ]}
        />
      </Section>

      {/* 11 · cost */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={['Git opisuje produkciju: novi klaster se puni jednom sinkronizacijom.', 'CI više nema ključ klastera, a ručne promjene Argo CD vidi odmah.', 'Povratak na staru verziju je git revert, a povijest Gita je povijest postavljanja.']}
          paid={['Config repozitorij je novi ključ produkcije – treba pregled i potpise.', 'Argo CD je još jedan sustav sa širokim pravima u klasteru.', 'Lozinke ne smiju u Git – pa ih GitOps zasad ne pokriva.']}
          next={
            <>
              Sve što opisuje Klopu sada je u Gitu – osim lozinki, koje prema 16. predavanju nikad ne smiju u Git. Lana zato <code>secret.yaml</code> primjenjuje ručno sa svog laptopa, a kad se podigne novi klaster, API Podovi ne mogu ni krenuti: stoje u <code>CreateContainerConfigError</code> jer Secreta nema.
            </>
          }
        />
      </Section>
    </>
  )
}

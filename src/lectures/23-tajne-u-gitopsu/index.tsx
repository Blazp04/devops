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
  Tabs,
  Term,
  Terminal,
} from '../../kit'
import { INCIDENT_AT, SEED, START_PRESET } from './lib/flagship'
import { incidentNumbers, leakScene } from './lib/scenes'
import { DecisionTree } from './sims/DecisionTree'
import { EsoStepper } from './sims/EsoStepper'
import { LeakStepper } from './sims/LeakStepper'
import { LockOrAddress } from './sims/LockOrAddress'
import { PutTajneGitOps } from './sims/PutTajneGitOps'
import { RotationChart } from './sims/RotationChart'
import { SealedStepper } from './sims/SealedStepper'
import { WhereGrid } from './sims/WhereGrid'
import sealedYaml from './code/sealedsecret-sms.yaml?raw'
import backupSh from './code/sealed-secrets-kopija.sh?raw'
import restoreSh from './code/sealed-secrets-vracanje.sh?raw'
import externalYaml from './code/externalsecret-sms.yaml?raw'
import spcYaml from './code/secretproviderclass-sms.yaml?raw'
import sopsYaml from './code/secret-sms.enc.yaml?raw'
import styles from './styles.module.css'

export default function Lecture() {
  const inc = incidentNumbers()
  const leak = leakScene()
  return (
    <>
      <Section id="incident" kicker="priča" title="Novi klaster, a lozinke nema" lead="Sve što opisuje Klopu sada je u Gitu – osim tajni. I baš su tajne zakazale.">
        <IncidentCard
          no={23}
          when="ponedjeljak, 09:40"
          title={
            <>
              Na novom klasteru <code>klopa-api</code> ne može ni krenuti
            </>
          }
          who="lana"
          says={['Secreta nema!', 'Bio je samo', 'u starom…']}
          preset={`${START_PRESET.incident} · ${INCIDENT_AT} s nakon podizanja`}
          seed={SEED}
          metrics={[
            { label: 'klopa-api spremno', value: `${inc.apiReady} / ${inc.apiTotal}`, tone: 'bad' },
            { label: 'oči koje čitaju SMS ključ', value: `${inc.smsRed} od ${inc.eyesTotal}`, tone: 'bad' },
            { label: 'procurjeli commit', value: inc.leakSha, tone: 'warn' },
          ]}
        >
          Lana je <code>secret.yaml</code> s lozinkom baze primijenila ručno, pa ga novi klaster nema: oba API Poda stoje u <code>{inc.apiStatus}</code>. A <code>klopa-worker</code> radi – netko je njegov Secret sa SMS ključem spremio u Git, kodiran u base64.
        </IncidentCard>
        <p>
          U prošlom predavanju Klopa je prešla na <Term id="gitops">GitOps</Term>: <Term id="argo-cd">Argo CD</Term> u klaster primjenjuje ono što piše u Gitu. Sve osim tajni, jer prema 16. predavanju lozinke ne smiju u Git. Dok je postojao samo jedan klaster, to se nije primjećivalo. Novi klaster dobio je sve iz Gita – i ništa drugo.
        </p>
        <Terminal
          title="Lanin laptop · novi klaster"
          lines={[
            { cmd: 'kubectl get pods -n klopa' },
            {
              out: `NAME                            READY   STATUS                       RESTARTS   AGE\nklopa-api-6d8f7c9b5-4kq2x       0/1     ${inc.apiStatus}   0          ${INCIDENT_AT}s\nklopa-api-6d8f7c9b5-x7wpl       0/1     ${inc.apiStatus}   0          ${INCIDENT_AT}s\nklopa-worker-5b7c4d8f6-p2m9r    1/1     ${inc.workerStatus}                      0          ${INCIDENT_AT}s`,
            },
            { cmd: 'kubectl describe pod klopa-api-6d8f7c9b5-4kq2x -n klopa | tail -1' },
            { out: `  Warning  Failed  1s  kubelet  ${inc.apiMessage}`, tone: 'bad', note: 'Secret klopa-db postojao je samo u starom klasteru.', who: 'lana' },
          ]}
        />
        <MarginNote tone="red">ključ je znala jedna osoba</MarginNote>
        <p>
          SMS ključ ima svoju priču. Kad je Davor otišao na Erasmus, pokazalo se da je ključ za SMS-gateway postojao samo na njegovu laptopu. Dva dana ga se tražilo, jer nitko drugi nije znao ni gdje se ključ izdaje. Na kraju ga je Davor poslao porukom, a netko ga je „privremeno” spremio u Git – i to je commit <code>{inc.leakSha}</code>. Ključ i danas vrijedi, a zna ga i Davor.
        </p>
        <p>
          Imamo, dakle, tri problema odjednom: tajna koje nema u Gitu, tajna koja je u Gitu, a ne bi smjela biti, i tajna koju zna samo jedna osoba. Pitanje ovog predavanja: <Mark>kako tajne uklopiti u GitOps, a da ih nikad ne zapišemo u Git?</Mark>
        </p>
      </Section>

      <Section id="dilema" kicker="problem" title="Git želi sve, a tajna ne smije u Git" lead="GitOps traži da sve što opisuje klaster bude u Gitu. Za tajnu bi to značilo dati je svakome tko ima klon.">
        <p>
          Zašto je obični <Term id="secret">Secret</Term> u Gitu problem, znamo iz 16. predavanja: <Term id="base64">base64</Term> je zapis, a ne šifra. Ovdje je još gore, jer Git ne zaboravlja. Prije nego što pogledamo kako, predvidite:
        </p>
        <Predict
          question={
            <>
              Lana primijeti procurjeli commit i izbriše ga iz povijesti (<code>git rebase</code> pa <code>git push --force</code>). Tko još može pročitati SMS ključ?
            </>
          }
          options={['Nitko: commita više nema na poslužitelju', 'Svatko tko je repozitorij klonirao ili kopirao prije brisanja', 'Samo administrator poslužitelja za Git']}
          correct={1}
          explain="Prepisivanje povijesti mijenja samo granu na poslužitelju. Klonovi na laptopima, predmemorija CI-ja, forkovi i sigurnosne kopije i dalje imaju stari commit. Zato procurjelu tajnu treba promijeniti: novi ključ, a stari opozvati."
          then="Pogledajmo to korak po korak."
        />
        <LeakStepper />
        <p>
          I nakon commita <code>{leak.removalShort}</code> povijest i dalje otkriva važeći ključ, a tek nakon <Term id="secret-rotation">rotacije</Term> procurjela vrijednost više ništa ne otvara. Usput: dok je čitljiv Secret bio u Gitu, Argo CD ga je spremio i u svoju predmemoriju.
        </p>
        <KeyIdea>
          U Git smije <strong>brava</strong> (šifrat koji otvara samo klaster) ili <strong>adresa</strong> (gdje vrijednost stoji), nikad <strong>ključ</strong>. Kad tajna jednom procuri, pomaže samo <strong>rotacija</strong>.
        </KeyIdea>
        <Figure caption="Dvije obitelji alata: brava u Gitu i adresa u Gitu.">
          <LockOrAddress />
        </Figure>
        <Analogy
          title="Brava ili adresa"
          breaksDown="Kad kuhinja kutiju otključa, unutra je opet obična tajna: u klasteru je to običan Secret koji čita svatko tko smije čitati Secrete ili stvarati Podove. A ako procuri ključ brave, otvara se i svaka stara kutija iz povijesti Gita."
        >
          Dostavljač smije u menzu nositi zaključanu kutiju ili ceduljicu s adresom skladišta, ali nikad ključ od ostave. Kutiju otvara samo kuhinja, a po adresi robu doveze netko tko smije u skladište. (Dostavljač = Git i Argo CD, zaključana kutija = SealedSecret, kuhinja = kontroler u klasteru, ceduljica = ExternalSecret, netko tko smije u skladište = ESO.)
        </Analogy>
      </Section>

      <Section id="sealed-secrets" kicker="tajne" title="Sealed Secrets: brava u Gitu" lead="Šifrirajmo tajnu ključem koji ima samo klaster.">
        <p>
          <Term id="sealed-secrets">Sealed Secrets</Term> čine dva dijela: kontroler u klasteru i alat <code>kubeseal</code> na laptopu. Ideja je asimetrično šifriranje: javnim ključem svatko može zaključati, a otključati može samo onaj tko ima privatni ključ – kontroler.
        </p>
        <SealedStepper />
        <p>
          Kontroler privatne ključeve čuva kao obične Secrete u Namespaceu <code>kube-system</code>, s oznakom{' '}
          <span className={styles.wrapCode}>
            <code>sealedsecrets.bitnami.com/sealed-secrets-key</code>
          </span>
          . To znači dvije stvari koje se lako zaborave:
        </p>
        <ul>
          <li>
            <strong>Bez kopije ključeva novi klaster ne otključava ništa.</strong> Novi kontroler napravi nove ključeve, a SealedSecreti iz Gita zaključani su starima. Podovi tada stoje u <code>CreateContainerConfigError</code> ili <code>ContainerCreating</code> – isti incident kao danas, samo s drugim uzrokom.
          </li>
          <li>
            <strong>Obnova ključa nije rotacija.</strong> Novi ključ za pečaćenje koristi se za nove SealedSecrete; stari ostaju šifrirani starim ključem, a vrijednosti su iste. Procurjelu lozinku ne popravlja.
          </li>
        </ul>
        <Myth myth="Zapečaćena tajna sigurna je i unutar klastera.">
          Kontroler od SealedSecreta napravi običan Secret. Tko u Namespaceu smije čitati Secrete ili stvarati Podove, čita i njega – šifriranje u mirovanju i RBAC iz 16. predavanja i dalje vrijede.
        </Myth>
        <Callout kind="fact" title="Sealed Secrets (stanje: listopad 2026.)">
          Trenutačna verzija je v0.40.0. Kontroler svakih 30 dana doda novi ključ za pečaćenje i zadrži stare. Šifrat je po zadanom (<code>strict</code>) vezan uz ime i Namespace; <code>--scope namespace-wide</code> dopušta preimenovanje unutar Namespacea, a <code>cluster-wide</code> otključavanje bilo gdje.
        </Callout>
        <DeepDive title="Zašto je strict zadani opseg">
          <p>
            Kontroler otključava svakome tko u klaster unese SealedSecret. Da šifrat nije vezan uz ime i Namespace, netko s pravom stvaranja SealedSecreta u svojem Namespaceu mogao bi kopirati vaš SealedSecret iz Gita, primijeniti ga kod sebe i pročitati dobiveni Secret. Uz <code>strict</code> takav pokušaj ne uspije: ime i Namespace su dio šifriranog sadržaja.
          </p>
        </DeepDive>
      </Section>

      <Section id="trezor" kicker="koncept" title="Trezor i External Secrets Operator: adresa u Gitu" lead="U Gitu je samo adresa tajne. Vrijednost čuva trezor, a u klaster je donosi operator.">
        <p>
          Druga obitelj alata u Git ne stavlja ni šifrat. Vrijednost živi u <Term id="secret-store">trezoru</Term>: to može biti Vault, OpenBao ili upravitelj tajni u oblaku. <Term id="external-secrets-operator">External Secrets Operator</Term> (ESO) u klasteru čita trezor i od vrijednosti napravi Kubernetesov Secret.
        </p>
        <EsoStepper />
        <Myth myth="Uz vanjski trezor nema Kubernetesova Secreta.">
          ESO stvara običan Secret (<code>klopa-sms</code>) i održava ga. Podovi ga čitaju kao i prije, pa i za njega vrijede šifriranje u mirovanju i RBAC.
        </Myth>
        <p>Sad kad znamo obje obitelji, usporedimo ih:</p>
        <Compare
          left={{
            title: 'Brava u Gitu',
            tone: 'green',
            points: ['U Gitu je šifrirana vrijednost (SealedSecret).', 'Ključ za otključavanje je u klasteru.', 'Ne treba nova usluga izvan klastera.', 'Rotacija: nova vrijednost, novo šifriranje, novi commit.'],
          }}
          right={{
            title: 'Adresa u Gitu',
            tone: 'blue',
            points: ['U Gitu je samo referenca (ExternalSecret).', 'Vrijednost čuva trezor: Vault, OpenBao ili oblak.', 'Rotacija bez commita: promjena u trezoru stiže sama.', 'Trezor postaje usluga o kojoj klaster ovisi.'],
          }}
        />
        <h3>Kada novu vrijednost vidi koji Pod</h3>
        <p>Rotacija nije gotova kad se promijeni izvor istine, nego kad novu vrijednost koristi svaki Pod. A Podovi je ne vide jednako brzo.</p>
        <Predict
          question={
            <>
              SMS ključ rotiramo u trezoru točno u 12:00:00. ESO ima <code>refreshInterval: 30s</code>. Jedan Pod čita ključ iz montiranog volumena, a drugi iz varijable okruženja. Kada novu vrijednost vidi Pod s varijablom okruženja?
            </>
          }
          options={[<>Najkasnije u 12:00:30</>, <>Oko 12:02, kad agent <code>kubelet</code> osvježi datoteke</>, <>Tek kad se Pod ponovno pokrene</>]}
          correct={2}
          explain={
            <>
              Varijabla okruženja upisuje se samo pri pokretanju kontejnera. Secret se promijeni najkasnije za 30 s, a datoteka u volumenu kad je agent <code>kubelet</code> osvježi (do oko minute i pol) – Pod to vidi ako aplikacija datoteku ponovno pročita. Varijabla okruženja promijeni se tek nakon <code>kubectl rollout restart</code>.
            </>
          }
        />
        <p>
          Sa SealedSecretom rotacija čeka novi commit i Argo CD, koji Git po zadanom provjerava svake dvije minute, uz nasumičan odmak do jedne minute (Klopina aplikacija u Argo CD-u sinkronizira se automatski; bez toga Argo CD samo javi <code>OutOfSync</code>). ESO commit ne treba, ali bez <code>refreshInterval</code> u YAML-u osvježava tek jednom na sat. Plan rotacije za Klopu zato izgleda ovako:
        </p>
        <ol>
          <li>Kod izdavatelja (SMS-gateway) napravite novi ključ, a stari zasad ne opozivajte, tako da kratko vrijede oba.</li>
          <li>Novu vrijednost upišite u izvor istine: u trezor ili u novi SealedSecret koji spremite u Git.</li>
          <li>
            Pričekajte da je vide svi Podovi: volumen sam (ako aplikacija datoteku ponovno pročita; montiranje sa <code>subPath</code> se nikad ne osvježava), varijabla okruženja uz <code>kubectl rollout restart</code>.
          </li>
          <li>Tek tada opozovite staru vrijednost. Tko zna samo nju, više ne može ništa.</li>
        </ol>
      </Section>

      <Section id="ostale" kicker="koncept" title="Ostale mogućnosti i preporuka Argo CD-a" lead="Svaki alat negdje mora otključati tajnu. Važno je gdje.">
        <p>Usporedimo šest pristupa po tome gdje postoji čitljiva kopija važeće vrijednosti (svaki pristup od nule, s čistom poviješću Gita i bez šifriranja u mirovanju).</p>
        <Figure wide caption="Gdje živi čitljiva vrijednost: crveno šrafirano = čitljivo, zeleno = šifrat, plavo iscrtkano = samo adresa, crtica = nema čitljive kopije.">
          <WhereGrid />
        </Figure>
        <Tabs
          tabs={[
            {
              label: 'SOPS',
              content: (
                <p>
                  <Term id="sops">SOPS</Term> šifrira samo vrijednosti, a nazive polja u YAML-u ostavlja čitljivima, pa diff u Gitu i dalje ima smisla. Ključ za šifriranje je age, PGP ili KMS u oblaku. Flux SOPS dešifrira sam. Argo CD nema ugrađenu podršku: treba mu dodatak (KSOPS ili helm-secrets) koji dešifrira pri generiranju manifesta – a to je upravo pristup koji Argo CD ne preporučuje, jer čitljiv manifest završi u njegovoj predmemoriji.
                </p>
              ),
            },
            {
              label: 'CSI driver',
              content: (
                <p>
                  <Term id="secrets-store-csi-driver">Secrets Store CSI Driver</Term> dohvati vrijednost iz trezora pri pokretanju Poda i montira je u tmpfs, datotečni sustav u memoriji čvora. Secreta u bazi <code>etcd</code> nema, osim ako uključite sinkronizaciju u Secret. Automatska rotacija postoji, ali je po zadanom isključena. Cijena: ako trezor ne radi, novi Podovi ostaju u <code>ContainerCreating</code> s porukom <code>FailedMount</code>.
                </p>
              ),
            },
            {
              label: 'argocd-vault-plugin',
              content: (
                <p>
                  argocd-vault-plugin u manifestu zamijeni oznaku <code>{'<path:…>'}</code> stvarnom vrijednošću dok Argo CD generira manifeste. Argo CD tada mora imati pristup trezoru, generirani manifest s čitljivom tajnom stoji u Redisu Argo CD-a, a nova vrijednost čeka da se manifest ponovno generira. Dodatak nije objavio novo izdanje od lipnja 2024.
                </p>
              ),
            },
          ]}
        />
        <p>Koliko rotacija putuje do datoteke u Podu, ovisi o alatu:</p>
        <Figure
          caption={
            <>
              Najdulje čekanje da nova vrijednost stigne u datoteku u Podu, u stvarnom vremenu i na logaritamskoj skali. Za varijablu okruženja treba još <code>kubectl rollout restart</code>.
            </>
          }
        >
          <RotationChart />
        </Figure>
        <Callout kind="info" title="Preporuka Argo CD-a: tajne u odredišnom klasteru">
          Dokumentacija Argo CD-a preporučuje da se tajnama upravlja u klasteru u koji se postavlja aplikacija: Sealed Secrets, External Secrets Operator, Secrets Store CSI Driver ili Vault Secrets Operator. Dodatke koji tajnu ubacuju pri generiranju manifesta ne preporučuje, iz tri razloga: Argo CD tada mora moći čitati tajne, čitljivi manifesti stoje u njegovoj predmemoriji (Redis), a promjena tajne vezana je uz sinkronizaciju aplikacije.
        </Callout>
        <p>
          Zadnji stupac tablice nikad nije prazan. To je <Mark>iskrena granica svakog alata</Mark>: aplikacija mora znati vrijednost, pa je zna i Pod. Tko u Namespaceu smije stvarati Podove, može montirati tajnu u svoj Pod i pročitati je – zato RBAC iz 16. predavanja vrijedi i uz najbolji alat.
        </p>
      </Section>

      <Section id="simulacija" kicker="simulacija" title="Put tajne (2. dio)" lead="Isti put tajne kao u 16. predavanju, ali sada kroz Git, Argo CD i trezor.">
        <p>
          Simulacija kreće od incidenta: novi klaster, lozinka baze nikad nije bila u Gitu, a SMS ključ jest – u base64. Deset očiju gleda SMS ključ; otvoreno crveno oko može pročitati vrijednost koja još vrijedi. Pristup mijenjate za obje tajne odjednom, a vrijeme rotacije mjeri se u stvarnim minutama. Traka na kutiji za ručak (Podu) pokazuje verziju tajne koju Pod koristi.
        </p>
        <Predict
          question="Recimo da Klopa prijeđe na SealedSecret i ništa drugo ne promijeni. Je li oko „Čitatelj Git repozitorija” sada zatvoreno?"
          options={['Da: u Gitu je sada samo šifrat', 'Ne: stari base64 commit ostaje u povijesti, a vrijednost još vrijedi', 'Ne: SealedSecret je i dalje samo base64']}
          correct={1}
          explain="Novi commit ne briše stari. Oko se zatvara tek kad rotirate SMS ključ: stara vrijednost iz povijesti tada više ništa ne otvara."
          then="Provjerite u simulaciji: odaberite SealedSecret, pa rotirajte ključ."
        />
        <PutTajneGitOps />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Prijelaz na SealedSecret, SOPS ili ESO vraća <code>klopa-api</code> u rad bez ručnog koraka, ali oko Gita ostaje otvoreno dok ne rotirate ključ.</li>
            <li>ESO rotira bez commita; SealedSecret čeka commit i Argo CD; varijabla okruženja čeka ponovno pokretanje Poda.</li>
            <li>Izgubljen privatni ključ bez kopije znači da novi klaster ne otključava ništa iz Gita. Procurjeli ključ otvara sve stare SealedSecrete. Pomaže tek ovim redom: najprije novi ključ za pečaćenje (gumb „Obnovi ključ za pečaćenje” u Naprednom), zatim rotacija vrijednosti.</li>
            <li>S nedostupnim trezorom ESO poslužuje zadnji Secret, CSI driver ne pušta nove Podove, a rotacija čeka.</li>
            <li>Oči „Smije stvarati Podove” i „Kompromitirani Pod aplikacije” ostaju crvene uz svaki alat: to je iskrena granica.</li>
          </ul>
        </Callout>
        <DeepDive title="Gdje je simulacija pojednostavljena">
          <ul>
            <li>
              Vrijeme je sažeto i to piše uz svaku vrijednost: provjera Gita 12 s (sim) ≈ 120 s + do 60 s stvarno, osvježavanje datoteke 10 s ≈ do oko minute i pol, novi ključ za pečaćenje 60 s ≈ 30 dana, predmemorija Argo CD-a 12 min ≈ 24 h. ESO-ov <code>refreshInterval: 30s</code> nije sažet: tako piše u YAML-u.
            </li>
            <li>Cilj „&lt; 5 min” računa se u stvarnom vremenu: svaka sekunda simulacije pomnoži se faktorom onoga na što se čekalo.</li>
            <li>Jedan Namespace i jedan klaster; trezoru se pristupa identitetom radnog opterećenja (statični token u Secretu nije modeliran).</li>
            <li>Rotacija pretpostavlja da izdavatelj kratko prihvaća staru i novu vrijednost, pa se stara opoziva tek kad je nova u svim Podovima.</li>
            <li>Pretpostavljamo da <code>klopa-worker</code> datoteku čita pri svakom slanju SMS-a. Aplikacija koja je čita samo pri pokretanju treba ponovno pokretanje kao i varijabla okruženja.</li>
            <li>Registar slika nije nacrtan: nijedan pristup iz ovog predavanja ne stavlja tajnu u sliku.</li>
          </ul>
        </DeepDive>
      </Section>

      <Section id="kod" kicker="kod" title="SealedSecret, ExternalSecret i ostalo u YAML-u" lead="Ono što ste vidjeli u animacijama stane u nekoliko kratkih datoteka.">
        <p>Najprije Sealed Secrets. Secret nastaje samo u memoriji, odmah se zapečati, a u Git ide samo rezultat:</p>
        <Terminal
          title="Lanin laptop"
          lines={[
            { comment: '# kubeseal javni ključ dohvati od kontrolera u klasteru' },
            { comment: '# instalacija Helmom: kubeseal --controller-name sealed-secrets' },
            { cmd: 'kubectl create secret generic klopa-sms -n klopa --from-file=SMS_API_KEY=./sms-kljuc.txt --dry-run=client -o yaml | kubeseal --format yaml > sealedsecret-sms.yaml' },
            { cmd: 'rm sms-kljuc.txt && git add sealedsecret-sms.yaml && git commit -m "SMS ključ kao SealedSecret"' },
            { comment: '# nakon sinkronizacije Argo CD-a' },
            { cmd: 'kubectl get secret klopa-sms -n klopa' },
            { out: 'NAME        TYPE     DATA   AGE\nklopa-sms   Opaque   1      40s', note: 'Kontroler je otključao SealedSecret: ovo je opet običan Secret.' },
          ]}
        />
        <CodeBlock
          title="sealedsecret-sms.yaml"
          lang="yaml"
          code={sealedYaml}
          caption="Jedina datoteka sa SMS ključem koja smije u Git."
          notes={[
            { lines: '2-3', text: 'vrsta koju donosi kontroler Sealed Secrets' },
            { lines: '10', text: 'šifrat: otključava ga samo kontroler' },
            { lines: '11-15', text: 'predložak Secreta koji kontroler stvori' },
          ]}
        />
        <CodeBlock
          title="sealed-secrets-kopija.sh"
          lang="bash"
          code={backupSh}
          caption="Kopija privatnih ključeva kontrolera: bez nje novi klaster ne otključava ništa iz Gita."
          notes={[
            { lines: '3-5', text: 'svi ključevi, i stari' },
            { lines: '7-8', text: 'kopija živi izvan klastera i izvan Gita' },
            { lines: '10', text: 'kopija ne smije ostati na laptopu' },
          ]}
        />
        <CodeBlock
          title="sealed-secrets-vracanje.sh"
          lang="bash"
          code={restoreSh}
          caption="Vraćanje ključeva na novi klaster, prije nego što Argo CD primijeni SealedSecrete."
          notes={[
            { lines: '2-3', text: 'kopiju najprije dohvatite iz trezora tima' },
            { lines: '6', text: 'kontroler pri pokretanju učita stare ključeve' },
          ]}
        />
        <p>Zatim External Secrets Operator: u Gitu je adresa, a jednom po klasteru opišemo kako ESO dolazi do trezora.</p>
        <CodeBlock
          title="externalsecret-sms.yaml"
          lang="yaml"
          code={externalYaml}
          caption={
            <>
              ExternalSecret (adresa) i ClusterSecretStore (put do trezora); primjer koristi OpenBao/Vault, a za upravitelja tajni u oblaku, kakav bira Klopa, mijenja se samo blok <code>provider</code>.
            </>
          }
          notes={[
            { lines: '8', text: 'bez ovoga ESO osvježava jednom na sat' },
            { lines: '13', text: 'ovaj Secret ESO stvara i održava' },
            { lines: '18-19', text: 'adresa u trezoru, ne vrijednost' },
            { lines: '28-29', text: 'trezor smiju koristiti samo ovi Namespacei' },
            { lines: '35-38', text: 'prijava identitetom, bez lozinke u Gitu' },
          ]}
        />
        <CodeBlock title="secretproviderclass-sms.yaml" lang="yaml" code={spcYaml} mode="closed" caption="Secrets Store CSI Driver: adresa u Gitu, vrijednost samo u tmpfs-u Poda." />
        <CodeBlock title="secret-sms.enc.yaml" lang="yaml" code={sopsYaml} mode="closed" caption="SOPS s age ključem: šifrirane su samo vrijednosti." />
        <Callout kind="fact" title="Verzije iz primjera (stanje: listopad 2026.)">
          External Secrets Operator v2.11.0 s API-jem <code>external-secrets.io/v1</code>; Sealed Secrets v0.40.0 s <code>bitnami.com/v1alpha1</code>; SOPS v3.13.3; Secrets Store CSI Driver 1.6.1 s <code>secrets-store.csi.x-k8s.io/v1</code>.
        </Callout>
      </Section>

      <Section id="odabir" kicker="odluka" title="Što odabrati: mali tim i velika organizacija" lead="Nema jednog pravog alata, ali ima pravog alata za veličinu tima.">
        <p>
          Mali tim bez ikakvog trezora najbrže će krenuti s alatom Sealed Secrets: nema nove usluge, sve radi unutar klastera. Organizacija u oblaku obično već ima upravitelja tajni s pravima pristupa i zapisom revizije (tko je i kada čitao tajnu); ondje je ESO prirodan izbor.
        </p>
        <p>
          Klopa je mali tim, ali njezin klaster radi kod pružatelja oblaka (zato je u 18. predavanju mogao dobivati nove čvorove), a oblak već ima upravitelja tajni. Nakon Davorova odlaska tim zato bira <strong>ESO i upravitelja tajni u oblaku</strong>: rotacija bez commita, pristup za više ljudi uz zapis revizije i nema privatnog ključa kontrolera koji treba čuvati.
        </p>
        <DecisionTree />
        <MarginNote tone="red">faktor autobusa = 1</MarginNote>
        <p>
          Davorov odlazak pokazao je pravi problem: ključ je znala jedna osoba. To se zove <strong>faktor autobusa</strong> (engl. <em>bus factor</em>): najmanji broj ljudi čijim odlaskom posao stane. Kod Klope je bio 1. Rješenje nije samo alat, nego i zapisan plan rotacije te pristup tajnama za više ljudi. Isto vrijedi i za alate: ESO je jedno vrijeme održavala praktički jedna osoba.
        </p>
        <Callout kind="fact" title="External Secrets Operator (stanje: listopad 2026.)">
          CNCF Sandbox projekt. Dana 13. kolovoza 2025. zaustavio je izdanja i podršku zbog premalo održavatelja. S novim održavateljima izdanja su se nastavila: v0.20.0 (22. rujna 2025.), v1.0.0 (7. studenoga 2025.), a trenutačno je v2.11.0 (18. rujna 2026.).
        </Callout>
        <Callout kind="fact" title="Vault i OpenBao (stanje: listopad 2026.)">
          HashiCorp Vault od kolovoza 2023. izlazi pod licencom BSL 1.1, koja nije licenca otvorenog koda; HashiCorp je u veljači 2025. preuzeo IBM. OpenBao je fork Vaulta pod licencom MPL-2.0, u okviru zaklade OpenSSF (Linux Foundation). argocd-vault-plugin: zadnje izdanje v1.18.1 (lipanj 2024.).
        </Callout>
        <Callout kind="tip" title="Tajne u CI-ju (21. predavanje)">
          Pipeline ne treba dugotrajne tokene za oblak ili registar: uz OIDC federaciju dobije kratkotrajan token za svako pokretanje. Ako ga netko i ispiše u log, brzo istekne. Gumb „Token u CI logu” u simulaciji pokazuje drugi slučaj: pipeline ispiše dugotrajnu tajnu aplikacije (ovdje SMS ključ). Nju OIDC ne zamjenjuje, pa pomaže samo rotacija.
        </Callout>
      </Section>

      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            { statement: 'Secret u base64 u privatnom repozitoriju je u redu.', fact: false, explain: 'Svatko s klonom, sigurnosnom kopijom ili CI logom može ga dekodirati jednom naredbom. Privatnost repozitorija ne traje vječno, a klonovi ne nestaju.' },
            { statement: 'Obrisao sam commit, riješeno.', fact: false, explain: 'Klonovi i kopije zadržavaju stari commit. Jedini lijek je rotacija: novi ključ, a stari opozvati.' },
            { statement: 'Obnova ključa Sealed Secretsa svakih 30 dana rotira tajne.', fact: false, explain: 'Kontroler samo doda novi ključ za pečaćenje. Stari SealedSecreti i stvarne vrijednosti ostaju isti.' },
            { statement: 'Koristite argocd-vault-plugin.', fact: false, explain: 'Argo CD ga ne preporučuje: mora čitati tajne, a čitljivi manifesti stoje u Redisu. Novog izdanja nema od lipnja 2024.' },
            { statement: 'Vault je open source pod MPL-om.', fact: false, explain: 'Od kolovoza 2023. Vault je pod licencom BSL 1.1. OpenBao je fork pod MPL-2.0.' },
            { statement: 'External Secrets Operator je napušten.', fact: false, explain: 'Izdanja su bila zaustavljena u kolovozu 2025., ali su se nastavila u rujnu 2025. i redovito izlaze.' },
          ]}
        />
      </Section>

      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'U Git smije brava (SealedSecret, SOPS) ili adresa (ExternalSecret), nikad ključ: base64 nije šifra.',
            'Procurjelu tajnu ne spašava brisanje commita, nego rotacija: nova vrijednost, pa opoziv stare.',
            'Sealed Secrets: novi ključ svakih 30 dana nije rotacija; privatne ključeve kopirajte izvan klastera.',
            'ESO i CSI driver vrijednost uzimaju iz trezora: rotacija bez commita, ali trezor postaje ovisnost.',
            'Svaki alat na kraju daje vrijednost Podu: RBAC, šifriranje u mirovanju i rotacija i dalje vrijede.',
          ]}
        />
        <StoryMap at="23" />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Nakon podizanja novog klastera Podovi <code>klopa-api</code> stoje u <code>CreateContainerConfigError</code>, a u događajima piše <code>secret "klopa-db" not found</code>. Što je najvjerojatniji uzrok?
                </>
              ),
              options: [
                <>
                  Slika <code>klopa-api</code> je pokvarena
                </>,
                'Secret je bio primijenjen ručno i nije u Gitu, pa ga novi klaster nema',
                'Argo CD nije sinkronizirao Deployment',
                'Čvoru je ponestalo memorije',
              ],
              correct: 1,
              explain: (
                <>
                  <code>CreateContainerConfigError</code> znači da agent <code>kubelet</code> ne može složiti konfiguraciju kontejnera – ovdje jer Secret na koji pokazuje <code>secretKeyRef</code> ne postoji. Deployment je stigao iz Gita, a ručno primijenjeni Secret nije. Pokvarena slika dala bi grešku pri povlačenju ili <code>CrashLoopBackOff</code>.
                </>
              ),
            },
            {
              q: 'Netko je u Git spremio Secret s ključem za SMS-gateway. Što je ispravna reakcija?',
              options: [
                <>
                  Obrisati commit i napraviti <code>git push --force</code>
                </>,
                'Rotirati ključ (novi kod izdavatelja, stari opozvati) i tajnu premjestiti u SealedSecret ili trezor', 'Repozitorij učiniti privatnim',
                'Uključiti šifriranje u mirovanju',
              ],
              correct: 1,
              explain: 'Vrijednost je već u klonovima i kopijama, pa je treba učiniti bezvrijednom: rotacija. Premještanje u SealedSecret ili trezor sprječava da se ponovi. Brisanje i privatni repozitorij ne dosežu postojeće klonove.',
            },
            {
              q: 'Kontroler Sealed Secrets upravo je dodao novi ključ za pečaćenje. Što se dogodilo s tajnama?',
              options: ['Sve su rotirane', 'Svi SealedSecreti u Gitu ponovno su šifrirani', 'Ništa: novi SealedSecreti šifrirat će se novim ključem, a stari se i dalje otključavaju starim', 'Stari SealedSecreti više se ne mogu otključati'],
              correct: 2,
              explain: 'Obnova samo dodaje novi ključ uz postojeće; stari ključevi ostaju da bi se stari SealedSecreti mogli otključati. Vrijednosti se ne mijenjaju, pa to nije rotacija.',
            },
            {
              q: (
                <>
                  ESO ima <code>refreshInterval: 30s</code>, a <code>klopa-worker</code> čita SMS ključ iz varijable okruženja. Ključ je rotiran u trezoru. Kada novi ključ vidi Pod <code>klopa-worker</code>?
                </>
              ),
              options: [
                'Za najviše 30 s',
                <>
                  Kad agent <code>kubelet</code> osvježi datoteke
                </>,
                <>
                  Tek nakon ponovnog pokretanja Poda, npr. <code>kubectl rollout restart</code>
                </>,
                'Nikad, ESO ne podržava rotaciju',
              ],
              correct: 2,
              explain: 'Secret se promijeni za najviše 30 s, ali varijabla okruženja upisuje se samo pri pokretanju kontejnera. Datoteka u volumenu bila bi osvježena sama.',
            },
            {
              q: 'Zašto Argo CD ne preporučuje argocd-vault-plugin?',
              options: ['Jer ne radi s Vaultom', 'Jer Argo CD tada mora čitati tajne, a čitljivi manifesti stoje u njegovoj predmemoriji', 'Jer je sporiji od ESO-a', 'Jer radi samo s Fluxom'],
              correct: 1,
              explain: 'Dodatak tajnu ubacuje pri generiranju manifesta, pa je Argo CD vidi i sprema u Redis. Preporuka je upravljati tajnama u odredišnom klasteru (Sealed Secrets, ESO, CSI driver).',
            },
            {
              q: 'Klopa koristi ESO i trezor, šifriranje u mirovanju s KMS v2 i RBAC s najmanjim ovlastima, a ključ je rotiran. Tko još može pročitati SMS ključ? (16. predavanje)',
              options: [
                'Nitko',
                <>
                  Svatko tko u Namespaceu <code>klopa</code> smije stvarati Podove
                </>,
                <>
                  Samo kradljivac kopije baze <code>etcd</code>
                </>,
                'Svatko s klonom Gita',
              ],
              correct: 1,
              explain: 'Iskrena granica iz 16. predavanja: novi Pod može montirati Secret i iznijeti vrijednost. Zato pravo stvaranja Podova u produkcijskom Namespaceu treba imati što manje ljudi i robota.',
            },
          ]}
        />
      </Section>

      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={['Novi klaster podiže se iz Gita s tajnama: u Gitu su samo adrese, vrijednosti su u trezoru.', 'Procurjeli SMS ključ je rotiran, a rotacija ide kroz trezor: bez commita i ne ovisi o jednoj osobi.', 'Tajnama pristupa više ljudi, a uključen zapis revizije u trezoru bilježi svako čitanje.']}
          paid={[
            'Trezor je nova ovisnost: novi klaster mu se mora jednom predstaviti, a dok trezor ne radi, rotacija stoji i novi klaster ne dobiva tajne.',
            'ESO je još jedan operator koji treba održavati i nadograđivati.',
            'Tko smije stvarati Podove, i dalje čita tajne.',
          ]}
          next="Svi su dijelovi na mjestu: slike, klaster, pipeline, Git i tajne. Petak je, 11:55, a popust za Ćevap-petak krivo se obračunava. Ispravak mora stići do korisnika prije 12:00."
        />
      </Section>
    </>
  )
}

import {
  Analogy,
  Callout,
  CodeBlock,
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
import { FlatStepper } from './sims/FlatStepper'
import { LifecycleStepper } from './sims/LifecycleStepper'
import { ProbesStepper } from './sims/ProbesStepper'
import { CascadeFigure } from './sims/CascadeFigure'
import { HealthLab } from './sims/HealthLab'
import { BarePodStepper } from './sims/BarePodStepper'
import { HelpersTimeline } from './sims/HelpersTimeline'
import { DIAG_LINES, WATCH_LINES, WORKER_LINES } from './lib/terminals'
import podBasicYaml from './code/pod-osnovni.yaml?raw'
import podYaml from './code/pod.yaml?raw'
import healthPy from './code/health.py?raw'
import sidecarYaml from './code/pod-sidecar.yaml?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section
        id="incident"
        kicker="priča"
        title="Running, a ništa ne radi"
        lead={
          <>
            Lana je ispravila tag slike i <code>klopa-api</code> napokon piše <code>Running</code>. Narudžbe i dalje ne prolaze.
          </>
        }
      >
        <IncidentCard
          no={12}
          when="ponedjeljak, 10:40"
          title={
            <>
              <code>klopa-api</code> se ruši čim se pokrene, a kubelet ga diže sve sporije
            </>
          }
          who="davor"
          says={['Running, a', 'ne radi?!']}
          preset="„Incident 12 (spori start)” (tri gola Poda, 20 zahtjeva/s), stanje nakon 150 s"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '20' },
            { label: 'uspješnih (150 s)', value: '0 %', tone: 'bad' },
            { label: 'RESTARTS po Podu', value: '3', tone: 'bad' },
            { label: 'zadnja pauza', value: '40 s', tone: 'warn' },
          ]}
        >
          Podovi naizmjence pišu <code>Running</code> <code>1/1</code> i <code>CrashLoopBackOff</code> <code>0/1</code>, a od 3057 zahtjeva nije prošao nijedan. Kontejneri se gase, a kubelet ih ponovno pokreće nakon 10, 20 pa
          40 sekundi. Usto, Pod <code>klopa-worker</code>, koji je Lana obrisala da bi se „ponovno pokrenuo”, nikad se nije vratio.
        </IncidentCard>
        <p>
          Na kraju prošlog predavanja Lana je ispravila tag slike i <code>klopa-api</code> se napokon pokrenuo. Davor gleda <code>kubectl get pods</code> u prvim sekundama nakon pokretanja: sva tri Poda pišu{' '}
          <code>Running</code> i <code>1/1</code>.
        </p>
        <Predict
          question="Sva tri Poda upravo pišu Running i 1/1. Prolaze li narudžbe?"
          options={['Da – Running i 1/1 znače da aplikacija radi.', 'Ne, jer proces još puni predmemoriju.', 'Ne, jer je slika kriva.']}
          correct={1}
          explain="Running znači samo da je proces pokrenut. Pod nema provjeru spremnosti, pa je 1/1 čim se kontejner pokrene – a aplikacija 40 s puni predmemoriju jelovnika i ne odgovara ni na što. Slika je ispravna: krivu bi STATUS pokazao kao ImagePullBackOff."
          then="Laboratorij u 5. odjeljku kreće upravo od ovog stanja."
        />
        <MarginNote>↻ = isti Pod, novi pokušaj</MarginNote>
        <p>
          Ni to nije sve. Davor je ranije postavio provjeru živosti koja nakon dvadesetak sekundi zaključi da je aplikacija mrtva, pa kubelet ugasi kontejner prije nego što se aplikacija stigne pokrenuti. Iz incidenta slijede tri pitanja: što je
          zapravo Pod, kako Kubernetes razlikuje „radi” od „spreman je” i zašto se obrisani <code>klopa-worker</code> nikad nije vratio.
        </p>
      </Section>

      {/* 2 · Pod = flat with roommates */}
      <Section id="stan" kicker="pod" title="Pod je stan s cimerima" lead="Kubernetes ne pokreće kontejnere izravno. Najmanja stvar kojom upravlja je Pod.">
        <p>
          <Term id="pod">Pod</Term> je jedan ili više <Term id="container">kontejnera</Term> koji uvijek idu zajedno: dijele IP adresu, mogu dijeliti <Term id="volume">volumene</Term>, nastaju zajedno na istom čvoru i nestaju
          zajedno. Kubelet ne dobiva naredbu „pokreni kontejner”, nego „pokreni ovaj Pod”. Prođimo kroz to korak po korak.
        </p>
        <FlatStepper />
        <Analogy
          title="Pod je stan s cimerima"
          breaksDown="Stan je dom za godine, a Pod je privremen. Kubernetes ga ne popravlja i ne seli: kad Pod nestane, nastaje novi, s novom adresom – kao da cimeri svaki put dobiju novi stan."
        >
          Cimeri dijele kućnu adresu, ulazna vrata i hladnjak. Jedan drugoga dozovu preko hodnika (<code>localhost</code>), a pošta za sve stiže na istu adresu. Kad se stan isprazni, odlaze svi.
        </Analogy>
        <Myth myth="Pod je kontejner.">
          Pod je omotač oko jednog ili više kontejnera koji dijele IP adresu i volumene. Najčešće je kontejner jedan, pa ih lako pobrkamo, ali kubelet uvijek pokreće Pod.
        </Myth>
        <p>
          Kako Kubernetes zna koji su Podovi „API”? Po <Term id="label">oznakama</Term> (engl. <em>labels</em>). Oznaka je par ključ=vrijednost koji sami zalijepimo na objekt, a naredba{' '}
          <code>kubectl get pods -l app=klopa-api</code> vraća samo Podove koji ga nose. Na isti način će u sljedećim predavanjima Podove pronalaziti i Deployment i Service.
        </p>
        <p>Ovako izgleda prvi pravi manifest Poda. Pročitajmo ga odozgo prema dolje: ime, oznake, kontejner, port i rezervacija.</p>
        <CodeBlock
          title="pod-osnovni.yaml"
          lang="yaml"
          code={podBasicYaml}
          previewLines={18}
          caption="Najjednostavniji Pod za klopa-api: jedan kontejner, oznake i port na kojem sluša gunicorn."
          notes={[
            { lines: '1-2', text: 'Pod je osnovni objekt: apiVersion v1' },
            { lines: '4-5', text: 'ime je jedinstveno unutar Namespacea klopa' },
            { lines: '6-8', text: 'oznake: po njima Pod pronalaze kubectl, Service…' },
            { lines: '11-12', text: 'jedan kontejner, slika s točnim tagom' },
            { lines: '13-14', text: 'gunicorn sluša na 8000 – na IP adresi Poda' },
            { lines: '15-18', text: 'requests: koliko Pod rezervira na čvoru' },
          ]}
        />
        <Callout kind="info" title="Što su requests?">
          <code>requests</code> (zajamčeni minimum) detaljno objašnjavamo u 17. predavanju. Zasad je dovoljno znati da je to koliko Pod rezervira na čvoru: raspoređivač po tome traži čvor na kojem ima mjesta.
        </Callout>
        <DeepDive title="Za znatiželjne: pomoćnici u Podu – init i sidecar">
          <p>
            Ponekad glavnom kontejneru treba pomoćnik. <Term id="init-container">Init kontejneri</Term> (engl. <em>init containers</em>) pokreću se jedan za drugim prije glavnih i moraju uspješno završiti, na primjer dok ne
            dočekaju bazu. Tek tada kreću glavni kontejneri.
          </p>
          <p>
            <Term id="sidecar-container">Nativni sidecar</Term> je init kontejner s <code>restartPolicy: Always</code>. Pokrene se prije glavnog kontejnera, radi cijelo vrijeme uz njega, smije imati vlastite provjere i gasi se
            tek nakon njega. Zato ne blokira završetak Joba, a pomoćnik za zapise uhvati i zadnje retke glavnog kontejnera.
          </p>
          <HelpersTimeline />
          <Callout kind="fact" title="Nativni sidecar (stanje: listopad 2026.)">
            Nativni sidecar kontejneri stabilni su (GA) od Kubernetesa 1.33. U starijim primjerima sidecar je samo drugi kontejner u popisu <code>containers</code>, pa nema zajamčen redoslijed pokretanja ni gašenja.
          </Callout>
          <CodeBlock title="pod-sidecar.yaml" lang="yaml" code={sidecarYaml} mode="closed" caption="Pod s init kontejnerom koji čeka bazu i nativnim sidecarom koji šalje zapise iz zajedničkog volumena." />
        </DeepDive>
      </Section>

      {/* 3 · lifecycle */}
      <Section id="zivotni-ciklus" kicker="koncept" title="Faza, STATUS i READY nisu isto" lead="„Running” u ispisu ne znači „radi”. Tri retka o Podu odgovaraju na tri različita pitanja.">
        <p>
          Kad pokrenemo <code>kubectl get pods</code>, vidimo stupce <code>READY</code>, <code>STATUS</code> i <code>RESTARTS</code>. Lako je pomisliti da je STATUS faza Poda. Nije. Faza (<code>status.phase</code>) je gruba
          kategorija s pet mogućih vrijednosti: <code>Pending</code>, <code>Running</code>, <code>Succeeded</code>, <code>Failed</code> i rijetko <code>Unknown</code>. STATUS je kratak razlog koji kubectl složi iz stanja
          kontejnera, a READY pokazuje uvjet <code>Ready</code>: smije li Pod primati promet.
        </p>
        <LifecycleStepper />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>STATUS</th>
                <th>faza</th>
                <th>što se događa</th>
                <th>što provjeriti</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="STATUS:">
                  <code>Pending</code>
                </td>
                <td data-label="faza:">Pending</td>
                <td data-label="događa se:">raspoređivač još nije našao čvor</td>
                <td data-label="provjerite:">
                  događaje u <code>kubectl describe pod</code>
                </td>
              </tr>
              <tr>
                <td data-label="STATUS:">
                  <code>ContainerCreating</code>
                </td>
                <td data-label="faza:">Pending</td>
                <td data-label="događa se:">kubelet preuzima sliku i stvara kontejner</td>
                <td data-label="provjerite:">obično ništa – pričekajte</td>
              </tr>
              <tr>
                <td data-label="STATUS:">
                  <code className={styles.bad}>ImagePullBackOff</code>
                </td>
                <td data-label="faza:">Pending</td>
                <td data-label="događa se:">slika se ne može preuzeti (prvo ErrImagePull); kubelet pokušava sa sve duljom pauzom</td>
                <td data-label="provjerite:">ime i tag slike, pristup registru</td>
              </tr>
              <tr>
                <td data-label="STATUS:">
                  <code>Running</code>
                </td>
                <td data-label="faza:">Running</td>
                <td data-label="događa se:">proces je pokrenut; je li spreman, kaže READY</td>
                <td data-label="provjerite:">
                  stupac <code>READY</code>
                </td>
              </tr>
              <tr>
                <td data-label="STATUS:">
                  <code className={styles.bad}>CrashLoopBackOff</code>
                </td>
                <td data-label="faza:">obično Running</td>
                <td data-label="događa se:">proces se ruši ili ga kubelet gasi; kubelet čeka pa ga ponovno pokreće</td>
                <td data-label="provjerite:">
                  <code>kubectl logs --previous</code> i događaje
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Pogledajmo to uživo. Naredba <code>kubectl get pods -w</code> ispisuje novi redak pri svakoj promjeni. Ovdje je verzija koja se ruši dvije sekunde nakon pokretanja (izlazi s kodom 1). Nakon nekoliko padova STATUS
          pokazuje <Term id="crashloopbackoff">CrashLoopBackOff</Term>: kubelet čeka sve dulje prije sljedećeg pokušaja.
        </p>
        <Terminal
          title="kubectl get pods -w"
          lines={WATCH_LINES}
          caption="Running → Error → CrashLoopBackOff: RESTARTS raste, a pauza prije svakog pokušaja se udvostručuje. READY je 1/1 čim se kontejner pokrene, jer Pod nema provjeru spremnosti."
        />
      </Section>

      {/* 4 · three probes + the cascade */}
      <Section id="tri-pitanja" kicker="koncept" title="Tri pitanja koja kubelet postavlja" lead="Kubelet ne zna ništa o jelovniku ni narudžbama. Zna samo pitati – a mi biramo pitanja.">
        <p>
          Bez ikakvih provjera kubelet vidi samo jedno: radi li proces. Srušeni proces sam ponovno pokrene. Ali proces može biti živ i beskoristan: zaglavio je, još puni predmemoriju ili je preopterećen. Zato kubelet
          aplikaciji postavlja pitanja – provjere (engl. <em>probes</em>). Ima ih tri: provjera <Term id="startup-probe">pokretanja</Term> (<code>startupProbe</code>), <Term id="liveness-probe">živosti</Term> (
          <code>livenessProbe</code>) i <Term id="readiness-probe">spremnosti</Term> (<code>readinessProbe</code>). Svaka ima drugu posljedicu.
        </p>
        <ProbesStepper />
        <Callout kind="info" title="Kako kubelet pita i koliko čeka">
          Provjera može biti HTTP zahtjev (<code>httpGet</code>: uspjeh je status 200–399), spajanje na port (<code>tcpSocket</code>), naredba u kontejneru (<code>exec</code>: uspjeh je izlazni kod 0) ili gRPC provjera
          (odgovor <code>SERVING</code>). Zadano: <code>periodSeconds: 10</code>, <code>timeoutSeconds: 1</code>, <code>failureThreshold: 3</code>, <code>successThreshold: 1</code>, <code>initialDelaySeconds: 0</code>.
          Zaglavljeni proces kubelet tako primijeti nakon otprilike 3 × 10 s = 30 s.
        </Callout>
        <p>
          Sada je jasan i prvi dio incidenta. Provjera živosti pitala je <code>/healthz</code> svakih 10 s, a aplikacija 40 s ne odgovara ni na što. Nakon treće neuspjele provjere, oko dvadesete sekunde, kubelet ju je ugasio
          – prije nego što se stigla pokrenuti. Aplikacija nije bila pokvarena; pitanje je postavljeno prerano.
        </p>
        <Predict
          question="Baza padne na 60 sekundi. Provjera živosti sva tri Poda pita /ready-db, koji provjerava i bazu. Što će se dogoditi?"
          options={['Ništa – Podovi samo pričekaju da se baza vrati.', 'Sva tri Poda restartaju se gotovo istodobno, i to više puta.', 'Restarta se samo jedan Pod, a druga dva preuzmu promet.', 'Podovi izađu iz prometa, ali se ne restartaju.']}
          correct={1}
          explain="Svi Podovi pitaju istu bazu, pa svi u isto vrijeme dobiju isti loš odgovor. Nakon 3 × 10 s kubelet ugasi sva tri kontejnera. Restart ne popravlja bazu, pa provjere padaju opet, a pauze rastu. Pogledajmo to na pravom modelu."
        />
        <p>
          Klopa ima jednu bazu za sve Podove. Kad ona padne, svaki Pod koji je pita dobiva isti odgovor u isto vrijeme. Promet pritom ne ide ravno u Podove, nego preko popisa spremnih Podova. U Kubernetesu taj popis drži{' '}
          <Term id="service">Service</Term> (na crtežu etiketa <code>klopa-api</code>; detaljno u 14. predavanju), a njegove stavke, adrese spremnih Podova, zovu se endpointi (engl. <em>endpoints</em>). To nisu HTTP putanje
          poput <code>/ready</code>. Kad je popis prazan, klijent dobiva odbijenu vezu.
        </p>
        <p>
          Odvrtimo isti ispad od 60 s s tri para provjera. Brojke dolaze iz istog modela kao laboratorij u sljedećem odjeljku (seed 42, 20 zahtjeva/s).
        </p>
        <CascadeFigure />
        <MarginNote tone="red">503 kaže zašto, odbijena veza samo „nema nikoga”</MarginNote>
        <Callout kind="warn" title="Tri pravila za provjere">
          <ul>
            <li>
              <strong>Provjera živosti pita samo o procesu</strong>: odgovara li uopće? Bez baze, Redisa, reda poruka i SMS-gatewaya.
            </li>
            <li>
              <strong>Provjera spremnosti pita o ovom Podu</strong>: je li zagrijan, je li preopterećen. Ne smije pasti zbog ovisnosti koju dijele svi Podovi, jer tada svi istodobno nestanu iz prometa.
            </li>
            <li>
              <strong>Kad zajednička baza ne radi, Pod ostaje Ready</strong> i brzo odgovara <code>503</code> (ili djelomično, npr. jelovnikom iz predmemorije). Klijent dobiva jasan odgovor umjesto odbijene veze.
            </li>
          </ul>
        </Callout>
      </Section>

      {/* 5 · flagship */}
      <Section id="laboratorij" kicker="simulacija" title="Laboratorij zdravlja Poda" lead="Sada vi postavljate pitanja: tri gola Poda, promet koji ide samo spremnima i četiri zadatka.">
        <p>
          Simulacija kreće od incidenta s početka: spori start od 40 s i provjera živosti bez provjere pokretanja. Pokrenite je i promatrajte trake provjera, brojač restarta i prsten pauze. Zatim u kontrolama mijenjajte{' '}
          <code>pod.yaml</code> i primijenite ga. Pod koji želite pokvariti odaberite klikom na crtež.
        </p>
        <MarginNote>ubrzajte na 4× ili 8×</MarginNote>
        <p>Provjere i pauze imaju stvarne zadane vrijednosti, pa stvari traju kao u pravom klasteru. Brzinu možete povećati gumbima u zaglavlju simulacije.</p>
        <HealthLab />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Provjera živosti bez provjere pokretanja gasi spori start prije nego što se pokrene. Rezultat je CrashLoopBackOff, iako aplikacija nije pokvarena.</li>
            <li>Bez provjere spremnosti Pod je Ready čim se kontejner pokrene, pa promet ide u Pod koji još ne odgovara.</li>
            <li>Zaglavljeni proces vraća samo provjera živosti; provjera spremnosti ga samo makne iz prometa.</li>
            <li>Pitanje o bazi u bilo kojoj provjeri pretvara ispad baze u ispad cijele Klope.</li>
          </ul>
        </Callout>
        <KeyIdea>
          Mrtav proces kubelet ponovno pokreće sam. Zaglavljeni treba pitati – a <strong>krivo pitanje pretvara sitnicu u ispad</strong>. Podovi se <strong>zamjenjuju, a ne popravljaju</strong>, pa ih netko mora ponovno
          stvoriti.
        </KeyIdea>
      </Section>

      {/* 6 · bare Pod */}
      <Section id="goli-pod" kicker="koncept" title="Goli Pod: nitko ga ne vraća" lead="Restart kontejnera je popravak na mjestu. Sve ostalo je zamjena – a zamjenu netko mora napraviti.">
        <p>
          Ostalo je treće pitanje iz incidenta. Lana je obrisala <code>klopa-worker</code> jer je očekivala da će se „sam ponovno pokrenuti”. Ponovno pokretanje postoji, ali samo za kontejner unutar Poda koji i dalje postoji.
          Sam Pod nitko ne čuva.
        </p>
        <BarePodStepper />
        <Terminal title="Lanin terminal" lines={WORKER_LINES} caption="Novi klopa-worker ima isto ime jer ga je Lana napisala u YAML-u. Novi su UID, IP adresa i brojač restarta, a raspoređivač ga je ovaj put smjestio i na drugi čvor." />
        <p>
          Zato vrijedi pravilo: <strong>Pod se zamjenjuje, a ne popravlja</strong> – Pod je potrošan. Većina polja postojećeg Poda ne može se ni promijeniti: <code>kubectl apply</code> s novim provjerama javlja grešku{' '}
          <code>Forbidden</code>. Zato ga zamijenimo: <code>kubectl delete pod klopa-api-1</code> pa <code>kubectl apply -f pod.yaml</code> (ili jednom naredbom <code>kubectl replace --force -f pod.yaml</code>). Upravo to
          radi gumb „Primijeni pod.yaml” u laboratoriju.
        </p>
      </Section>

      {/* 7 · code */}
      <Section id="kod" kicker="kod" title="pod.yaml, /healthz i /ready" lead="Ono što ste mijenjali u simulaciji ovdje je napisano: tri provjere u manifestu i dvije putanje u aplikaciji.">
        <p>Manifest iz drugog odjeljka dobiva tri provjere. Usporedite vrijednosti s onima koje su u laboratoriju riješile incident.</p>
        <CodeBlock
          title="pod.yaml"
          lang="yaml"
          code={podYaml}
          previewLines={20}
          highlight="28,35"
          caption="Pod klopa-api s provjerama pokretanja, živosti i spremnosti."
          notes={[
            { lines: '10', text: 'zadano za Pod: srušeni kontejner ide ispočetka' },
            { lines: '20-25', text: 'do 6 × 10 s = 60 s za spori start (treba 40 s)' },
            { lines: '26-30', text: 'živost: samo proces, kreće tek nakon pokretanja' },
            { lines: '31', text: 'sinkroni radnici: i /healthz čeka slobodnog radnika' },
            { lines: '33-38', text: 'spremnost: zagrijan? bez baze!' },
          ]}
        />
        <CodeBlock
          title="klopa/health.py"
          lang="python"
          code={healthPy}
          caption="Dvije putanje u Djangu i prava narudžba koja na ispad baze brzo odgovara 503."
          notes={[
            { lines: '16-18', text: '/healthz: živ sam – i ništa više' },
            { lines: '21-27', text: '/ready: stanje OVOG Poda, bez baze' },
            { lines: '32-33', text: 'bez connect_timeout „brzi” 503 nije brz' },
            { lines: '34-41', text: 'baza ne radi → brzi 503, Pod ostaje Ready' },
          ]}
        />
        <p>
          Kad Pod ipak zapne, tri naredbe kažu gotovo sve. <code>kubectl get pods -w</code> pokazuje kako se STATUS mijenja, <code>kubectl describe pod</code> daje uvjete i događaje, a <code>kubectl logs --previous</code>{' '}
          ispisuje zapise kontejnera <em>prije</em> zadnjeg restarta. Čim se kontejner ponovno pokrene, <code>kubectl logs</code> bez <code>--previous</code> pokazuje samo novi kontejner, koji još nije stigao ništa napisati
          – zato tražimo <code>--previous</code>. Ovo je incident s početka predavanja:
        </p>
        <Terminal title="Davorova dijagnoza" lines={DIAG_LINES} />
        <Callout kind="tip" title="Davorov dežurni priručnik – nove stranice">
          <ul>
            <li>
              <strong>STATUS ImagePullBackOff</strong> → slika ne postoji ili nema pristupa → <code>kubectl describe pod</code>, provjerite ime i tag.
            </li>
            <li>
              <strong>CrashLoopBackOff, Exit Code 1</strong> → aplikacija se ruši sama → <code>kubectl logs --previous</code>.
            </li>
            <li>
              <strong>CrashLoopBackOff, Exit Code 143 i „Liveness probe failed”</strong> → ugasio ju je kubelet → je li provjera živosti prestroga ili joj treba provjera pokretanja?
            </li>
            <li>
              <strong>Running, READY 0/1</strong> → provjera pokretanja još nije prošla ili provjera spremnosti pada → <code>kubectl describe pod</code>, retci „Startup/Readiness probe failed”.
            </li>
          </ul>
        </Callout>
      </Section>

      {/* 8 · myths */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            { statement: 'Restart kontejnera zadržava ime i IP adresu Poda.', fact: true, explain: 'Istina. Kubelet ponovno pokreće kontejner u istom Podu: ime, IP adresa i UID ostaju, a RESTARTS se poveća za 1. Novu adresu dobiva tek novi Pod.' },
            { statement: 'Web i bazu stavimo u isti Pod, tako su blizu.', fact: false, explain: 'Pod se skalira i zamjenjuje kao cjelina: tri replike značile bi tri baze, a svaka zamjena Poda novu, praznu bazu. Jedan glavni posao po Podu.' },
            { statement: 'STATUS u ispisu kubectl get pods je faza Poda.', fact: false, explain: 'STATUS je razlog (ImagePullBackOff, CrashLoopBackOff…), a faza je gruba: kod ImagePullBackOff je Pending, kod CrashLoopBackOff obično Running.' },
            {
              statement: 'Pod se popravi na mjestu i zadrži IP adresu.',
              fact: false,
              explain: 'Samo napola: srušeni kontejner kubelet ponovno pokreće u istom Podu, s istom IP adresom. Obrisan Pod ili Pod s nestalog čvora ne vraća se: može ga zamijeniti samo novi Pod s novom IP adresom – a goli Pod nitko sam ne zamjenjuje.',
            },
            { statement: 'Bez provjera Kubernetes zna kad je aplikacija spremna.', fact: false, explain: 'Bez provjere spremnosti Pod je Ready čim se kontejner pokrene, pa promet stiže i dok se aplikacija još zagrijava.' },
          ]}
        />
      </Section>

      {/* 9 · recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            <>
              Pod je jedan ili više kontejnera s jednom IP adresom i zajedničkim volumenima; po <strong>oznakama</strong> (<code>app=klopa-api</code>) ga pronalazimo.
            </>,
            <>
              <strong>Faza</strong> (Pending, Running…), <strong>STATUS</strong> (razlog: ImagePullBackOff, CrashLoopBackOff) i <strong>READY</strong> (uvjet Ready) tri su različita retka.
            </>,
            <>Srušeni kontejner kubelet ponovno pokreće u istom Podu, s pauzom koja raste od 10 s do 300 s.</>,
            <>
              <strong>Pokretanje</strong> čuva spori start, <strong>živost</strong> otkriva zaglavljeni proces (restart), a <strong>spremnost</strong> pušta promet samo spremnima (bez restarta).
            </>,
            <>Nijedna provjera ne pita zajedničku bazu. Obrisan ili izgubljen goli Pod nitko ne vraća.</>,
          ]}
        />
        <StoryMap at="12" caption="Klopa nakon 12. predavanja: klopa-api i klopa-worker žive u Podovima – zasad golima." />
        <Quiz
          id="l12"
          questions={[
            {
              q: 'kubectl get pods pokazuje: klopa-api-1   0/1   ImagePullBackOff   0   2m. Koja je faza Poda i što prvo provjeriti?',
              options: ['Running; zapise s kubectl logs --previous', 'Pending; ime i tag slike', 'Failed; provjeru živosti', 'Pending; ima li čvor dovoljno memorije'],
              correct: 1,
              explain: 'Kod ImagePullBackOff kontejner nije ni nastao, pa je faza i dalje Pending, a zapisa nema. Kubelet ne može preuzeti sliku – najčešće zbog krivog imena ili taga, ponekad zbog pristupa registru.',
            },
            {
              q: 'Provjera spremnosti Poda padne tri puta zaredom. Što kubelet napravi?',
              options: ['Ponovno pokrene kontejner.', 'Obriše Pod i stvori novi.', 'Pod izlazi iz prometa, a kontejner radi dalje.', 'Ništa, dok ne padne i provjera živosti.'],
              correct: 2,
              explain: 'Neuspjela provjera spremnosti postavlja uvjet Ready na False: Pod više ne dobiva promet, ali se ne restarta. Čim provjera opet prođe, vraća se u promet.',
            },
            {
              q: 'klopa-api se pokreće 40 s. Kako spriječiti da ga provjera živosti ugasi prije nego što se pokrene?',
              options: ['Ukloniti provjeru živosti.', 'Dodati provjeru pokretanja s dovoljno velikim failureThreshold.', 'Postaviti timeoutSeconds na 40.', 'Dodati provjeru spremnosti.'],
              correct: 1,
              explain: 'Dok provjera pokretanja ne uspije, provjera živosti ne radi. S periodSeconds 10 i failureThreshold 6 aplikacija ima do 60 s. Bez provjere živosti zaglavljeni proces više nitko ne bi vratio.',
            },
            {
              q: 'Baza je pala na minutu. Koja kombinacija drži Klopu najzdravijom?',
              options: [
                'Živost pita /ready-db, spremnost /ready.',
                'Živost pita /healthz, spremnost /ready-db.',
                'Živost pita /healthz, spremnost /ready, a narudžbe brzo vraćaju 503.',
                'Bez ikakvih provjera.',
              ],
              correct: 2,
              explain: 'Prva kombinacija restarta sve Podove, druga ih sve izbaci iz prometa (Service bez endpointa, odbijene veze). Treća ne restarta nikoga: klijenti dobiju brzi 503, a kad se baza vrati, sve odmah radi.',
            },
            {
              q: 'Kontejner u Podu klopa-api-2 srušio se i kubelet ga je ponovno pokrenuo. Zatim je Lana obrisala goli Pod klopa-worker. Što vrijedi?',
              options: [
                'klopa-api-2 zadržava ime i IP adresu; klopa-worker je nestao i nitko ga ne vraća.',
                'Oba Poda vrate se s novim IP adresama.',
                'klopa-api-2 dobiva novu IP adresu; klopa-worker se vrati za 5 minuta.',
                'Oba zadržavaju ime i IP adresu.',
              ],
              correct: 0,
              explain: 'Restart kontejnera događa se u istom Podu: isto ime, ista IP adresa, RESTARTS +1. Obrisan goli Pod nema vlasnika, pa ga nijedan kontroler ne stvara ponovno.',
            },
            {
              q: 'U 5. predavanju load balancer je provjerom ispravnosti izbacivao srušeni poslužitelj iz prometa. Kojoj provjeri u Kubernetesu to najviše odgovara?',
              options: ['Provjeri živosti', 'Provjeri spremnosti', 'Provjeri pokretanja', 'Postavci restartPolicy: Always'],
              correct: 1,
              explain: 'Load balancer poslužitelj samo makne iz prometa i vrati ga kad provjera opet prođe – baš kao provjera spremnosti. Load balancer poslužitelj nikad nije ponovno pokretao; to u Kubernetesu radi provjera živosti.',
            },
          ]}
        />
      </Section>

      {/* 10 · cost */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={['Spori start više ne završava u stanju CrashLoopBackOff: provjera pokretanja daje mu do 60 s.', 'Promet ide samo Podovima koji su stvarno spremni.', 'Ispad baze daje brzi 503, bez restarta i bez odbijenih veza.']}
          paid={['Tri gola Poda: nitko ih ne vraća kad ih obrišemo ili kad nestane čvor.', 'Nova verzija znači ručno zamijeniti svaki Pod – usred ručka.', 'Provjere su novi kod koji treba pisati, testirati i održavati.']}
          next="Noćas je čvor node-2 bio nedostupan dulje od pet minuta. Kubernetes je Podove s njega izbacio, a goli Pod s API-jem nitko nije ponovno stvorio. A Petra javlja: „Vegetarijanski meni mora biti vani danas u 11:00 – bez gašenja stranice.”"
        />
      </Section>
    </>
  )
}

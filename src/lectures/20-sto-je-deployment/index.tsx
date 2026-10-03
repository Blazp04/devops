import {
  Analogy,
  Callout,
  CodeBlock,
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
} from '../../kit'
import { FourWords } from './sims/FourWords'
import { PromotionStepper } from './sims/PromotionStepper'
import { StrategyRace } from './sims/StrategyRace'
import { SelectorFlip } from './sims/SelectorFlip'
import { CanaryLab } from './sims/CanaryLab'
import { SchemaStepper } from './sims/SchemaStepper'
import { SchemaLab } from './sims/SchemaLab'
import { FlagStepper } from './sims/FlagStepper'
import rollingYaml from './code/rolling.yaml?raw'
import recreateYaml from './code/recreate.yaml?raw'
import blueGreenYaml from './code/blue-green.yaml?raw'
import blueGreenSh from './code/blue-green-switch.sh?raw'
import httprouteYaml from './code/httproute-canary.yaml?raw'
import baseKustomization from './code/base-kustomization.yaml?raw'
import prodKustomization from './code/prod-kustomization.yaml?raw'
import kustomizeSh from './code/kustomize.sh?raw'
import helmSh from './code/helm.sh?raw'
import rolloutYaml from './code/rollout-canary.yaml?raw'
import expandSql from './code/expand-contract.sql?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      <Section id="incident" kicker="priča" title="Petak, 11:30: nova košarica" lead="Nova verzija stigla je na sve Podove u manje od minute – zajedno sa svojom greškom.">
        <IncidentCard
          no={20}
          when="petak, 11:30"
          title="Nova košarica krivo računa PDV na svakoj petoj narudžbi"
          who="davor"
          says={['Svaka peta', 'narudžba?!']}
          preset="zadane postavke simulacije „Četiri strategije, isti bug” (traka Postupno ažuriranje, sat „od početka uvođenja 1:00”)"
          seed={42}
          metrics={[
            { label: 'Podova s 2.0.0', value: '4/4 za 23 s (sim)', tone: 'warn' },
            { label: 'krivi PDV (narudžbe 2.0.0)', value: '20,3 %', tone: 'bad' },
            { label: 'studenata s krivim računom', value: '160', tone: 'bad' },
          ]}
        >
          Lana je napisala novu košaricu, a Davor je u 11:30 sa svog laptopa promijenio sliku u <code>klopa-api:2.0.0</code>. Postupno ažuriranje krenulo je kao u 13. predavanju: nova je verzija brzo bila na sva četiri Poda, a u prvoj minuti krivi račun dobilo je 160 studenata. Usto je migracija baze preimenovala stupac <code>cijena</code>, pa su stari Podovi, dok su još radili, na svaku narudžbu vraćali grešku 500.
        </IncidentCard>
        <p>
          Davor je vratio <code>1.4.1</code> naredbom <code>kubectl rollout undo</code> – i Klopa je potpuno pala, jer <code>1.4.1</code> traži stupac <code>cijena</code>, kojeg više nema. Tek kad je Lana ručno vratila staro ime stupca, narudžbe su opet prolazile. Petra želi znati zašto je nova verzija odmah stigla do svih studenata, a ne samo do nekolicine. Lana se pita kako je jedna promjena u bazi dvaput srušila staru verziju, koju nitko nije dirao.
        </p>
        <p>
          Infrastruktura je stabilna: Podovi se obnavljaju, skaliraju i čuvaju podatke. Najveći rizik sada su naše vlastite promjene. Zato je pitanje ovog predavanja: <Mark c="yellow">što zapravo znači „postaviti novu verziju” i kako to napraviti tako da greška pogodi što manje ljudi?</Mark>
        </p>
      </Section>

      <Section id="cetiri-rijeci" kicker="koncept" title="Četiri riječi za jedan petak" lead="U petak su se u istoj minuti dogodile četiri različite stvari. Zato ih je tako lako pomiješati.">
        <MarginNote tone="red">deploy ≠ Deployment!</MarginNote>
        <p>
          U hodniku se sve to zove „deploy”. Za razgovor o riziku trebaju nam četiri odvojene riječi: <Term id="deploy">postavljanje</Term>, <Term id="release">izdanje (engl. release)</Term>, uvođenje (engl. rollout) i objekt <Term id="deployment">Deployment</Term>.
        </p>
        <FourWords />
        <p>
          U petak su postavljanje, uvođenje i izdanje bili jedan te isti trenutak: čim je Pod s 2.0.0 postao spreman, studenti su dobili novu košaricu. Ostatak predavanja ih razdvaja. Strategija uvođenja odlučuje <em>koliko</em> studenata vidi novu verziju, a zastavice značajki odvajaju izdanje od postavljanja.
        </p>
      </Section>

      <Section id="okruzenja" kicker="koncept" title="Okruženja i promocija" lead="Prije produkcije nova verzija prolazi probna okruženja – i to uvijek kao isti artefakt.">
        <p>
          Klopa sada ima tri <Term id="environment">okruženja</Term>: dev (klaster <code>kind</code> na Laninom laptopu), staging (Namespace <code>klopa-staging</code>) i produkciju (Namespace <code>klopa</code>). Ovako bi prijelaz iz jednog u drugo trebao izgledati: slika se gradi jednom, a zatim se ista slika, prepoznata po <Term id="digest">digestu</Term>, seli iz okruženja u okruženje. To se zove <Term id="promotion">promocija</Term>.
        </p>
        <PromotionStepper />
        <Callout kind="warn" title="Staging je prošao ≠ produkcija radi">
          U stagingu je 2.0.0 prošla sve provjere. Ali staging ima 2000 probnih narudžbi, tri zahtjeva u sekundi i SMS u probnom načinu. Greška s PDV-om pojavljuje se samo na dijelu narudžbi, a takvih u probnim podatcima nije bilo. Podatci, opterećenje i konfiguracija uvijek se razlikuju, pa i nakon staginga treba oprezno uvođenje u produkciji.
        </Callout>
        <p>
          Kako isti manifesti postaju tri malo različita? Alat <Term id="kustomize">Kustomize</Term>, ugrađen u <code>kubectl</code>, uzme zajedničku osnovu (<code>base/</code>) i tanki sloj za svako okruženje (<code>overlays/prod</code>) te izradi običan YAML. Nema predložaka ni varijabli: sloj samo kaže što je drukčije, kao gornji slojevi slike u 8. predavanju.
        </p>
        <Tabs
          tabs={[
            { label: 'base/', content: <CodeBlock title="base/kustomization.yaml" lang="yaml" code={baseKustomization} mode="open" /> },
            {
              label: 'overlays/prod',
              content: (
                <CodeBlock
                  title="overlays/prod/kustomization.yaml"
                  lang="yaml"
                  code={prodKustomization}
                  mode="open"
                  highlight="9-12"
                  notes={[
                    { lines: '6-8', text: 'samo ono što je drukčije: 4 replike' },
                    { lines: '11-12', text: 'isti digest koji je prošao staging' },
                  ]}
                />
              ),
            },
            { label: 'kubectl kustomize', content: <CodeBlock title="naredbe" lang="bash" code={kustomizeSh} mode="open" notes={[{ lines: '4', text: 'razlike su samo retci iz slojeva' }]} /> },
            { label: 'Helm', content: <CodeBlock title="Helm u jednom retku" lang="bash" code={helmSh} mode="open" /> },
          ]}
        />
        <Callout kind="info">
          <Term id="helm">Helm</Term> = paketi predložaka s vrijednostima (chart); Argo CD ga renderira u običan YAML (22. predavanje).
        </Callout>
        <DeepDive title="Što je Helm?">
          <Myth myth="Kubernetes treba Helm.">
            API server prima obične objekte. Kustomize ih samo izradi (šalje ih <code>kubectl apply -k</code>), a Helm ih izradi na vašem računalu i sam pošalje API serveru. Povijest svojih instalacija (Helm ih zove <em>release</em>) čuva kao Secrete u Namespaceu.
          </Myth>
          <Callout kind="fact" title="Helm (stanje: listopad 2026.)">
            Helm 4.0.0 izašao je 12. studenoga 2025., prva velika verzija nakon šest godina, i može primjenjivati manifeste na strani poslužitelja (server-side apply). Trenutačno je aktualan Helm 4.3.0, a Helm 3.22 još dobiva izdanja.
          </Callout>
        </DeepDive>
      </Section>

      <Section id="simulacija" kicker="simulacija" title="Četiri strategije, isti bug" lead="Ista greška, isti studenti, isti seed – mijenja se samo način uvođenja.">
        <p>
          Pokrenimo petak četiri puta odjednom. Svaka traka uvodi istu 2.0.0 s istom greškom u PDV-u, a do nje stiže isti niz narudžbi od 1000 studenata. <strong>Recreate</strong> najprije ugasi sve stare Podove. <strong>Postupno ažuriranje</strong> mijenja ih jedan po jedan (13. predavanje). <Term id="blue-green-deployment">Plavo-zeleno</Term> pokrene četiri nova Poda uz stare pa prebaci promet. <Term id="canary-release">Canary</Term> novu verziju najprije pošalje malom dijelu studenata, a analiza prati udio krivih računa.
        </p>
        <p>
          Canary se može složiti na dva načina: <strong>po replikama</strong> (canary Pod stoji iza istog Servicea, pa dobiva dio veza) ili <strong>po težinama</strong> HTTPRoutea iz 15. predavanja (svaki zahtjev zasebno ide na canary s odabranom vjerojatnošću). Canary napreduje u koracima, a analiza ga prekida kad udio krivih računa prijeđe prag. Analiza u simulaciji mjeri poslovnu metriku: udio narudžbi 2.0.0 čiji se PDV ne slaže s kontrolnim izračunom. Gumb „Sakrij grešku od analize” pokazuje što se događa kad analiza broji samo HTTP greške: krivi PDV vraća <code>200 OK</code>, analiza ga ne vidi, pa grešku morate uočiti vi.
        </p>
        <Predict
          question="Canary počinje korakom „5 %”: uz četiri stabilna Poda doda se jedan canary Pod iza istog Servicea. Koliki će udio novih veza dobiti 2.0.0?"
          options={['točno 5 %', 'oko 20 %, uz rasipanje', '25 %', '50 %']}
          correct={1}
          explain="Service ne zna za postotke: kube-proxy za svaku novu vezu nasumično odabere jedan od pet spremnih Podova. Jedan od pet je oko 20 % (k/(N+k) = 1/5), a stvarni udio skače oko toga. S četiri stabilna Poda manji korak ne postoji – za pravih 5 % treba usmjeravanje po težinama."
          then="Provjerite u traci Canary: oznaka kaže „traženo 5 % → stvarno ~20 %”."
        />
        <StrategyRace />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <strong>Recreate</strong>: 12 sekundi nijedna narudžba ne prolazi (208 studenata ostane bez odgovora), a zatim krivi PDV stiže svima. U prvoj minuti krivi račun dobije 154 studenta, a neku grešku ukupno 323 studenta.
            </li>
            <li>
              <strong>Postupno ažuriranje</strong>: bez prekida, ali za 23 s bug je na svim Podovima; 12 s rade obje verzije. Povratak naredbom <code>rollout undo</code> opet je postupan i traje oko 17 s.
            </li>
            <li>
              <strong>Plavo-zeleno</strong>: 11 s nakon početka promet se prebaci odjednom, uz 168 dodatnih Pod-sekundi. Povratak je promjena selektora: gotov za 2–3 s, dok <code>blue</code> još radi.
            </li>
            <li>
              <strong>Canary</strong>: po replikama „5 %” je oko 20 % veza i analiza staje tek kad je krivi račun dobio 21 student; po težinama udio je zaista oko 5 %, pa krivi račun dobije samo 7 studenata.
            </li>
          </ul>
        </Callout>
        <KeyIdea>
          Strategija ne popravlja bug – ona odlučuje <strong>koliko studenata</strong> ga vidi i <strong>koliko to košta</strong>.
        </KeyIdea>
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Usporedba strategija po riziku, trošku i brzini">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Strategija</th>
                <th scope="col">Tko vidi grešku</th>
                <th scope="col">Trošak</th>
                <th scope="col">Brzina</th>
                <th scope="col">Povratak</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Recreate</td>
                <td>svi, nakon prekida</td>
                <td>bez dodatnih Podova</td>
                <td>brzo, ali s prekidom</td>
                <td>novo uvođenje, opet s prekidom</td>
              </tr>
              <tr>
                <td>Postupno</td>
                <td>svi, postupno</td>
                <td>+1 Pod (maxSurge)</td>
                <td>desetci sekundi</td>
                <td>
                  <code>rollout undo</code>, opet postupno
                </td>
              </tr>
              <tr>
                <td>Plavo-zeleno</td>
                <td>svi odjednom (nove veze)</td>
                <td>dvostruko Podova dok traje prijelaz</td>
                <td>prebacivanje u trenu</td>
                <td>
                  selektor natrag dok <code>blue</code> radi
                </td>
              </tr>
              <tr>
                <td>Canary</td>
                <td>mali udio studenata</td>
                <td>dva Deploymenta, metrike i alat</td>
                <td>najsporije: koraci</td>
                <td>automatski: težina 0 ili canary na 0</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Od četiri trake samo su prve dvije ugrađene u Deployment, i to kao jedan blok <code>strategy</code>:</p>
        <Tabs
          tabs={[
            {
              label: 'RollingUpdate',
              content: <CodeBlock title="deployment.yaml" lang="yaml" code={rollingYaml} caption="Ovo je petkova datoteka: samo je slika promijenjena u 2.0.0." highlight="14-18" notes={[{ lines: '26', text: 'Davor je promijenio samo ovaj redak' }]} />,
            },
            { label: 'Recreate', content: <CodeBlock title="deployment.yaml (dio)" lang="yaml" code={recreateYaml} mode="open" /> },
          ]}
        />
      </Section>

      <Section id="plavo-zeleno" kicker="koncept" title="Plavo-zeleno: jedan prekidač" lead="Deployment zna samo dvije ugrađene strategije. Za ostale treba usmjerivač prometa – i obično alat koji njime upravlja umjesto vas.">
        <p>
          Plavo-zeleno i canary sastavljaju se od običnih objekata: dva Deploymenta (stari i novi) i nešto što bira kamo ide promet. To je ili selektor Servicea (14. predavanje) ili težine u HTTPRouteu (<Term id="gateway-api">Gateway API</Term>, 15. predavanje).
        </p>
        <Analogy title="Dva jednaka postava i jedan prekidač" who="mira" breaksDown="Dvije kuhinje znače dvostruki trošak. Studenti koji već sjede u plavoj dvorani ostaju tamo dok ne pojedu – postojeće veze ne prelaze odmah. A ostava (baza) je zajednička, pa shema mora odgovarati objema verzijama.">
          Menza ima dvije jednake kuhinje. U plavoj se kuha danas, u zelenoj se priprema novi jelovnik. Kad je zelena spremna, redar na ulazu počne slati studente u nju; ako nešto ne valja, vraća ih u plavu.
        </Analogy>
        <SelectorFlip />
        <Callout
          kind="info"
          title={
            <>
              Zašto <code>blue</code> ostaje pokrenut
            </>
          }
        >
          Promjena selektora vrijedi samo za <em>nove</em> veze. Veze koje su već otvorene (HTTP keep-alive, HTTP/2) kube-proxy i dalje vodi na isti Pod, kao u 14. predavanju, sve dok se ne zatvore. To vrijedi za promet kroz ClusterIP Servicea (npr. <code>klopa-web</code> → <code>klopa-api</code>). Gateway iz 15. predavanja bira Pod za svaki zahtjev, pa se vanjski promet prebaci gotovo odmah. Zato se <code>blue</code> ne gasi odmah: Argo Rollouts ga nakon prebacivanja zadano drži još 30 sekundi (<code>scaleDownDelaySeconds</code>), a za to vrijeme povratak je samo promjena selektora.
        </Callout>
        <Tabs
          tabs={[
            { label: 'Dva Deploymenta i Service', content: <CodeBlock title="blue-green.yaml" lang="yaml" code={blueGreenYaml} highlight="52" notes={[{ lines: '52', text: 'prekidač: blue → green' }]} /> },
            { label: 'Prebacivanje', content: <CodeBlock title="prebacivanje.sh" lang="bash" code={blueGreenSh} mode="open" /> },
          ]}
        />
      </Section>

      <Section id="canary" kicker="koncept" title="Canary: najprije mali udio" lead="Novu verziju najprije vidi mali udio studenata. Koliko mali, ovisi o tome čime dijelite promet.">
        <Analogy title="Kanarinac u rudniku" who="davor" breaksDown="Studenti nisu potrošni kao kanarinac. Biramo što manji udio i uvođenje zaustavljamo automatski čim metrika prijeđe prag – ne kad netko primijeti.">
          Rudari su u rudnik nosili kanarinca: ako je zrak otrovan, ptica to osjeti prije ljudi. Canary izdanje novu verziju najprije pošalje malom dijelu studenata. Ako ima grešku, vidi je samo taj mali dio.
        </Analogy>
        <p>
          Pogledajmo oba načina izbliza. <strong>Po replikama</strong>: stabilni i canary Podovi stoje iza istog Servicea, pa kube-proxy svaku novu vezu daje nasumičnom Podu. Uz N stabilnih i k canary Podova udio je k/(N+k): u grubim koracima i s rasipanjem. <strong>Po težinama</strong>: Gateway prema težinama iz HTTPRoutea svaki zahtjev zasebno pošalje na canary s vjerojatnošću težina/zbroj težina, neovisno o broju Podova.
        </p>
        <CanaryLab />
        <CodeBlock title="httproute-canary.yaml" lang="yaml" code={httprouteYaml} highlight="22-28" notes={[{ lines: '28', text: '5 od 100 zahtjeva, koliko god Podova bilo' }]} />
        <p>
          Sve ovo može se raditi ručno: povećati canary Deployment, promijeniti težine, gledati grafove, vratiti. Ali čovjek je spor i ne gleda grafove u 11:31. Alati <Term id="argo-rollouts">Argo Rollouts</Term> i Flagger vode cijelo uvođenje: koraci, pauze, analiza metrika i automatski prekid. Argo Rollouts Deployment zamjenjuje svojim objektom Rollout, a Flagger upravlja postojećim Deploymentom i uz njega stvori kopiju <code>-primary</code>.
        </p>
        <Callout kind="fact" title="Argo Rollouts (stanje: listopad 2026.)">
          Aktualna verzija je 1.10.0. Za plavo-zeleno <code>autoPromotionEnabled</code> je zadano <code>true</code>, a <code>scaleDownDelaySeconds</code> zadano 30. Usmjerivači prometa uključuju Gateway API (kao dodatak), Istio, Traefik i druge. Bez usmjerivača težina canaryja samo se približno postiže brojem replika.
        </Callout>
        <CodeBlock title="rollout-canary.yaml" lang="yaml" code={rolloutYaml} mode="closed" caption="Canary s koracima 5 → 25 → 50 %, analizom (HTTP 5xx i krivi PDV) i težinama u HTTPRouteu preko dodatka za Gateway API." />
        <DeepDive title="Zašto u simulaciji stabilni Deployment ostaje na 4 Poda?">
          <p>
            U simulaciji canary po replikama dodaje Podove uz četiri stabilna, pa je udio k/(4+k): 1 Pod ≈ 20 %, 2 ≈ 33 %, 4 = 50 %. Argo Rollouts bez usmjerivača radi malo drukčije: smanjuje stabilni ReplicaSet tako da omjer Podova bude što bliže traženoj težini. Brojke su drukčije, ali pouka je ista: udio je omjer Podova po vezi, u grubim koracima i s rasipanjem.
          </p>
        </DeepDive>
      </Section>

      <Section id="baza" kicker="koncept" title="Baza ne ide unatrag" lead="Podove možete vratiti na staru verziju za nekoliko sekundi. Obrisani stupac ne možete.">
        <MarginNote tone="red">rollback vraća Podove, ne bazu</MarginNote>
        <p>
          Dok traje uvođenje, stara i nova verzija rade istodobno i čitaju istu bazu. Nakon povratka opet radi stara verzija – s bazom kakvu je ostavila nova. Zato se shema mijenja u koracima koje razumiju obje verzije: <Term id="expand-contract">proširi pa suzi</Term>.
        </p>
        <SchemaStepper />
        <p>Sada probajte sami. Tablica i Podovi ispod rade na istom simulatoru klastera kao trake iznad.</p>
        <SchemaLab />
        <CodeBlock title="expand-contract.sql" lang="sql" code={expandSql} mode="closed" caption="Tri koraka u PostgreSQL-u; okidač drži oba stupca usklađena dok rade obje verzije." />
      </Section>

      <Section id="izdanje" kicker="koncept" title="Postavljanje nije izdanje" lead="Najsigurnija nova verzija je ona koju još nitko ne vidi.">
        <p>
          Za ispravak 2.0.1 tim planira drukčije. Nova košarica bit će u kodu iza <Term id="feature-flag">zastavice značajke</Term> <code>nova_kosarica</code>. Postavljanje znači samo da kod radi u produkciji, isključen: novu verziju možete pokrenuti, a da je nitko još ne vidi. Izdanje je zasebna odluka: uključiti zastavicu za 1 % studenata, pa za osoblje, pa za sve – bez novog postavljanja.
        </p>
        <FlagStepper />
        <Callout kind="tip" title="Zastavice imaju cijenu">
          Svaka zastavica je dodatni <code>if</code> u kodu i dvije grane kroz aplikaciju koje treba testirati. Kad je izdanje gotovo, zastavicu obrišite iz koda – inače se nakupljaju.
        </Callout>
      </Section>

      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <MythOrFact
          items={[
            { statement: 'Postavljanje i izdanje su isto.', fact: false, explain: 'Uz zastavice značajki kod se postavi unaprijed, isključen, a izda kasnije – bez novog postavljanja.' },
            { statement: 'Povratak na staru verziju uvijek je siguran.', fact: false, explain: 'Podovi se vraćaju, baza ne. Nakon nepovratne migracije (obrisan ili preimenovan stupac) stara verzija pada.' },
            { statement: 'Plavo-zeleno i canary ugrađeni su u Deployment.', fact: false, explain: 'Deployment zna samo RollingUpdate i Recreate. Ostalo traži usmjerivač (selektor Servicea, težine HTTPRoutea) i obično alat poput Argo Rollouts ili Flaggera.' },
            { statement: 'Prebacivanje selektora odmah prebaci sve korisnike.', fact: false, explain: 'Samo nove veze idu na green. Postojeće keep-alive i HTTP/2 veze ostaju na blue dok se ne zatvore.' },
            { statement: 'Staging je prošao, znači produkcija radi.', fact: false, explain: 'Podatci, opterećenje i konfiguracija u produkciji su drukčiji; zato i nakon staginga treba oprezno uvođenje.' },
            { statement: 'Canary po replikama daje točan postotak.', fact: false, explain: 'To je omjer Podova po vezi, s rasipanjem. Uz četiri stabilna Poda najmanji korak je oko 20 %.' },
          ]}
        />
        <Recap
          points={[
            'Postavljanje (verzija radi), izdanje (korisnici je vide), uvođenje (zamjena Podova) i objekt Deployment četiri su različite stvari.',
            'Ista slika s istim digestom promovira se dev → staging → prod; Kustomize iz osnove i slojeva izradi običan YAML za svako okruženje.',
            'Recreate i postupno ažuriranje ugrađeni su u Deployment; plavo-zeleno i canary traže usmjerivač (selektor ili težine) i obično Argo Rollouts ili Flagger.',
            'Canary po težinama šalje odabrani mali udio zahtjeva (u prosjeku, neovisno o broju Podova); po replikama dobivate omjer Podova po vezi, u grubim koracima i s rasipanjem. Analiza mora mjeriti pravu stvar.',
            'Baza se ne vraća: shema se mijenja u koracima proširi → prebaci → suzi, a zastavice odvajaju izdanje od postavljanja.',
          ]}
        />
        <StoryMap at="20" />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Verzija 2.0.1 postavljena je s isključenom zastavicom <code>nova_kosarica</code>. Koji je od ovih događaja izdanje (release)?
                </>
              ),
              options: [
                <>
                  Pod s 2.0.1 postao je spreman u Namespaceu <code>klopa</code>
                </>,
                <>
                  Zastavica <code>nova_kosarica</code> uključena je za sve studente
                </>,
                'Deployment je dobio novi ReplicaSet',
                'Slika je spremljena u registry',
              ],
              correct: 1,
              explain: 'Izdanje je trenutak kad korisnici dobiju funkcionalnost. Uz isključenu zastavicu spreman Pod još ništa ne mijenja korisnicima: spreman Pod i novi ReplicaSet dio su postavljanja i uvođenja, a slika u registryju još nigdje ne radi.',
            },
            {
              q: 'Selektor je prebačen na green, a grafovi pokazuju da blue Podovi još pola minute dobivaju dio zahtjeva od klopa-web. Što je najvjerojatniji uzrok?',
              options: ['Selektor nije primijenjen', 'Postojeće keep-alive veze ostaju na blue dok se ne zatvore', 'kube-proxy dijeli promet redom po zahtjevu', 'Green Podovi nisu spremni'],
              correct: 1,
              explain: 'Promjena selektora vrijedi za nove veze. Otvorene veze ostaju na Podu koji su dobile kad su nastale, zato blue radi još neko vrijeme nakon prebacivanja.',
            },
            {
              q: 'HTTPRoute šalje 95 % prometa stabilnom Serviceu i 5 % canary Serviceu. Stabilni Deployment ima 4 Poda, a canary Deployment 3 Poda. Koliki udio zahtjeva ide na canary?',
              options: ['oko 5 %, neovisno o broju Podova', 'oko 43 % (3 od 7 Podova)', 'točno 5 % u svakoj sekundi', '15 % (5 % po canary Podu)'],
              correct: 0,
              explain: (
                <>
                  Gateway svaki zahtjev zasebno šalje na canary s vjerojatnošću 5/(95+5). Tri canary Poda samo dijele tih oko 5 % među sobom. Udio je 5 % u prosjeku: u kratkom prozoru skače oko toga. Omjer Podova (3 od 7) vrijedio bi za canary po replikama, iza istog Servicea.
                </>
              ),
            },
            {
              q: (
                <>
                  Kojim je redoslijedom sigurno zamijeniti stupac <code>cijena</code> stupcem <code>cijena_s_pdv</code>?
                </>
              ),
              options: ['preimenuj stupac, pa uvedi 2.0', 'uvedi 2.0, pa preimenuj stupac', 'dodaj novi stupac → uvedi 2.0 → obriši stari', 'obriši stari → dodaj novi → uvedi 2.0'],
              correct: 2,
              explain: 'Proširi pa suzi: dok traje uvođenje (i dok je povratak moguć), oba stupca moraju postojati. Stari se briše tek kad ga nijedna verzija više ne čita ni ne upisuje.',
            },
            {
              q: (
                <>
                  Što naredba <code>kubectl apply -k overlays/prod</code> šalje API serveru?
                </>
              ),
              options: [
                'predložak s varijablama koji popuni API server',
                <>
                  obične Kubernetes objekte izrađene iz <code>base/</code> i sloja <code>prod</code>
                </>,
                'samo razlike u odnosu na staging',
                'Helm chart',
              ],
              correct: 1,
              explain: (
                <>
                  Kustomize radi na vašem računalu: spoji osnovu i sloj u običan YAML, a <code>kubectl</code> ga pošalje. API server ne zna ni za Kustomize ni za Helm.
                </>
              ),
            },
            {
              q: (
                <>
                  Iz 13. predavanja: što radi <code>kubectl rollout undo deployment/klopa-api</code>?
                </>
              ),
              options: ['vraća bazu na stanje prije uvođenja', 'vraća predložak Poda na prethodnu reviziju i pokreće novo postupno uvođenje', 'odmah briše sve nove Podove i pokreće stare odjednom', 'vraća Service na stari selektor'],
              correct: 1,
              explain: (
                <>
                  Undo je novo uvođenje sa starim predloškom, po istim pravilima <code>maxSurge</code> / <code>maxUnavailable</code>. Bazu ne dira – zato je Klopa nakon petkova povratka pala: stupca <code>cijena</code> više nije bilo.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            <>
              Strategija bira koliko studenata vidi grešku: canary po težinama, s analizom poslovne metrike, zaustavio je <code>2.0.0</code> nakon 7 krivih računa.
            </>,
            'Plavo-zeleno vraća se promjenom selektora za nekoliko sekundi.',
            'Shema se mijenja u tri koraka, pa je povratak siguran sve do zadnjeg.',
          ]}
          paid={[
            'Plavo-zeleno traži dvostruko Podova; canary traži dva Deploymenta, metrike i alat.',
            <>
              Verzija <code>2.0.0</code> je vraćena, a ispravak PDV-a <code>2.0.1</code> još čeka.
            </>,
            'Promocija po digestu zasad postoji samo na papiru: sliku i dalje gradi Davor na svom laptopu i ručno pokreće uvođenje.',
          ]}
          next={
            <>
              Davor gradi sliku na svom laptopu s nespremljenim promjenama, šalje je kao <code>latest</code> i preskače testove „jer se žuri”. Sljedeći tjedan odlazi na Erasmus – i nitko drugi ne zna kako se Klopa postavlja.
            </>
          }
        />
      </Section>
    </>
  )
}

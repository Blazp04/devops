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
import { PRESET, SEED } from './model'
import { OrchestratorSim } from './sims/OrchestratorSim'
import { ScriptVsLoop } from './sims/ScriptVsLoop'
import { Thermostat } from './sims/Thermostat'
import { ThermostatChain } from './sims/ThermostatChain'
import { DoesAndDoesNot, WorthItChecklist } from './sims/WorthIt'
import pokreniTri from './code/pokreni-tri.sh?raw'
import petlja from './code/petlja.ts.txt?raw'
import klopaApiYaml from './code/klopa-api.yaml?raw'

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook: 03:00, server-2 is gone */}
      <Section id="incident" kicker="priča" title="03:00: poslužitelj-2 je pao" lead="Klopa radi na tri računala, a raspored kontejnera postoji samo u Davorovoj glavi.">
        <IncidentCard
          no={10}
          when="srijeda, 03:00"
          title="Poslužitelj-2 je pao i odnio devet kontejnera"
          who="davor"
          says={['Što je radilo', 'gdje?!']}
          metrics={[
            { label: 'nestalo kontejnera', value: '9', tone: 'bad' },
            { label: 'klopa-api radi', value: '6 od 9', tone: 'bad' },
            { label: 'klopa-worker radi', value: '8 od 12', tone: 'bad' },
            { label: 'slobodnih mjesta', value: '10 za 9', tone: 'warn' },
          ]}
          preset={PRESET}
          seed={SEED}
        >
          Tri poslužitelja, svaki s 14 mjesta za kontejnere. U 03:00 poslužitelj-2 umre, a s njim tri kopije API-ja, četiri potrošača reda (<code>klopa-worker</code>) i dvije kopije weba. Na preostala dva poslužitelja ima 10 slobodnih mjesta za 9 izgubljenih kontejnera (ukupno 28 mjesta za 27) – stane, s jednim mjestom viška – ali netko mora ustati i sve ručno pokrenuti.
        </IncidentCard>
        <p>
          U prošlom je predavanju cijela Klopa stala na jedno računalo, opisana jednom datotekom za <Term id="docker-compose">Docker Compose</Term>. Klopa je otad narasla na tri računala. Svako ima svoj Compose, a Davor ručno odlučuje koji{' '}
          <Term id="container">kontejner</Term> ide kamo. Taj raspored ne piše nigdje – zna ga samo Davor.
        </p>
        <MarginNote tone="red">ručno = netko mora biti budan</MarginNote>
        <p>
          U 03:00 Davor u pidžami mora zapamtiti što je gdje radilo, pronaći slobodno mjesto i sve pokrenuti ručno. A u 12:00 opet: za ručak treba 15 kopija API-ja umjesto 9, pa ih dodaje jednu po jednu – i poslije ručka ih jednu po jednu gasi. Nitko ne
          griješi namjerno, ali čovjek koji spava ne vidi da je poslužitelj pao, a čovjek koji žuri pokrene kontejner na pogrešnom mjestu.
        </p>
        <p>
          <Mark c="yellow">Što ako bismo samo zapisali što želimo – „devet kopija API-ja, uvijek” – a netko drugi neprestano pazio da tako i bude?</Mark> To je cijela ideja Kubernetesa. Prije nego što je objasnimo, odradimo Davorovu noć sami.
        </p>
      </Section>

      {/* 2 ─ Flagship: you are the orchestrator, then hand over to the loop */}
      <Section id="orkestrator" kicker="simulacija" title="Vi ste orkestrator" lead="Isti dan dvaput: prvo ručno, a zatim s petljom koja pazi umjesto nas.">
        <p>
          Ovo je dan s kartice incidenta. Tri poslužitelja imaju po 14 mjesta (u stvarnosti „mjesto” određuju procesor i memorija – to dolazi u 17. predavanju). Na njima radi 27 kontejnera: 9 kopija API-ja (<code>klopa-api</code>), 12 potrošača reda (<code>klopa-worker</code>) i 6 kopija weba (<code>klopa-web</code>), po 9 na svakom
          poslužitelju. Onaj tko odlučuje što radi gdje zove se <em>orkestrator</em> – a prvi put ste to vi.
        </p>
        <p>
          Kad nešto padne ili se želja promijeni, povucite kontejner na poslužitelj. Zatim pritisnite „Predaj Kubernetesu”: dalje upravlja jednostavna petlja koja u svakom prolazu usporedi koliko kopija želimo s koliko ih stvarno radi i ispravi
          razliku. Iscrtkani kontejner je želja koja još ne radi, a puni kontejner radi.
        </p>
        <Predict
          question="U 03:00 poslužitelj-2 padne, a petlja njegovih devet kontejnera pokrene na poslužiteljima 1 i 3. Što se dogodi kad Davor u 08:00 vrati popravljeni poslužitelj-2?"
          options={['Petlja vrati devet kontejnera na poslužitelj-2, gdje su bili.', 'Ništa se ne seli: poslužitelj-2 ostaje prazan dok ne stigne novi posao.', 'Petlja ravnomjerno preraspodijeli sve kontejnere, po 9 na svaki poslužitelj.']}
          correct={1}
          explain="Petlja uspoređuje samo želju i stvarnost: sve kopije rade, pa nema razlike koju bi ispravila. Kubernetes ne seli kontejnere koji već rade. Prazan poslužitelj dobije posao tek kad nastane novi – u 10:00 stiže nova verzija API-ja i njezine kopije padnu uglavnom na njega, jer ima najviše slobodnih mjesta (stare kopije još zauzimaju poslužitelje 1 i 3)."
          then="Provjerite u simulaciji („Novi dan: s petljom”): pogledajte poslužitelj-2 u 08:00 i u 10:00."
        />
        <OrchestratorSim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <strong>Ručno</strong> kapacitet nedostaje dok čovjek ne primijeti, ne probudi se i ne odradi devet radnji. Ako se obavijest izgubi („Izgubi događaj”), do jutra nitko ništa ne zna.
            </li>
            <li>
              <strong>S petljom</strong> iscrtkane kopije pojave se već u sljedećem prolazu i nekoliko sekundi kasnije postanu pune. Izgubljeni događaj ne mijenja ništa – petlja ne čeka obavijesti, nego broji.
            </li>
            <li>
              <strong>Nova želja usred popravka</strong> ne smeta: petlja ne dovršava stari plan, nego ide prema zadnjoj želji.
            </li>
            <li>
              <strong>Želja veća od kapaciteta</strong> ostaje iscrtkana („nema mjesta”). Petlja ne stvara poslužitelje.
            </li>
            <li>
              <strong>Vraćeni poslužitelj</strong> ostaje prazan dok ne stigne novi posao (nova verzija u 10:00).
            </li>
          </ul>
        </Callout>
        <DeepDive title="Što simulacija pojednostavljuje">
          <p>
            „Mjesta” zamjenjuju procesor i memoriju (17. predavanje). Nova verzija API-ja zamijeni sve kopije odjednom, a pravi Kubernetes to radi postupno, kopiju po kopiju (13. predavanje). Petlja nema ime – u 11. predavanju vidjet ćemo da je
            to zapravo nekoliko komponenti.
          </p>
          <p>
            Raspoređivanje u simulaciji gleda samo slobodna mjesta, pa u danu s petljom nakon 10:00 svih devet kopija API-ja stoji na poslužitelju-2. Pravi raspoređivač uz to nastoji kopije iste aplikacije rasporediti po različitim
            računalima, da pad jednog ne odnese sve.
          </p>
          <p>
            Dan je sažet: jedna sekunda simulacije jedna je minuta dana, a prolaz petlje traje 10 sekundi simulacije. Na nestalu kopiju stvarne petlje reagiraju za nekoliko sekundi. Kad nestane cijeli poslužitelj, Kubernetes po zadanim
            postavkama pričeka pedesetak sekundi da ga proglasi nedostupnim i još 5 minuta (možda se vrati) prije nego što zamijeni njegove kopije (11. predavanje) – ali bez ijednog budnog čovjeka.
          </p>
        </DeepDive>
      </Section>

      {/* 3 ─ Imperative vs declarative */}
      <Section id="izjava" kicker="koncept" title="Skripta ili izjava" lead="Imperativno opisujemo korake, deklarativno opisujemo rezultat.">
        <p>
          Davorova skripta je <strong>imperativna</strong> (engl. <em>imperative</em>): niz koraka – „pokreni tri kontejnera” – koji se izvrše jednom i završe. Petlja iz simulacije radi s <Term id="imperative-declarative">
            <strong>deklarativnom</strong>
          </Term>{' '}
          (engl. <em>declarative</em>) izjavom: „želim tri kopije” (stručno: tri <em>replike</em>, engl. <em>replicas</em>). Ne kaže kako, nego što treba postojati.
        </p>
        <p>
          Programeri ovu razliku već poznaju. <code>SELECT … WHERE cijena &lt; 3</code> je deklarativan: kažete što želite, a baza odluči kako. Petlja <code>for</code> koja ručno filtrira niz je imperativna. Ako ste radili s Reactom: opišete kako
          sučelje treba izgledati, a React sam izračuna što u DOM-u treba promijeniti. Razlika je u tome što React usklađuje samo kad se stanje promijeni, a Kubernetes provjerava neprestano.
        </p>
        <ScriptVsLoop />
        <p>
          Zapisani opis onoga što želimo zove se <Term id="desired-state">željeno stanje</Term> (engl. <em>desired state</em>). Ono što se trenutačno stvarno događa je <strong>stvarno stanje</strong>. Primijetite dvije stvari iz animacije:
        </p>
        <ul>
          <li>
            Izjava je <Term id="idempotency">idempotentna</Term> (kao potrošač iz 6. predavanja): ponovite li „želim 3”, ništa se ne promijeni. Pokrenete li skriptu ponovno nakon što je jedna kopija pala, dobijete pet kopija (2 + 3) – ili, kao u
            našoj skripti <code>pokreni-tri.sh</code> s imenima, grešku, jer imena već postoje.
          </li>
          <li>Na kvar i na promjenu želje petlja reagira na isti način: uvijek samo ispravi razliku. Ne treba joj poseban plan za „poslužitelj je pao” i poseban plan za „ručak”.</li>
        </ul>
      </Section>

      {/* 4 ─ The thermostat: observe, compare, act; level-triggered */}
      <Section id="termostat" kicker="koncept" title="Termostat: promotri, usporedi, ispravi" lead="Petlja ne pita zašto je razlika nastala – samo je ispravi, i tako zauvijek.">
        <p>Kubernetesova dokumentacija petlju objašnjava termostatom. Pogledajmo ga korak po korak.</p>
        <Thermostat />
        <p>
          To je <Term id="reconciliation-loop">petlja usklađivanja</Term> (engl. <em>reconciliation loop</em>): promotri stvarno stanje, usporedi ga sa željenim, ispravi razliku – i ponovi. Najvažnija joj je jedna osobina:{' '}
          <strong>reagira na razliku, a ne na događaj</strong>.
        </p>
        <MarginNote>razina = stanje sada · rub = upravo promijenjeno</MarginNote>
        <p>
          Inženjeri to zovu <Term id="level-triggered">okidanje razinom</Term> (engl. <em>level-triggered</em>), za razliku od okidanja rubom (engl. <em>edge-triggered</em>). Sustav okidan rubom reagira na poruku „nešto se promijenilo” – izgubi li
          je, ne zna ništa. Sustav okidan razinom svaki put iznova pogleda kakvo je stanje sada. Poruka mu može pomoći da pogleda ranije, ali nije mu nužna. Zato je u simulaciji gumb „Izgubi događaj” ručno upravljanje ostavio bez kapaciteta do
          jutra, a petlji nije promijenio ništa.
        </p>
        <Analogy
          title="Analogija: termostat"
          who="mira"
          breaksDown="termostat pazi na jednu veličinu i grije postupno. U Kubernetesu radi mnogo petlji, svaka za svoj dio stanja, a stvari se ne mijenjaju postupno, nego u skokovima: kopija s palog poslužitelja ne „oživi”, nego nastane nova, s novim imenom i adresom."
        >
          Termostat ne zna tko je otvorio prozor i ne čeka da mu to netko javi. Svakih nekoliko minuta izmjeri sobu, usporedi s 22 °C i grije ako treba. Ne zanima ga zašto je hladno – samo koliko.
        </Analogy>
        <DeepDive title="Kako pravi kontroler zna kada treba pogledati?">
          <p>
            Pravi kontroler ne spava naslijepo deset sekundi. Preko Kubernetesova API-ja (11. predavanje) prati promjene (engl. <em>watch</em>), pa reagira gotovo odmah – ali događaj mu je samo znak da ponovno pogleda, a odluku uvijek donosi iz trenutačnog stanja. Uz to
            povremeno ponovno usklađuje sve objekte (engl. <em>resync</em>), pa ni izgubljena ni zakašnjela obavijest ne ostavlja trajnu razliku. Ako ispravak ne uspije, kontroler ga pokuša ponovno, s rastućim razmakom između pokušaja.
          </p>
        </DeepDive>
      </Section>

      {/* 5 ─ A chain of thermostats, not a conductor */}
      <Section id="lanac" kicker="kubernetes" title="Lanac termostata, a ne dirigent" lead="Kubernetes nije jedna petlja koja zna sve, nego mnogo malih – i nijedna ne zapovijeda ostalima.">
        <p>
          Kubernetes upravlja <strong>klasterom</strong> (engl. <em>cluster</em>): skupom računala koja se ponašaju kao jedno. Svako od tih računala je <Term id="node">čvor</Term> (engl. <em>node</em>). Kopiju aplikacije Kubernetes zove{' '}
          <Term id="pod">Pod</Term> – u crtežima je to kutija za ručak, a detaljno ga upoznajemo u 12. predavanju.
        </p>
        <p>
          U Kubernetesu ne radi jedna petlja, nego mnogo njih (zovu se <em>kontroleri</em>, engl. <em>controllers</em>). Svaka pazi na svoj mali dio: jedna na broj kopija, druga na to da svaka kopija dobije čvor, treća na svakom čvoru pazi da Podovi zapisani na taj čvor
          stvarno rade. Međusobno ne razgovaraju: svaka čita zapisano stanje, ispravi svoju razliku i zapiše rezultat – a taj rezultat je ulaz za sljedeću.
        </p>
        <ThermostatChain />
        <p>Iz toga slijede tri stvari koje iznenade gotovo svakoga tko prvi put radi s Kubernetesom:</p>
        <ul>
          <li>
            <strong>Zamjena, ne popravak.</strong> Kad čvor nestane, njegovi se Podovi ne popravljaju i ne sele, nego nastaju novi – s novim imenom i novom IP adresom. Zato se nikad ne oslanjamo na ime ili adresu jednog Poda (kako ih ipak
            pronaći, rješava 14. predavanje). Jedina iznimka: kad se sruši kontejner, agent na čvoru (<code>kubelet</code>) ponovno ga pokrene na istom mjestu, u istom Podu – to gledamo u 12. predavanju.
          </li>
          <li>
            <strong>Nema vraćanja.</strong> Kubernetes ne seli Podove koji rade kad se čvor vrati. Vraćeni čvor ostaje prazan dok ne stigne novi posao. (Postoje dodatni alati koji namjerno preraspodjeljuju Podove, ali nisu dio osnovnog
            Kubernetesa.)
          </li>
          <li>
            <strong>Klaster nikad nije „gotov”.</strong> Uvijek nešto pada, mijenja se ili se uvodi. Dokumentacija kaže da klaster možda nikad ne dosegne mirno stanje – i da je to u redu, dok god petlje rade i ispravljaju razlike.
          </li>
        </ul>
        <Myth myth="Kubernetes je dirigent: ima plan, izvodi ga korak po korak, a svi čekaju njegov znak.">
          Kubernetes je skup <strong>neovisnih petlji usklađivanja</strong>. Nitko ne izvodi plan: svaka petlja gleda svoj dio zapisanog stanja i ispravlja razliku. Dokumentacija to kaže izravno: Kubernetes nije orkestracija u smislu „prvo A,
          zatim B, zatim C”, nego skup neovisnih upravljačkih procesa koji stvarno stanje neprestano tjeraju prema željenom.
        </Myth>
        <p>
          Kubernetes se i dalje zove sustav za orkestraciju kontejnera – ali ne orkestrira partiturom („prvo A, zatim B”), nego petljama koje stalno uspoređuju želju sa stvarnošću.
        </p>
        <Compare
          left={{
            title: 'Dirigent (mit)',
            tone: 'rose',
            points: ['izvodi partituru: prvo A, zatim B', 'svi čekaju njegovu palicu', 'propusti li takt, plan se raspadne', 'kad on stane, stane i glazba'],
          }}
          right={{
            title: 'Termostati (stvarnost)',
            tone: 'blue',
            points: ['svaka petlja gleda samo svoj dio', 'nitko nikoga ne čeka – svi čitaju zapisano stanje', 'propuštena poruka ne smeta: sljedeći krug vidi razliku', 'stane li upravljanje, aplikacije i dalje rade'],
          }}
        />
        <p>
          Zadnji redak je važan za dežurstva. Dio Kubernetesa koji čuva zapisano stanje i vrti petlje zove se <Term id="control-plane">upravljačka ravnina</Term> (engl. <em>control plane</em>). Ako ona stane, Podovi koji rade – rade dalje i
          poslužuju promet. Samo ne nastaju zamjenski ni novi Podovi i ništa se ne raspoređuje – jedino agent na čvoru (<code>kubelet</code>) i dalje ponovno pokreće srušene kontejnere. Kako to izgleda iznutra, vidimo u 11. predavanju.
        </p>
        <KeyIdea>
          Kubernetesu ne zadajemo korake, nego zapisujemo <strong>što želimo da postoji</strong>. Neovisne <strong>petlje usklađivanja</strong> zauvijek uspoređuju željeno stanje sa stvarnim i ispravljaju razliku – pa se kvar, izgubljena poruka i
          nova želja rješavaju na isti način.
        </KeyIdea>
      </Section>

      {/* 6 ─ What Kubernetes is not, and is it worth it */}
      <Section id="isplati" kicker="koncept" title="Što Kubernetes radi, što ne radi i isplati li se" lead="Kubernetes pokreće, povezuje i čuva kontejnere na skupu računala – ali ne gradi kod, nema CI/CD i ne daje bazu.">
        <p>
          Kubernetes (često skraćeno K8s) je sustav otvorenog koda (engl. <em>open source</em>) koji kontejnere raspoređuje po čvorovima klastera i drži ih u željenom stanju. Njegova vlastita dokumentacija nabraja što radi – i, jednako važno, što ne radi:
        </p>
        <DoesAndDoesNot />
        <Callout kind="warn" title="Cijena složenosti">
          Klaster je novi raspodijeljeni sustav koji i sam treba čuvati: upravljačku ravninu, mrežu, certifikate, prava pristupa, nadogradnje (nova verzija stiže otprilike tri puta godišnje) i račun za računala. Za jednu aplikaciju na jednom
          poslužitelju to je više posla nego koristi.
        </Callout>
        <p>
          Zato mnogi timovi biraju <strong>upravljani klaster</strong> (engl. <em>managed Kubernetes</em>): Amazon EKS, Google GKE, Azure AKS i slične usluge. Pružatelj održava upravljačku ravninu, a vi i dalje brinete o aplikacijama, nadogradnjama i
          (osim ako ih također prepustite pružatelju) o čvorovima. Za učenje na vlastitom računalu postoje alati kind i minikube, a za mala računala lagana distribucija k3s.
        </p>
        <Callout kind="fact" title="Verzije (stanje: listopad 2026.)">
          Najnovija manja verzija je Kubernetes 1.37 „Garhwal”, objavljena 26. kolovoza 2026. (trenutačno zakrpa 1.37.1). Redovite zakrpe dobivaju tri najnovije manje verzije (1.35, 1.36 i 1.37); 1.34 je još u završnom razdoblju održavanja do 27. listopada 2026. Nova manja verzija izlazi otprilike tri puta godišnje, a
          svaka se održava oko 14 mjeseci (godinu dana redovitih zakrpa i još dva mjeseca održavanja) – 1.37 do 28. listopada 2027.
        </Callout>
        <WorthItChecklist />
      </Section>

      {/* 7 ─ Code: the loop in ten lines, the desire in a file, apply ≠ running */}
      <Section id="kod" kicker="kod" title="Želja u datoteci" lead="Ono što ste vidjeli u animacijama – sada u kodu.">
        <p>Najprije razlika između skripte i petlje, u desetak redaka:</p>
        <Tabs
          tabs={[
            {
              label: 'Skripta',
              content: <CodeBlock title="pokreni-tri.sh" lang="bash" code={pokreniTri} mode="open" caption="Koraci koji se izvrše jednom. Nakon zadnjeg retka nitko ne gleda." />,
            },
            {
              label: 'Petlja',
              content: (
                <CodeBlock
                  title="petlja.ts (pseudokod)"
                  lang="typescript"
                  code={petlja}
                  mode="open"
                  caption="Petlja usklađivanja u desetak redaka. U stvarnom kontroleru umjesto slijepog čekanja stoji praćenje promjena (watch)."
                  notes={[
                    { lines: '6', text: 'promotri: koliko ih stvarno radi' },
                    { lines: '7', text: 'usporedi: razlika, ne događaj' },
                    { lines: '8-9', text: 'ispravi u oba smjera' },
                    { lines: '10', text: 'pa ispočetka – zauvijek' },
                  ]}
                />
              ),
            },
          ]}
        />
        <p>
          U Kubernetesu tu petlju ne pišemo mi – mi pišemo samo želju. Ovo je pojednostavljena datoteka za Klopin API (tri kopije umjesto devet, da ispis bude kratak). Zasad je u njoj važan samo jedan redak:
        </p>
        <CodeBlock
          title="klopa-api.yaml"
          lang="yaml"
          code={klopaApiYaml}
          highlight="9"
          notes={[
            { lines: '9', text: 'želja: tri replike (kopije), uvijek' },
            { lines: '13-19,21-26', text: 'predložak: kako izgleda jedna kopija' },
            { lines: '20', text: 'slika – gradimo je mi (8. predavanje)' },
          ]}
          caption="Deklarativni opis: koliko kopija i od koje slike. Nigdje ne piše na kojem čvoru ni kojim redom."
        />
        <Callout kind="info">
          Objekt u primjeru je <strong>Deployment</strong> – upoznat ćemo ga u 13. predavanju. Zasad je važan samo redak <code>replicas: 3</code>.
        </Callout>
        <p>Takvu datoteku spremamo u Git: želja je tada zapisana, pregledana i ima povijest (22. predavanje).</p>
        <p>
          Na probnom klasteru Lana tu datoteku preda naredbom <code>kubectl apply</code>, a zatim naredbom <code>kubectl get -w</code> gleda kako stvarno stanje sustiže željeno:
        </p>
        <Terminal
          title="Lanin laptop · probni klaster"
          lines={[
            { cmd: 'kubectl apply -f klopa-api.yaml' },
            { out: 'deployment.apps/klopa-api created', tone: 'ok' },
            { cmd: 'kubectl get deployment klopa-api -n klopa -w' },
            { out: 'NAME        READY   UP-TO-DATE   AVAILABLE   AGE' },
            { out: 'klopa-api   0/3     3            0           2s', note: '„created” – a radi 0 od 3!', who: 'lana' },
            { out: 'klopa-api   1/3     3            1           14s' },
            { out: 'klopa-api   2/3     3            2           15s' },
            { out: 'klopa-api   3/3     3            3           17s', tone: 'ok' },
          ]}
          caption={
            <>
              <code>kubectl apply</code> samo zapiše želju i odmah se vrati. Petlje je ostvaruju asinkrono: <code>READY</code> ide od 0/3 do 3/3.
            </>
          }
        />
        <p>A što ako jedan Pod nestane? Davor ga namjerno obriše, kao da je pao:</p>
        <Terminal
          title="Davorov laptop"
          lines={[
            { cmd: 'kubectl get pods -n klopa -l app=klopa-api' },
            { out: 'NAME                         READY   STATUS    RESTARTS   AGE' },
            { out: 'klopa-api-7c9d8f6b5d-4xk2p   1/1     Running   0          3m' },
            { out: 'klopa-api-7c9d8f6b5d-9qwzt   1/1     Running   0          3m' },
            { out: 'klopa-api-7c9d8f6b5d-m7hcv   1/1     Running   0          3m' },
            { comment: '# kao da je pao:' },
            { cmd: 'kubectl delete pod klopa-api-7c9d8f6b5d-9qwzt -n klopa' },
            { cmd: 'kubectl get pods -n klopa -l app=klopa-api' },
            { out: 'NAME                         READY   STATUS    RESTARTS   AGE' },
            { out: 'klopa-api-7c9d8f6b5d-4xk2p   1/1     Running   0          3m' },
            { out: 'klopa-api-7c9d8f6b5d-m7hcv   1/1     Running   0          3m' },
            { out: 'klopa-api-7c9d8f6b5d-tz8rn   1/1     Running   0          6s', note: 'novo ime – zamjena, ne popravak', who: 'davor' },
          ]}
          caption="Želja je i dalje tri kopije. Petlja je vidjela 2 ≠ 3 i napravila novi Pod, s novim imenom."
        />
      </Section>

      {/* 8 ─ Misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            {
              statement: 'Kubernetes je izvršno okruženje za kontejnere – zamjena za Docker.',
              fact: false,
              explain: 'Kubernetes orkestrira: odlučuje što gdje treba raditi. Kontejnere na čvoru pokreće izvršno okruženje za kontejnere (engl. container runtime), najčešće containerd ili CRI-O. Slike izgrađene Dockerom rade bez promjene, jer su standardne OCI slike.',
            },
            {
              statement: 'Kubernetes automatski čini aplikaciju skalabilnom.',
              fact: false,
              explain: 'Samo ako je aplikacija bez stanja (5. predavanje) i ako je za to konfigurirana. Kopiju koja košarice drži u svojoj memoriji Kubernetes će umnožiti – zajedno s problemom.',
            },
            {
              statement: (
                <>
                  <code>kubectl apply</code> odmah sve napravi.
                </>
              ),
              fact: false,
              explain: (
                <>
                  <code>apply</code> samo zapiše željeno stanje. Petlje ga ostvaruju asinkrono, za nekoliko sekundi ili dulje – uspješan <code>apply</code> ne znači da aplikacija radi.
                </>
              ),
            },
            {
              statement: 'Kubernetes izvršava plan korak po korak.',
              fact: false,
              explain: 'Nema plana. Neovisne petlje okidane razinom svaka ispravljaju svoju razliku, dok stvarno stanje ne dostigne željeno.',
            },
            {
              statement: 'Kubernetes mi daje CI/CD, logove i bazu.',
              fact: false,
              explain: 'Kubernetes ne gradi kod i ne daje CI/CD, bazu ni cjelovit sustav za logove i nadzor – nije PaaS. Te dijelove dodajemo sami (19., 21., 22. i 24. predavanje).',
            },
            {
              statement: 'Ako upravljačka ravnina stane, aplikacije koje već rade i dalje rade.',
              fact: true,
              explain: (
                <>
                  Kontejnere na čvorovima drži agent na svakom čvoru (<code>kubelet</code>). Bez upravljačke ravnine ne nastaju zamjene ni novi Podovi, ali ono što radi – radi dalje, a <code>kubelet</code> i dalje ponovno pokreće srušene
                  kontejnere (11. predavanje).
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* 9 ─ Recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            <>
              <strong>Imperativno</strong> opisujemo korake („pokreni 3”), <strong>deklarativno</strong> rezultat („želim 3”). Izjava je idempotentna, skripta nije.
            </>,
            <>
              <strong>Petlja usklađivanja</strong>: promotri → usporedi → ispravi, zauvijek. Reagira na razliku, a ne na događaj – zato joj izgubljena obavijest ne smeta.
            </>,
            <>
              Kubernetes je <strong>skup neovisnih petlji</strong>, a ne dirigent: svaka pazi na svoj dio zapisanog stanja.
            </>,
            <>
              Podovi s palog čvora se <strong>zamjenjuju, ne popravljaju</strong> (novo ime, nova adresa) – samo srušeni kontejner <code>kubelet</code> ponovno pokrene u istom Podu. Vraćeni čvor ostaje prazan – ništa se ne seli natrag.
            </>,
            <>
              Kubernetes <strong>ne gradi kod</strong> i nema CI/CD ni bazu. Isplati se kad imamo više dijelova, više poslužitelja i promjenjiv promet – najčešće kao upravljani klaster.
            </>,
          ]}
        />
        <StoryMap at="10" />
        <Quiz
          questions={[
            {
              q: 'Koji je od ovih zapisa deklarativan?',
              options: [
                <>
                  <code>docker run klopa-api</code> tri puta, u petlji <code>for</code>
                </>,
                '„Ako kontejner padne, pokreni novi.”',
                <>
                  <code>replicas: 3</code> – „neka uvijek rade tri kopije”
                </>,
                '„Prvo pokreni bazu, zatim API, zatim web.”',
              ],
              correct: 2,
              explain: (
                <>
                  Samo <code>replicas: 3</code> opisuje rezultat. Prvi i četvrti zapis su koraci, a drugi je pravilo koje se okida događajem – sve to netko mora izvršiti i ponavljati.
                </>
              ),
            },
            {
              q: 'Obavijest „kopija je nestala” izgubila se na putu. Što napravi petlja usklađivanja?',
              options: ['Ništa – bez obavijesti ne zna da je kopija nestala.', 'U sljedećem prolazu prebroji kopije, vidi razliku i pokrene novu.', 'Čeka da netko ručno ponovno pošalje obavijest.', 'Ponovno pokrene cijeli poslužitelj.'],
              correct: 1,
              explain: 'Petlja je okidana razinom: u svakom prolazu iznova uspoređuje želju sa stvarnim stanjem. Obavijest joj može ubrzati reakciju, ali nije joj potrebna.',
            },
            {
              q: (
                <>
                  Lana pokrene <code>kubectl apply</code> i terminal odgovori „created”. Dvije minute kasnije <code>kubectl get deployment</code> i dalje pokazuje <code>READY 0/3</code>. Što to znači?
                </>
              ),
              options: [
                <>
                  Aplikacija radi, samo <code>kubectl</code> sporo osvježava ispis.
                </>,
                <>
                  <code>apply</code> nije uspio, treba ga ponoviti.
                </>,
                'Želja je zapisana, ali stvarno stanje je nije dostiglo – negdje na putu nešto je zapelo i treba pogledati gdje.',
                'Kubernetes čeka da Lana ručno pokrene kontejnere.',
              ],
              correct: 2,
              explain: (
                <>
                  „Created” znači samo da je željeno stanje zapisano. Petlje ga ostvaruju asinkrono, a ako <code>READY</code> dugo stoji na 0/3, negdje na putu (slika, raspoređivanje, pokretanje) nešto ne ide. Gdje tražiti, vidimo u 11. predavanju.
                  Ponovni <code>apply</code> ne pomaže: ista želja ostaje ista.
                </>
              ),
            },
            {
              q: 'Petlja upravo popravlja (dvije kopije API-ja još su iscrtkane), a Petra promijeni želju s 9 na 12. Što petlja napravi?',
              options: ['Najprije dovrši stari popravak do 9, pa tek onda kreće prema 12.', 'U sljedećem prolazu usporedi 12 sa stvarnim stanjem i ide ravno prema 12.', 'Odbije promjenu dok popravak traje.', 'Obriše sve kopije i počne ispočetka.'],
              correct: 1,
              explain: 'Petlja ne izvodi plan: u svakom prolazu uspoređuje zadnju želju sa stvarnim stanjem. Dvije iscrtkane kopije već su na putu, pa u sljedećem prolazu doda još tri – kvar i nova želja rješavaju se na isti način.',
            },
            {
              q: 'Što od ovoga Kubernetes NE radi sam?',
              options: ['zamjenjuje Podove s čvora koji je pao', 'gradi sliku kontejnera iz vašeg koda', 'dijeli promet među kopijama', 'povećava ili smanjuje broj kopija'],
              correct: 1,
              explain: (
                <>
                  Kubernetes pokreće gotove slike, ali ih ne gradi: sliku gradite vi (<code>docker build</code>, 8. predavanje) ili CI (21. predavanje). Ostalo su njegove standardne mogućnosti.
                </>
              ),
            },
            {
              q: 'Klopa ima tri poslužitelja s po 14 mjesta i želi 30 kontejnera. Jedan poslužitelj padne. Što petlja može napraviti?',
              options: ['Pokrenuti svih 30 kontejnera na preostala dva poslužitelja.', 'Pokrenuti 28, a dvije kopije ostaju iscrtkane („nema mjesta”) dok se ne doda kapacitet.', 'Ugasiti cijelu aplikaciju jer nema dovoljno mjesta.', 'Sama kupiti novi poslužitelj.'],
              correct: 1,
              explain: 'Petlja ne stvara kapacitet: 2 × 14 = 28 mjesta za 30 kontejnera. To je pravilo N+1 iz 5. predavanja – rezervu za pad jednog poslužitelja planiramo mi. (Automatsko dodavanje čvorova postoji, ali kao poseban alat – 18. predavanje.)',
            },
          ]}
        />
      </Section>

      {/* 10 ─ Cost of the solution → L11 */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={['Pad poslužitelja u 03:00 popravlja petlja, a Davor spava.', 'Za ručak mijenjamo jedan broj umjesto ručnog pokretanja šest kopija.', 'Izgubljena obavijest više ne znači da nitko ništa ne zna.']}
          paid={['Klaster je novi sustav koji treba razumjeti, održavati i platiti.', 'Ne znamo tko u klasteru zapravo radi posao.', '„Created” ne znači „radi” – a gdje zapne, još ne vidimo.']}
          next={
            <>
              Lana napiše prva dva manifesta, za <code>klopa-api</code> i za <code>klopa-worker</code>, i pokrene <code>kubectl apply</code>. Terminal odgovori <code>pod/klopa-api created</code> i <code>pod/klopa-worker created</code> – ali aplikacija ne odgovara. Tko zapravo
              radi posao i gdje je zapelo?
            </>
          }
        />
      </Section>
    </>
  )
}

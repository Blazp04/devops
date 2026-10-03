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
  Tabs,
  Term,
  Terminal,
} from '../../kit'
import { WorkerStepper } from './sims/WorkerStepper'
import { CoresOrRam } from './sims/CoresOrRam'
import { TailHistogram } from './sims/TailHistogram'
import { HockeyStick } from './sims/HockeyStick'
import { LunchSim } from './sims/LunchSim'
import { BiggerServer } from './sims/BiggerServer'
import { NinesTable } from './sims/NinesTable'
import gunicornConf from './code/gunicorn.conf.py?raw'
import fpmConf from './code/www.conf?raw'
import pm2Conf from './code/ecosystem.config.js?raw'
import dbJs from './code/db.js?raw'
import k6Script from './code/k6-podne.js?raw'
import htopSnap from './code/htop.txt?raw'
import styles from './styles.module.css'

const FREE_M = `               total        used        free      shared  buff/cache   available
Mem:            1967        1781          64           3         122         186
Swap:              0           0           0`

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Incident */}
      <Section id="incident" kicker="priča" title="Podne, a procesor odmara" lead="Ponedjeljak, 12:00. Cijeli kampus otkrio je Klopu – i stranica se počinje vući.">
        <IncidentCard
          no={2}
          when="ponedjeljak, 12:00"
          title="Klopa odbija svaku drugu narudžbu, a procesor odmara"
          who="davor"
          says={['503!', 'A CPU je', 'na 17 %?!']}
          preset="l02-incident"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '4 → 12', tone: 'warn' },
            { label: 'p95', value: '3,0 s', tone: 'bad' },
            { label: 'greške 503', value: '51 %', tone: 'bad' },
            { label: 'procesor', value: '17 %', tone: 'ok' },
          ]}
        >
          U 11:58 Klopa mirno poslužuje 4 zahtjeva u sekundi, uz p95 od oko 1,6 s i bez grešaka. U 12:00 promet skoči na 12 zahtjeva u sekundi: otprilike svaki drugi student
          dobije grešku 503, a Davor naredbom <code>htop</code> vidi procesor na 17 %. (Mjereno tijekom 30 s naleta.)
        </IncidentCard>
        <p>
          Dvije kratice s kartice: p95 je vrijeme unutar kojeg stigne 95 % odgovora (točno ga definiramo malo niže), a <code>htop</code> je program koji uživo prikazuje opterećenje
          procesora i memorije.
        </p>
        <p>
          Prošli put Klopa se s Lanina laptopa preselila na iznajmljeni poslužitelj s dvije procesorske jezgre (pružatelj ih zove <Term id="vcpu">vCPU</Term>) i 2 GB RAM-a. Petra ju je
          napokon vidjela sa svog mobitela i cijelo jutro sve radi. A onda dođe podne.
        </p>
        <p>
          Na prvi pogled ovo nema smisla. Greška 503 (engl. <em>Service Unavailable</em>) znači „poslužitelj trenutačno ne može primiti zahtjev” – najčešće zato što je prezauzet. A procesor je gotovo besposlen. Lana kaže da je kod isti kao
          jutros. Petri stižu poruke studenata koji ne mogu naručiti ručak.
        </p>
        <p>
          <strong>Kako poslužitelj može biti pun dok mu procesor odmara?</strong>
        </p>
        <p>
          Da bismo odgovorili, pogledat ćemo što poslužitelj radi sa svakim zahtjevom, naučiti četiri broja kojima opisujemo opterećenje i vidjeti zašto čekanje ne raste ravnomjerno. Na
          kraju ćete u simulaciji sami pokušati preživjeti podne – i izvući utikač.
        </p>
      </Section>

      {/* 2 ─ Concept: the worker pool */}
      <Section id="radnici" kicker="koncept" title="Što poslužitelj radi sa zahtjevom" lead="Svaki zahtjev zauzme jednog radnika od dolaska do odgovora – i dok računa, i dok čeka bazu.">
        <Predict
          question="Davor kaže: „Procesor je na 17 %, dakle ima mjesta.” Što bi Klopi u 12:00 najviše pomoglo?"
          options={[
            'Dvostruko više procesorskih jezgri (4 vCPU, 2 GB RAM-a)',
            'Dvostruko više RAM-a (2 vCPU, 4 GB RAM-a)',
            'Ništa – 12 zahtjeva u sekundi previše je za bilo koji poslužitelj',
          ]}
          correct={1}
          explain="Klopini zahtjevi u podne većinom čekaju bazu. Dok čeka, zahtjev drži radnika – a koliko radnika stane, određuje RAM, ne procesor. Više jezgri bi samo još više odmaralo."
          then="Pogledajmo korak po korak zašto."
        />
        <p>
          Klopin API je program u Pythonu (Django), a pokreće ga gunicorn. Gunicorn pokrene nekoliko <Term id="worker">radnika</Term> (engl. <em>workers</em>): zasebnih procesa od kojih
          je svaki potpuna kopija aplikacije u memoriji, oko 256 MB. Sinkroni radnik u jednom trenutku obrađuje točno jedan zahtjev. Narudžbe čuva baza Postgres na zasebnom stroju, pa RAM
          Klopina poslužitelja dijele samo operacijski sustav i radnici.
        </p>
        <Callout kind="info" title="Model u svim simulacijama ovog predavanja">
          <ul>
            <li>Sinkroni radnik zauzima ≈256 MB i drži jedan zahtjev. Isto se ponaša PHP-FPM (i Puma s jednom dretvom po procesu).</li>
            <li>
              Jezgre su vCPU-ovi koje daje pružatelj usluge u oblaku; jedan zahtjev u jednom trenutku koristi najviše jednu.
            </li>
            <li>
              Postgres u podne odgovara za oko 1 s (mnogo narudžbi odjednom, zaključani redovi). Simulacija pretpostavlja da baza odgovara jednako brzo koliko god upita istodobno čekalo.
            </li>
            <li>Ispred radnika stoji red od 10 mjesta. Kad se napuni, višak odmah dobiva grešku 503 (tko je vraća, objašnjavamo uz simulaciju).</li>
          </ul>
        </Callout>
        <WorkerStepper />
        <p>Sad Klopino podne možemo izračunati na salveti:</p>
        <ol className={styles.salveta}>
          <li>
            <strong>Radnika:</strong> od 2048 MB oko 512 MB treba operacijski sustav, a u ostatak stane (2048 − 512) / 256 = <strong>6 radnika</strong>.
          </li>
          <li>
            <strong>Trajanje:</strong> zahtjev drži radnika oko 50 ms računanja + 1000 ms čekanja baze ≈ <strong>1,05 s</strong>.
          </li>
          <li>
            <strong>Najviše odgovora:</strong> 6 radnika / 1,05 s ≈ <strong>5,7 odgovora u sekundi</strong>. U 11:58 dolaze 4 – stane. U 12:00 dolazi 12 – ne stane.
          </li>
          <li>
            <strong>Čekanje:</strong> tko ipak uđe u red od 10 mjesta, čeka oko 10 / 5,7 ≈ 1,75 s, a onda još 1,05 s obrade – zato p95 u naletu skoči na <strong>oko 3 s</strong>.
          </li>
          <li>
            <strong>Procesor:</strong> 5,7 odgovora × 50 ms ≈ 0,29 s računanja u svakoj sekundi, raspoređeno na dvije jezgre: <strong>oko 15 %</strong>. (Simulacija u naletu izmjeri 16–17 %; račun na salveti je približan.)
          </li>
        </ol>
        <p>To je odgovor na Davorovo pitanje. Poslužitelj nije ostao bez procesora, nego bez radnika – a koliko radnika stane, određuje RAM.</p>
        <KeyIdea>
          <strong>Procesorske jezgre</strong> određuju koliko posla poslužitelj obavi u sekundi, a <strong>RAM</strong> koliko zahtjeva u njemu istodobno stane. Poslužitelj je pun čim
          ponestane bilo čega od toga – zato može biti pun dok procesor odmara.
        </KeyIdea>
        <Analogy
          title="Analogija: kuhinja menze"
          breaksDown="teta Mira se umara postupno i stigne reći da joj je teško. Poslužitelj ne: kad mu ponestane memorije, operacijski sustav naglo ubije proces (OOM), a ponekad poslužitelj samo tiho vraća greške."
        >
          Teta Mira ima dvije ruke – to su procesorske jezgre. Narudžbe slaže na pult, a na pult stane šest tanjura – to je RAM. Ako svaka narudžba čeka da se juha skuha (baza), teta Mira
          stoji prekriženih ruku, a pult je ipak pun: nova narudžba nema kamo.
        </Analogy>
        <DeepDive title="A Node.js, Go ili asinkroni Python?">
          <p>
            Ovaj model vrijedi za poslužitelje s bazenom radnika: gunicorn sa sinkronim radnicima, PHP-FPM, Puma, klasični Java poslužitelji s bazenom dretvi. Asinkroni poslužitelji
            (Node.js, Go, asinkroni Python) rade drukčije: jedan proces istodobno poslužuje mnogo zahtjeva, jer dok jedan čeka bazu, proces radi na drugome. Zato im po zahtjevu treba mnogo
            manje RAM-a.
          </p>
          <p>
            Granice ipak postoje. JavaScript kod jednog Node.js procesa izvodi se na jednoj jezgri, pa se za više jezgri pokreće proces po jezgri (npr. PM2 u načinu <code>cluster</code>) ili
            više kopija aplikacije. A koliko zahtjeva istodobno smije čekati bazu, najčešće određuje bazen veza prema bazi, npr. 10 veza. Usko grlo se seli, ali ne nestaje.
          </p>
          <p>
            I sam gunicorn ima srednji put: s <code>worker_class = "gthread"</code> i <code>threads = 4</code> svaki radnik ima četiri dretve koje dijele njegovu memoriju, pa šest radnika
            istodobno drži 6 × 4 = 24 zahtjeva uz malo dodatnog RAM-a. Za aplikaciju koja većinom čeka bazu to je često prvi potez, prije kupnje RAM-a.
          </p>
        </DeepDive>
      </Section>

      {/* 3 ─ Try it: cores or RAM */}
      <Section
        id="jezgre-ili-ram"
        kicker="isprobajte"
        title="Jezgre ili RAM?"
        lead="Isti poslužitelj s dvije ili četiri jezgre, dvije vrste posla i tri veličine RAM-a. Stiže 30 zahtjeva u sekundi – više nego što ijedan može obraditi."
      >
        <p>Odaberite vrstu posla, broj jezgri i RAM. Brojke su izmjerene u simulaciji, a ispod crteža je isti račun na salveti kao maloprije.</p>
        <CoresOrRam />
        <MarginNote tone="red">RAM ≠ brzina!</MarginNote>
        <p>
          Kad posao čeka bazu, svaki dodatni gigabajt donosi četiri nova radnika, a <Term id="throughput">propusnost</Term> (engl. <em>throughput</em>, broj uspješnih odgovora u sekundi)
          uz dvije jezgre raste gotovo linearno: 5,7 → 13,3 → 26,9. Procesor se pritom budi: 16 % → 35 % → 72 %. S 8 GB već se približava koljenu, pa izmjerimo 26,9 umjesto 28,6. Uz još
          više RAM-a usko grlo postaje procesor (najviše 2 × 1000 / 50 = 40 odgovora u sekundi).
        </p>
        <p>
          Simulacija pretpostavlja da baza odgovara jednako brzo bez obzira na to koliko upita istodobno čeka. U stvarnosti više radnika znači više istodobnih upita, pa usko grlo može
          prijeći na bazu – o tome u sljedećem predavanju. Simulacija i broj radnika postavi sama: (RAM − 512 MB) / 256 MB. Na stvarnom poslužitelju to mijenjate u{' '}
          <code>gunicorn.conf.py</code>, a novi RAM sam od sebe ne donosi nove radnike.
        </p>
        <p>
          API po zahtjevu treba 200 ms procesora (uz 300 ms čekanja baze). Dvije jezgre stignu najviše 2 × 1000 / 200 = 10 takvih zahtjeva u sekundi, a šest radnika stiglo bi 6 / 0,5 s
          = 12. Procesora ponestane prije nego radnika, koliko god radnika poslužitelj imao. S 8 GB je čak malo gore: više radnika istodobno dijeli iste dvije jezgre, svaki zahtjev traje dulje, a
          dio ih istekne prije nego što klijent dobije odgovor. S četiri jezgre API dobije dvostruko više procesora – ali s 2 GB tada ponestane radnika (najviše 12 u sekundi), pa tek uz više
          RAM-a stigne gotovo do 20.
        </p>
        <Callout kind="warn" title="Ne poopćavajte: RAM ne ubrzava zahtjev">
          Ovdje RAM određuje koliko zahtjeva istodobno stane, a ne koliko se brzo jedan obradi. Baza podataka je druga priča: njoj RAM služi kao predmemorija (engl. <em>cache</em>) za podatke
          s diska, pa čitanje stvarno ubrzava. Do toga ćemo stići kod baza.
        </Callout>
      </Section>

      {/* 4 ─ Concept: the four numbers and percentiles */}
      <Section id="prosjek-laze" kicker="mjerenje" title="Četiri broja i prosjek koji laže" lead="Opterećenje opisujemo propusnošću, latencijom, greškama i iskorištenošću – i nikad samo prosjekom.">
        <p>Kad Davor u 12:05 piše izvještaj, ne piše „bilo je sporo”. Piše četiri broja:</p>
        <ul>
          <li>
            <strong>Propusnost</strong>: koliko zahtjeva u sekundi poslužitelj <em>uspješno</em> obradi. U 12:00 Klopa prima 12, a propusnost joj je 5,7.
          </li>
          <li>
            <strong>
              <Term id="latency">Latencija</Term>
            </strong>
            : koliko traje jedan zahtjev, od slanja do odgovora. Opisujemo je <Term id="percentile">percentilima</Term>: p50 znači da je polovica zahtjeva bila brža, p95 da je 95 % bilo
            brže, a p99 da je 99 % bilo brže.
          </li>
          <li>
            <strong>Stopa grešaka</strong>: udio zahtjeva koji su završili greškom – 503, istekom vremena ili odbijenom vezom. U 12:00: 51 %.
          </li>
          <li>
            <strong>
              <Term id="utilization">Iskorištenost</Term>
            </strong>
            : koliki je dio vremena neki resurs zauzet. U 12:00 procesor je zauzet 17 % vremena, a radnici 100 %.
          </li>
        </ul>
        <p>Zašto percentili, a ne prosjek? Dodajte nekoliko sporih zahtjeva i pratite brojke.</p>
        <TailHistogram />
        <MarginNote>p99 = svaki stoti student</MarginNote>
        <p>
          Četiri spora zahtjeva od dvjesto (2 %) prosjek pomaknu za manje od 10 % – a p99 poleti s 1,9 s na 6,1 s. Prosjek pomiješa brze i spore u broj koji ne opisuje nikoga. Klopa dnevno ima
          tisuće narudžbi: 2 % sporih su deseci studenata koji svaki dan čekaju po šest sekundi.
        </p>
        <Callout kind="tip" title="Brz 503 nije brz odgovor">
          Percentile računamo samo nad uspješnim zahtjevima, a greške brojimo posebno. Odbijen zahtjev vrati se za nekoliko milisekundi: kad bismo ga ubrojili u latenciju, Klopa bi pod
          naletom izgledala brža nego u mirno jutro.
        </Callout>
        <DeepDive title="Kako se točno računa p95?">
          <p>
            Uspješne zahtjeve poredamo od najbržeg do najsporijeg i uzmemo onaj na mjestu ⌈0,95 · n⌉ – to je metoda najbližeg ranga. Od 200 zahtjeva p95 je 190. po redu, a p99 198. po redu.
            Zato p99 ne primijeti rep sve dok spori nisu više od 1 % zahtjeva, a p95 dok nisu više od 5 %.
          </p>
          <p>
            Simulacije ovog tečaja računaju percentile nad uspješnim zahtjevima iz zadnjih 10 sekundi i pišu „n/a” kad ih je manje od 20 – za rep je to premalo podataka.
          </p>
        </DeepDive>
      </Section>

      {/* 5 ─ Concept: the hockey stick */}
      <Section id="hokejaska-palica" kicker="koncept" title="Hokejaška palica" lead="Latencija ne raste ravnomjerno s prometom: dugo se gotovo ne mijenja, a onda naglo poleti.">
        <Predict
          question="Promet raste ravnomjerno, a poslužitelj prelazi s 50 % na 90 % iskorištenosti. Što se događa s vremenom koje zahtjev provede u sustavu?"
          options={['Raste ravnomjerno, otprilike za 80 %', 'Gotovo se ne mijenja dok ne dođe do 100 %', 'Raste sve brže: pri 90 % zahtjev je u sustavu pet puta dulje nego pri 50 %']}
          correct={2}
          explain="U jednostavnom modelu reda čekanja (M/M/1) vrijeme u sustavu je S / (1 − ρ), gdje je ρ iskorištenost, a S vrijeme same obrade: pri 50 % to je 2 × S, a pri 90 % 10 × S – pet puta više. Krivulja izgleda kao hokejaška palica."
          then="Pomičite klizač na krivulji ispod."
        />
        <HockeyStick />
        <p>
          Zašto? Zahtjevi ne stižu ravnomjerno, nego nasumično: ponekad tri u istoj milisekundi, ponekad nijedan pola sekunde. Kad poslužitelj stoji besposlen, to je vrijeme zauvijek
          izgubljeno. Kad se zahtjevi zbiju, čekaju u redu. Što je iskorištenost veća, to je manje praznog hoda u kojem bi se red ispraznio – i red raste sve brže.
        </p>
        <p>
          Više paralelnih radnika pomiče koljeno udesno. S četiri radnika (c = 4) zahtjev pri 95 % iskorištenosti provede u sustavu oko 5,5 puta dulje od same obrade, a ne 20 puta kao s jednim.
          Ali koljeno ne nestaje.
        </p>
        <p>
          Kod Klope je usko grlo bazen radnika, a ne procesor. U 11:58 u prosjeku su bila zauzeta oko 4 od 6 radnika – iskorištenost radnika oko 70 %, iako je procesor bio na 11 %.
          Nasumični dolasci povremeno zauzmu svih šest, pa sljedeći zahtjev čeka u redu. Zato je p95 već tada bio 1,6 s, a ne 1,15 s koliko bi bio na posve praznom poslužitelju.
        </p>
        <Myth myth="70 % CPU-a znači 30 % rezerve.">
          U modelu M/M/1 zahtjev pri 70 % iskorištenosti već provodi u sustavu 3,3 puta dulje od same obrade, a pri 90 % 10 puta. Tih „30 % rezerve” zapravo je koljeno krivulje. S više
          jezgri koljeno je dalje udesno (pri 70 %: s dvije oko 2 puta, s četiri oko 1,4 puta), ali i dalje postoji – zato se kapacitet planira s rezervom, a ne do 100 %.
        </Myth>
        <DeepDive title="Littleov zakon: L = λ · W">
          <p>
            Prosječan broj zahtjeva u sustavu (L) jednak je broju dolazaka u sekundi (λ) puta prosječnom vremenu u sustavu (W). Vrijedi za svaki stabilan sustav, bez obzira na to kako
            zahtjevi dolaze.
          </p>
          <p>
            Klopa u 11:58: λ = 4 u sekundi, prosječno W ≈ 1,17 s (izmjereni prosjek), pa je L ≈ 4,7 zahtjeva istodobno: oko 4,2 kod radnika (4 × 1,05 s), a ostatak (≈ 0,5) čeka u
            redu. Zakon vrijedi i za dio sustava, pa i
            obrnuto: ako kod radnika smije biti najviše 6 zahtjeva (L), a svaki traje 1,05 s (W), van ih može izlaziti najviše λ = L / W ≈ 5,7 u sekundi. To je broj iz incidenta.
          </p>
        </DeepDive>
      </Section>

      {/* 6 ─ Concept: vertical scaling, SPOF, availability */}
      <Section
        id="veci-posluzitelj"
        kicker="koncept"
        title="Veći poslužitelj – i gdje prestaje"
        lead="Vertikalno skaliranje često je pravi prvi potez. Ali ima tri granice: strop, prekid pri svakoj promjeni i jedno računalo."
      >
        <p>
          Najjednostavniji odgovor na podne je jači poslužitelj. To se zove <Term id="vertical-scaling">vertikalno skaliranje</Term> (engl. <em>scale up</em>): kod ostaje isti, nema novih
          dijelova sustava, a račun je lako napraviti. Zato je to često pravi prvi potez.
        </p>
        <BiggerServer />
        <p>Cijena nije problem: unutar iste obitelji poslužitelja u oblaku dvostruko veći stroj stoji otprilike dvostruko više. Problemi su tri:</p>
        <ol className={styles.salveta}>
          <li>
            <strong>Strop.</strong> Ponuda negdje završava. Klopin pružatelj staje na 8 vCPU i 16 GB; veliki oblaci nude mnogo veće strojeve, ali i oni imaju najveći.
          </li>
          <li>
            <strong>Prekid.</strong> Promjena veličine virtualnog poslužitelja obično znači ugasiti ga i ponovno upaliti: nekoliko minuta Klope nema.
          </li>
          <li>
            <strong>Jedno računalo.</strong> Najveći poslužitelj pada jednako kao i najmanji. Dio sustava čiji kvar ruši sve zove se{' '}
            <Term id="single-point-of-failure">jedinstvena točka kvara</Term> (engl. <em>single point of failure</em>, SPOF).
          </li>
        </ol>
        <Callout kind="fact" title="Koliki je strop?">
          Najveći virtualni poslužitelji velikih pružatelja oblaka imaju stotine procesorskih jezgri i terabajte RAM-a. Kod većine pružatelja promjena veličine virtualnog stroja traži da se
          stroj zaustavi i ponovno pokrene.
        </Callout>
        <p>
          Koliko smije Klopa biti nedostupna? Mjera za to je <Term id="availability">dostupnost</Term>: udio vremena u kojem sustav ispravno odgovara. Obično se piše u „devetkama”, a svaka
          nova devetka smanjuje dopuštenu nedostupnost deset puta.
        </p>
        <NinesTable />
        <p>
          Primjer: obećanje od 99,9 % u mjesecu od 30 dana dopušta 0,001 × 30 × 24 × 60 = 43,2 minute nedostupnosti. Jedan kvar napajanja od dva sata potroši to gotovo trostruko.
        </p>
      </Section>

      {/* 7 ─ Flagship simulation */}
      <Section id="simulacija" kicker="simulacija" title="Jedan poslužitelj protiv ručka" lead="Sve zajedno: promet, nalet u 12:00, jezgre, RAM, veći poslužitelj i izvučeni utikač.">
        <p>
          Simulacija kreće kao incident: Klopini zahtjevi čekaju bazu, poslužitelj ima 2 vCPU i 2 GB, dolaze 4 zahtjeva u sekundi, a u 12:00 stiže nalet ×3. Gumb „Ponovi isti promet”
          pokreće isti promet (isti seed) s vašim postavkama, pa poslužitelje uspoređujete pod jednakim uvjetima. Nakon svakog naleta ispod grafova se pojavi mjerenje – na početku iste
          brojke kao na kartici incidenta.
        </p>
        <LunchSim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>Kad su svi radnici zauzeti i red pun, vratar ispred njih odbija zahtjeve (503) – uz procesor na 17 %.</li>
            <li>Više RAM-a pomaže samo kad je usko grlo broj radnika. Za posao koji računa (API, CPU) ne mijenja ništa ili je čak gore.</li>
            <li>
              Neograničeni radnici ne rješavaju ništa: radnici pojedu RAM, operacijski sustav ubije proces (<Term id="oom">OOM</Term>), Klopa se ponovno pokreće – i opet.
            </li>
            <li>Dulji red (Napredno, 30 mjesta) ne spašava: zahtjevi čekaju predugo, klijenti odustaju (u simulaciji nakon 5 s), a poslužitelj radi uzaludan posao.</li>
            <li>Svaka promjena veličine i izvučeni utikač znače da Klopa ne odgovara – dostupnost pada. A dostupnost pada i dok proces radi: kad pola zahtjeva dobije 503, uspješno je samo pola.</li>
          </ul>
        </Callout>
        <DeepDive title="Tko vraća 503, a tko 502?">
          <p>
            U simulaciji poslužitelj s punim redom odmah odgovara 503 – kao da ispred radnika stoji vratar koji broji slobodna mjesta. Takvog vratara obično glumi proxy ispred aplikacije
            (kao Caddy iz prošlog predavanja): npr. HAProxy s ograničenjem istodobnih zahtjeva po poslužitelju i redom ispred njega (<code>maxconn</code>, <code>maxqueue</code>) ili nginx s
            ograničenjem broja veza (<code>limit_conn</code>). Višak odbijaju upravo greškom 503. Takvo namjerno odbacivanje viška zahtjeva zove se odbacivanje opterećenja (engl.{' '}
            <em>load shedding</em>).
          </p>
          <p>
            U Klopinoj priči Davor je ispred gunicorna postavio takav ograničivač. S golim Caddyjem i gunicornom studenti bi umjesto brzog 503 gledali spinner, a onda 502 ili istek vremena.
          </p>
          <p>
            Sam gunicorn ne vraća 503: višak veza čeka u redu operacijskog sustava (postavka <code>backlog</code>, zadano 2048) dok klijent ne odustane. To je „predugi red” iz Naprednih
            postavki: umjesto brzog „ne” studenti dobiju sporo „ništa”.
          </p>
          <p>
            Simulacija mjeri poslužitelj izravno, kao da ispred njega nema Caddyja, pa pad procesa vidi kao odbijenu vezu. Student koji Klopu otvara kroz Caddy tada dobije 502 Bad
            Gateway: Caddy radi, ali mu gunicorn ne odgovara – kao u prošlom predavanju. A kad se izvuče utikač, ne radi ni Caddy, pa preglednik čeka dok ne odustane.
          </p>
        </DeepDive>
      </Section>

      {/* 8 ─ Code */}
      <Section id="kod" kicker="kod" title="Radnici, test opterećenja i htop" lead="Ono što ste vidjeli u animacijama, u stvarnim datotekama: broj radnika, test koji ponavlja podne i snimka poslužitelja u 12:00.">
        <p>Broj radnika nije čarolija nego jedna postavka. Evo Klopine postavke, iste postavke u PHP-u i, za usporedbu, Node.js-a, koji radi drukčije:</p>
        <Tabs
          tabs={[
            {
              label: 'gunicorn',
              content: (
                <CodeBlock
                  code={gunicornConf}
                  lang="python"
                  title="gunicorn.conf.py"
                  mode="open"
                  caption="Postavke Klopina API-ja: šest sinkronih radnika na 2 GB."
                  notes={[
                    { lines: '2', text: 'kao u prošlom predavanju: Caddy je ispred' },
                    { lines: '5-8', text: '6 radnika = 6 tanjura iz animacije' },
                    { lines: '11', text: 'red operacijskog sustava: ne vraća 503, nego čeka' },
                  ]}
                />
              ),
            },
            {
              label: 'PHP-FPM',
              content: (
                <CodeBlock
                  code={fpmConf}
                  lang="ini"
                  title="www.conf"
                  mode="open"
                  caption="Isti bazen radnika u PHP-u: pm.max_children je gornja granica."
                  notes={[
                    { lines: '8-9', text: 'isti račun: koliko procesa stane u RAM' },
                    { lines: '14-15', text: 'ovaj redak u dnevniku = svi radnici zauzeti' },
                  ]}
                />
              ),
            },
            {
              label: 'Node.js (usporedba)',
              content: (
                <>
                  <CodeBlock
                    code={pm2Conf}
                    lang="javascript"
                    title="ecosystem.config.js"
                    mode="open"
                    caption="Node.js nema radnika po zahtjevu: jedan proces po jezgri poslužuje mnogo zahtjeva."
                    notes={[{ lines: '8', text: 'proces po jezgri: JavaScript radi na jednoj' }]}
                  />
                  <CodeBlock
                    code={dbJs}
                    lang="javascript"
                    title="db.js"
                    mode="open"
                    caption="Koliko upita istodobno čeka bazu, određuje bazen veza."
                    notes={[{ lines: '7', text: 'usko grlo se seli u bazen veza' }]}
                  />
                </>
              ),
            },
          ]}
        />
        <p>
          Kako provjeriti koliko poslužitelj podnese prije nego što to učine studenti? <Term id="load-test">Testom opterećenja</Term>. Ovaj test u alatu k6 ponavlja ponedjeljak: 4 zahtjeva u
          sekundi, pa nalet ×3.
        </p>
        <CodeBlock
          code={k6Script}
          lang="javascript"
          title="k6-podne.js"
          caption={
            <>
              Pokreće se naredbom <code>k6 run k6-podne.js</code>; na kraju ispiše zahtjeve u sekundi, p95 i udio grešaka. k6 šalje ravnomjerno, a studenti stižu nasumično, pa
              stvarni p95 bude malo gori.
            </>
          }
          previewLines={28}
          notes={[
            { lines: '6', text: 'ciljajte kopiju Klope, ne onu za ručak' },
            { lines: '11', text: 'stalan tempo bez obzira na odgovore (otvoreni model)' },
            { lines: '18-19', text: 'nalet u 12:00: ×3 tijekom 30 s' },
            { lines: '25-26', text: 'p95 samo uspješnih – brz 503 se ne računa' },
          ]}
        />
        <Callout kind="warn" title="Samo prema svojim poslužiteljima">
          Test opterećenja prema tuđem poslužitelju izgleda kao napad uskraćivanjem usluge (DoS). Pokrećite ga samo prema svom poslužitelju – najbolje prema kopiji Klope, a ne prema onoj koju
          studenti upravo koriste.
        </Callout>
        <p>I na kraju, što je Davor vidio u 12:00:</p>
        <CodeBlock
          code={htopSnap}
          lang="text"
          title="htop (snimka u 12:00)"
          mode="open"
          caption="Isječak iz htop-a: jezgre odmaraju, a svih šest radnika je zauzeto."
          notes={[
            { lines: '1-2', text: 'obje jezgre gotovo besposlene' },
            { lines: '3', text: 'RAM pun: 6 × 256 MB + sustav' },
            { lines: '7-11', text: 'S: radnik spava – čeka odgovor baze' },
            { lines: '12', text: 'R: jedini koji upravo računa' },
          ]}
        />
        <Terminal
          title="Klopin poslužitelj"
          lines={[
            { comment: 'Ima li mjesta za sedmog radnika?' },
            { cmd: 'free -m' },
            { out: FREE_M, note: 'available: 186 MB – sedmi radnik od 256 MB ne stane', who: 'davor' },
          ]}
        />
      </Section>

      {/* 9 ─ Misconceptions, recap and self-check */}
      <Section id="sazetak" kicker="sažetak" title="Zablude, sažetak i provjera" lead="Pet tvrdnji koje se često čuju, pet stvari za zapamtiti i šest pitanja.">
        <MythOrFact
          items={[
            {
              statement: 'Više RAM-a znači brži poslužitelj',
              fact: false,
              explain:
                'Za aplikacijski poslužitelj RAM određuje koliko zahtjeva istodobno stane, a jezgre koliko ih se obradi u sekundi. Ako je usko grlo procesor, više RAM-a ne pomaže. Bazi podataka RAM služi kao predmemorija i čitanje stvarno ubrzava – ali to je druga priča.',
            },
            {
              statement: 'Poslužitelj može odbijati zahtjeve dok mu je procesor na 17 %',
              fact: true,
              explain: 'Ako zahtjevi većinom čekaju bazu, svi radnici mogu biti zauzeti dok jezgre odmaraju. Tada je usko grlo broj radnika, a njega ograničava RAM.',
            },
            {
              statement: 'Latencija raste linearno s opterećenjem',
              fact: false,
              explain: 'Raste kao 1 / (1 − ρ) (model M/M/1): dugo gotovo ravno, a blizu 100 % naglo. Više paralelnih radnika pomiče koljeno udesno, ali ga ne uklanja.',
            },
            {
              statement: 'Prosječna latencija je dovoljna',
              fact: false,
              explain: 'Prosjek skriva rep. Pratite p95 i p99: nekoliko posto sporih zahtjeva jedva pomakne prosjek, a p99 poleti.',
            },
            {
              statement: 'Vertikalno skaliranje je zastarjelo',
              fact: false,
              explain: 'Često je pravi prvi potez: nema promjene koda ni novih dijelova sustava. Granice su strop, prekid pri promjeni veličine i jedinstvena točka kvara.',
            },
          ]}
        />
        <Recap
          points={[
            'Opterećenje opisujemo četirima brojevima: propusnost (uspješnih odgovora u sekundi), latencija kao p50, p95 i p99 uspješnih zahtjeva, stopa grešaka (posebno) i iskorištenost.',
            'Procesorske jezgre određuju propusnost, a RAM koliko radnika istodobno stane. Kad zahtjevi čekaju bazu, poslužitelj može biti pun dok procesor odmara (kod Klope 17 %).',
            'Blizu 100 % iskorištenosti latencija ne raste ravnomjerno nego eksplodira: S / (1 − ρ). Više radnika pomiče koljeno, ali ga ne uklanja.',
            'Vertikalno skaliranje je dobar prvi korak, ali ima strop, prekid pri svakoj promjeni i ostaje jedinstvena točka kvara.',
            'Dostupnost se mjeri devetkama: 99,9 % dopušta 43,2 minute nedostupnosti u 30 dana, a 99,99 % samo 52,6 minuta godišnje.',
          ]}
        />
        <StoryMap at="02" />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Petak, 12:00. U <code>htop</code> procesor je na 12 %, a svih 6 radnika gunicorna je zauzeto. <code>free -m</code> u stupcu <code>available</code> pokazuje 180 MB. Studenti
                  dobivaju 503. Koji potez najviše pomaže?
                </>
              ),
              options: ['Poslužitelj s više procesorskih jezgri i istim RAM-om', 'Poslužitelj s više RAM-a, pa više radnika', 'Dulji red čekanja (30 mjesta umjesto 10)', 'workers = 12 na istom poslužitelju'],
              correct: 1,
              explain:
                'Procesor odmara, a radnici su puni: usko grlo je broj radnika, a njega ograničava RAM. Više jezgri ne bi promijenilo ništa. Dulji red samo pretvara brz 503 u sporo čekanje. A 12 radnika po 256 MB ne stane u 2 GB: operacijski sustav ubije proces (OOM).',
            },
            {
              q: 'Od 100 uspješnih zahtjeva 97 traje 0,2 s, a 3 traju 8 s. Koliki su p95 i p99?',
              options: ['p95 = 0,2 s, p99 = 8 s', 'p95 = 8 s, p99 = 8 s', 'p95 = 0,43 s, p99 = 0,43 s', 'p95 = 0,2 s, p99 = 0,2 s'],
              correct: 0,
              explain: 'Poredamo ih: p95 je 95. zahtjev po redu (0,2 s), a p99 99. po redu – među tri spora (8 s). Prosjek je 0,43 s i ne opisuje nikoga.',
            },
            {
              q: 'Poslužitelj je na 50 % iskorištenosti, a onda promet naraste pa je na 90 %. Koliko se puta, prema modelu M/M/1, produlji prosječno vrijeme zahtjeva u sustavu?',
              options: ['1,8 puta – koliko je narastao promet', '5 puta', 'Ne mijenja se dok ne dođe do 100 %', 'Beskonačno'],
              correct: 1,
              explain: 'S / (1 − ρ): pri 0,5 to je 2 × S, a pri 0,9 10 × S, dakle pet puta dulje – iako je promet narastao samo 1,8 puta.',
            },
            {
              q: 'Pružatelj obećava 99,9 % dostupnosti u mjesecu od 30 dana. Koliko nedostupnosti to dopušta?',
              options: ['oko 4 minute', 'oko 43 minute', 'oko 7 sati', 'oko 9 sati'],
              correct: 1,
              explain: '0,1 % od 30 × 24 × 60 = 43 200 minuta je 43,2 minute. Oko 7 sati u 30 dana dopušta 99 %, a 8,76 h je 99,9 % za cijelu godinu.',
            },
            {
              q: 'Davor je Klopu preselio na 4 vCPU i 8 GB. Što time nije riješio?',
              options: ['Propusnost za podnevni nalet', 'Pad Klope kad padne taj jedan poslužitelj', 'Broj radnika za zahtjeve koji čekaju bazu', 'Odbijanje zahtjeva (503) pri 12 zahtjeva u sekundi'],
              correct: 1,
              explain: 'Veći poslužitelj donosi kapacitet, ali je i dalje jedno računalo – jedinstvena točka kvara. Kad ono stane, stane cijela Klopa.',
            },
            {
              q: (
                <>
                  Ponovimo prošlo predavanje. Klopa radi iza Caddyja, a gunicorn sluša na <code>127.0.0.1:8000</code>. Proces gunicorna upravo je pao (OOM) i još se nije ponovno pokrenuo.
                  Davor na samom poslužitelju pokrene <code>curl http://127.0.0.1:8000</code>, a Petra na mobitelu otvori <code>https://klopa.example</code>. Što dobivaju?
                </>
              ),
              options: [
                'Oboje dobiju 503 Service Unavailable',
                'Davor odbijenu vezu, a Petra 502 Bad Gateway od Caddyja',
                'Davor 502 Bad Gateway, a Petra odbijenu vezu',
                'Oboje čekaju dok ne istekne vrijeme',
              ],
              correct: 1,
              explain:
                'Na portu 8000 nitko ne sluša, pa operacijski sustav Davorovu vezu odmah odbije – to je „odbijeno” iz simulacije. Petrinu vezu prihvati Caddy, koji i dalje radi, ali njegovu vezu prema gunicornu operacijski sustav odbije, pa Petri odgovara Caddy: 502. Čekali bi oboje da je cijeli stroj ugašen (izvučen utikač).',
            },
          ]}
        />
      </Section>

      {/* 10 ─ Cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Klopa sada radi na 4 vCPU i 8 GB RAM-a: 30 radnika i do ≈ 29 odgovora u sekundi – više nego dvostruko od podnevnog naleta.',
            'Znamo mjeriti opterećenje: propusnost, p95 i p99, greške i iskorištenost.',
            'Znamo pronaći usko grlo: procesor ili radnike (RAM).',
          ]}
          paid={[
            'Svaka promjena veličine značila je nekoliko minuta bez Klope.',
            'Račun (ilustrativno) narastao je s 15 € na 36 €: pružatelj prodaje gotove veličine, pa plaćamo i jezgre koje Klopi u podne ne trebaju (u simulaciji je bio dovoljan 1 vCPU / 8 GB za 18 €).',
            'Sljedeća veličina u ponudi je i zadnja – nakon nje „Nema većeg”.',
            'I dalje je to jedno računalo: kad ono stane, stane cijela Klopa.',
          ]}
          next="Davor je poslužitelj povećao na četiri procesorske jezgre i 8 GB RAM-a. U petak u 12:03 pružatelj ima kvar napajanja i Klope nema dva sata, baš za ručak – a ispitni rok tek dolazi. „Kupimo drugi poslužitelj!”"
        />
      </Section>
    </>
  )
}

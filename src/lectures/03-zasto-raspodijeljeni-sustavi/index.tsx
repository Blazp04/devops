import { Analogy, Callout, CodeBlock, CostNote, DeepDive, Figure, IncidentCard, KeyIdea, MarginNote, Mark, MythOrFact, Predict, Quiz, Recap, Section, StoryMap, Term, Terminal } from '../../kit'
import { PRESETS, averageYears, fmtHours, incidentYear, num, pctA } from './model'
import { HookScene } from './sims/HookScene'
import { ScaleStepper } from './sims/ScaleStepper'
import { ReasonCards } from './sims/ReasonCards'
import { RttCalc } from './sims/RttCalc'
import { NeedChecklist } from './sims/NeedChecklist'
import { AnyDownGrid, MtbfWidget, RedundancyMultiples } from './sims/NinesMath'
import { AmdahlChart, BottleneckExplorer, UslChart } from './sims/Throughput'
import { NetworkStepper } from './sims/NetworkStepper'
import { TimeoutGame } from './sims/TimeoutGame'
import { AvailabilityArchitect } from './sims/AvailabilityArchitect'
import { DnsStepper } from './sims/DnsStepper'
import availabilityTs from './code/availability.ts?raw'
import mjerenjeSh from './code/mjerenje.sh?raw'
import styles from './styles.module.css'

// the incident card's numbers: preset „Jedan” (Jedan poslužitelj), seed 320, one whole year in the flagship sim
const INC = incidentYear()
// what the default architecture gives on average (100 seeded years): the answer to the Predict before the flagship
const AVG_DVA = averageYears(PRESETS.dva.arch)

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook / incident */}
      <Section id="petak" kicker="priča" title="Petak, 12:03: dva sata bez Klope" lead="Jedan poslužitelj, jedan kvar napajanja, jedan izgubljeni ručak. Rješenje se samo nameće – ali je li dobro?">
        <IncidentCard
          no={3}
          when="petak, 12:03"
          title="Kvar napajanja kod pružatelja: Klope nema dva sata"
          who="davor"
          says={['Nema struje!', 'Klopa je pala!']}
          preset="„Jedan” u Arhitektu dostupnosti"
          seed={320}
          metrics={[
            { label: 'ispad', value: '2 h', tone: 'bad' },
            { label: 'nedostupno u godini', value: fmtHours(INC.downtimeH), tone: 'bad' },
            { label: 'izgubljeni ručkovi', value: num(INC.lunchesLost), tone: 'bad' },
            { label: 'dostupnost', value: pctA(INC.availability), tone: 'warn' },
          ]}
        >
          Jedini poslužitelj, Veliki (4 vCPU, 8 GB), ne radi od 12:03 do 14:03 – točno za ručak. Ostale tri brojke su cijela simulirana godina s jednim takvim poslužiteljem (simulacija broji cijele sate: taj petak je dan 222 · 12:00, 2 h).
        </IncidentCard>
        <p>
          U prošlom predavanju Davor je Klopu preselio na veliki poslužitelj i podne je prestalo biti problem. Onda je u petak pružatelj ostao bez struje. Poslužitelj nije bio preopterećen ni loše konfiguriran – jednostavno ga nije
          bilo. Dva sata nitko nije mogao naručiti ručak, a ispitni rok tek dolazi.
        </p>
        <p>
          Davor ima rješenje: „Kupimo drugi poslužitelj!” Lana postavlja pitanje koje ćemo cijelo predavanje razmatrati: <strong>„Hoće li onda Klopa biti dvostruko brža i dvostruko pouzdanija?”</strong>
        </p>
        <Figure caption="Lanino pitanje prati nas cijelo predavanje: što točno kupujemo drugim poslužiteljem?">
          <HookScene />
        </Figure>
        <p>
          Kratki odgovor: ne baš. Više računala donosi stvarne koristi, ali i potpuno novu vrstu problema. Prije kupnje pogledajmo oboje – i izračunajmo koliko što vrijedi.
        </p>
      </Section>

      {/* 2 ─ Concept: three reasons */}
      <Section id="tri-razloga" kicker="koncept" title="Tri razloga za više računala" lead="Tri su glavna tehnička razloga da aplikaciju raširimo na više računala – bez njih je jedan poslužitelj gotovo uvijek bolji izbor.">
        <p>
          Kad jednom poslužitelju postane tijesno, imamo dva puta. <Term id="vertical-scaling">Vertikalno skaliranje</Term> (engl. <em>scale up</em>) znači kupiti veći stroj – to smo radili u prošlom predavanju.{' '}
          <Term id="horizontal-scaling">Horizontalno skaliranje</Term> (engl. <em>scale out</em>) znači kupiti više strojeva. Pogledajmo razliku korak po korak.
        </p>
        <ScaleStepper />
        <p>
          Ono što nastaje u zadnjem koraku zove se <Term id="distributed-system">raspodijeljeni sustav</Term> (engl. <em>distributed system</em>; u dijelu literature i <em>distribuirani sustav</em>): više računala koja surađuju šaljući
          si poruke preko mreže, a korisniku izgledaju kao jedna aplikacija. Zašto bismo se time zamarali? Zbog jednog od tri razloga:
        </p>
        <ReasonCards />
        <MarginNote>svjetlost: ≈ 200 km po milisekundi u vlaknu</MarginNote>
        <p>
          Treći razlog često se podcjenjuje jer ga ne može popraviti nikakav brži procesor. Svjetlost u optičkom vlaknu prijeđe oko 200&nbsp;km u milisekundi, pa svakih 100&nbsp;km udaljenosti dodaje barem 1&nbsp;ms{' '}
          <Term id="rtt">vremenu povratnog puta</Term> (engl. <em>round-trip time</em>, RTT). A nova HTTPS veza preko TCP-a prije prvog bajta odgovora treba tri povratna puta: jedan za TCP, jedan za TLS (uz TLS 1.3; stariji TLS 1.2 treba dva) i jedan za sam HTTP zahtjev. Odaberite gdje
          bi Klopa iznajmila poslužitelj:
        </p>
        <RttCalc />
        <p>
          To su <strong>donje granice</strong> – fizika. Stvarni RTT uvijek je dulji: kabeli ne idu ravnom crtom, a paketi putem čekaju u redovima usmjerivača. Zato globalne aplikacije stavljaju poslužitelje (ili barem predmemorije)
          blizu korisnika. Klopa to ne treba: svi njezini korisnici sjede u istom kampusu.
        </p>
        <CodeBlock
          title="mjerenje.sh"
          lang="bash"
          mode="closed"
          code={mjerenjeSh}
          caption="Izmjerite RTT sami: ping, mtr i curl koji rastavi novu HTTPS vezu na TCP, TLS i prvi bajt."
          notes={[
            { lines: '3-4', text: 'upišite svoje poslužitelje – blizu i daleko' },
            { lines: '15-17', text: 'TCP ≈ 1, TLS ≈ 2, prvi bajt ≈ 3 povratna puta' },
            { lines: '20', text: '--max-time: timeout, o njemu uskoro' },
          ]}
        />
        <Terminal
          title="primjer ispisa (vaše će brojke biti drukčije)"
          lines={[
            { cmd: 'ping -c 5 "$BLIZU"' },
            {
              out: '64 bytes from 192.0.2.10: icmp_seq=1 ttl=57 time=4.82 ms\n64 bytes from 192.0.2.10: icmp_seq=2 ttl=57 time=5.07 ms\n64 bytes from 192.0.2.10: icmp_seq=3 ttl=57 time=4.91 ms\n64 bytes from 192.0.2.10: icmp_seq=4 ttl=57 time=4.88 ms\n64 bytes from 192.0.2.10: icmp_seq=5 ttl=57 time=5.02 ms',
            },
            { cmd: 'ping -c 5 "$DALEKO"' },
            {
              out: '64 bytes from 198.51.100.20: icmp_seq=1 ttl=48 time=291 ms\n64 bytes from 198.51.100.20: icmp_seq=2 ttl=48 time=290 ms\n64 bytes from 198.51.100.20: icmp_seq=3 ttl=48 time=292 ms\n64 bytes from 198.51.100.20: icmp_seq=4 ttl=48 time=290 ms\n64 bytes from 198.51.100.20: icmp_seq=5 ttl=48 time=291 ms',
              note: 'Do Sydneya ispod ~160 ms ne ide – to je fizika.',
              who: 'davor',
            },
            { cmd: String.raw`curl -s -o /dev/null -w 'TCP: %{time_connect} s\nTLS: %{time_appconnect} s\nprvi bajt: %{time_starttransfer} s\n' "https://$DALEKO/"` },
            { out: 'TCP: 0.293 s\nTLS: 0.587 s\nprvi bajt: 0.884 s' },
          ]}
        />
      </Section>

      {/* 3 ─ Feel it: do you need this at all? */}
      <Section id="trebate-li" kicker="isprobajte" title="Trebate li to uopće?" lead="Mnoge aplikacije godinama sasvim dobro rade na jednom poslužitelju. Raspodijeljeni sustav je alat, a ne nagrada.">
        <p>
          Prije nego što kupimo drugi poslužitelj, provjerimo vrijedi li za Klopu ijedan od tri razloga. Označite što vrijedi za vašu aplikaciju – ili pritisnite „Ispuni za Klopu”.
        </p>
        <NeedChecklist />
        <p>
          Klopa ima jedan razlog, i to dostupnost. Za to joj trebaju <strong>kopije iste aplikacije</strong> na više poslužitelja – to se zove <em>replikacija</em>. Ne treba je rastaviti na mnogo malih aplikacija.
        </p>
        <DeepDive title="Replikacija ili mikroservisi?">
          <p>
            Postoje dva vrlo različita načina da aplikacija radi na više računala. <strong>Replikacija</strong>: ista aplikacija pokrenuta N puta, svaka kopija može obraditi bilo koji zahtjev. Tako ćemo skalirati Klopu.{' '}
            <strong>Razlaganje</strong> (mikroservisi): aplikacija se razbije na dijelove (narudžbe, plaćanja, obavijesti) koji razgovaraju preko mreže i koje mogu razvijati različiti timovi.
          </p>
          <p>
            Mikroservisi rješavaju organizacijski problem velikih timova, a donose sve probleme ovog predavanja – i to između svakog para dijelova. Za mali tim i jednu aplikaciju replikacija je gotovo uvijek bolji prvi korak.
          </p>
        </DeepDive>
        <Callout kind="tip" title="Vertikalno nije sramota">
          Veći poslužitelj često je pravi prvi korak: kod se ne mijenja, a cijena u oblaku unutar iste obitelji strojeva raste otprilike linearno s brojem procesorskih jezgri i količinom RAM-a (dvostruko veći stroj ≈ dvostruko skuplji). Granice su strop (najveći stroj u ponudi) i to što je stroj i dalje jedan – jedinstvena točka
          kvara.
        </Callout>
      </Section>

      {/* 4 ─ Concept: availability maths */}
      <Section id="devetke" kicker="koncept" title="Matematika devetki" lead="Koliko dostupnosti kupuje drugi poslužitelj? Izračunajmo – pa pogledajmo gdje računica prestaje vrijediti.">
        <p>
          <Term id="availability">Dostupnost</Term> (A) je udio vremena u kojem sustav radi. Iz prošlog predavanja znate da 99&nbsp;% zvuči odlično, a znači 87,6&nbsp;h nedostupnosti godišnje:
        </p>
        <table className={styles.ninesTable}>
          <thead>
            <tr>
              <th>dostupnost</th>
              <th>nedostupno godišnje</th>
              <th>u 30 dana</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>99 %</td>
              <td>87,6 h</td>
              <td>7,2 h</td>
            </tr>
            <tr>
              <td>99,9 %</td>
              <td>8,76 h</td>
              <td>43,2 min</td>
            </tr>
            <tr>
              <td>99,99 %</td>
              <td>52,6 min</td>
              <td>4,3 min</td>
            </tr>
            <tr>
              <td>99,999 %</td>
              <td>5,3 min</td>
              <td>26 s</td>
            </tr>
          </tbody>
        </table>
        <h3>Odakle dolazi broj</h3>
        <p>
          Svaka komponenta ponekad se pokvari, a onda je neko vrijeme popravljamo. Prosječno vrijeme između kvarova zove se <Term id="mtbf">MTBF</Term> (engl. <em>mean time between failures</em>), a prosječno vrijeme popravka{' '}
          <Term id="mttr">MTTR</Term> (engl. <em>mean time to repair</em>). Dostupnost je jednostavno udio vremena u kojem radi:
        </p>
        <MtbfWidget />
        <p>
          Primijetite da dostupnost možete podići na dva načina: rjeđim kvarovima (veći MTBF) ili bržim popravkom (manji MTTR). U praksi je drugi često jeftiniji – brže otkrivanje, rezervni dio na skladištu, automatsko ponovno
          pokretanje.
        </p>
        <h3>U nizu i paralelno</h3>
        <p>
          Kad zahtjev mora proći kroz <strong>sve</strong> dijelove – ulaz (DNS i mreža pružatelja preko kojih zahtjev stiže), poslužitelj i bazu – dijelovi su <em>u nizu</em> i dostupnosti se množe – lanac je uvijek slabiji od svake svoje karike. Kad je dovoljno da radi{' '}
          <strong>barem jedan</strong> od nekoliko jednakih dijelova, oni su <em>paralelno</em>, i to je <Term id="redundancy">redundancija</Term>: sustav ne radi samo ako su svi pali odjednom.
        </p>
        <RedundancyMultiples />
        <p>
          Sad Klopa kao lanac: ulaz od 99,99&nbsp;%, dva poslužitelja aplikacije od 99&nbsp;% (paralelno: 99,99&nbsp;%) i jedna baza od 99,9&nbsp;%. Ukupno 0,9999 × 0,9999 × 0,999 ≈ <Mark>99,88&nbsp;%</Mark>, oko 10,5&nbsp;h godišnje.
          Primijetite tko je kriv: poslužitelj aplikacije smo udvostručili, a baza je ostala jedna – i ona određuje cijeli lanac.
        </p>
        <h3>Više dijelova, više kvarova</h3>
        <p>
          Redundancija ima i drugu stranu. Što više poslužitelja imate, to je vjerojatnije da je <em>neki</em> od njih upravo pokvaren. Uz deset poslužitelja od 99&nbsp;% barem jedan je dolje oko 9,6&nbsp;% vremena. Pogledajte
          sami:
        </p>
        <AnyDownGrid />
        <Callout kind="warn" title="Kad formula za paralelni spoj laže">
          <ul>
            <li>
              <strong>Kvarovi nisu neovisni.</strong> Isti ormar, isto napajanje, ista loša konfiguracija ili isti bug ruše sve kopije odjednom.
            </li>
            <li>
              <strong><Term id="failover">Preuzimanje rada</Term> nije trenutačno.</strong> Dok netko ne primijeti da je poslužitelj pao, promet i dalje ide na njega.
            </li>
            <li>
              <strong>Preživjeli nemaju dovoljno kapaciteta.</strong> Dva poslužitelja koji nose po 70&nbsp;% vršnog prometa: kad jedan padne, drugi dobije 143&nbsp;% svog kapaciteta: red raste, a dio narudžbi kasni ili dobije grešku (simulacija takav ručak računa kao izgubljen). Pravilo <Term id="n-plus-one">N+1</Term>: ako
              za vrh treba N poslužitelja, imajte N+1.
            </li>
          </ul>
        </Callout>
        <CodeBlock
          title="availability.ts"
          lang="typescript"
          code={availabilityTs}
          caption="Sve formule ovog odjeljka u desetak redaka TypeScripta."
          notes={[
            { lines: '4', text: 'A = MTBF / (MTBF + MTTR)' },
            { lines: '7', text: 'u nizu: množimo' },
            { lines: '10', text: 'paralelno: 1 − umnožak (1 − A)' },
            { lines: '16', text: 'baza od 99,9 % određuje lanac' },
          ]}
        />
      </Section>

      {/* 5 ─ Concept: throughput does not scale linearly */}
      <Section id="propusnost" kicker="koncept" title="Zašto 10 poslužitelja ne daje 10 × veću propusnost" lead="Prvi dio Lanina pitanja: hoće li Klopa s dva poslužitelja biti dvostruko brža?">
        <p>
          „Brže” može značiti dvije stvari. Drugi poslužitelj ne ubrzava obradu pojedine narudžbe: bez gužve odgovor traje jednako dugo (<em>latencija</em> je ista), a u gužvi skraćuje samo čekanje u redu. Ono što drugi
          poslužitelj može povećati je <Term id="throughput">propusnost</Term>, broj zahtjeva koje sustav obradi u sekundi – ali samo dok zajednički dijelovi imaju rezerve.
        </p>
        <p>
          Svaki Klopin poslužitelj aplikacije s dvije procesorske jezgre (2 vCPU, 4 GB) stigne oko 10 zahtjeva u sekundi. Ali svi oni pišu u istu bazu, a i ona ima granicu. Dodajte poslužitelje i gledajte što se događa:
        </p>
        <BottleneckExplorer />
        <p>
          Dok baza ima rezerve, svaki novi poslužitelj dodaje svojih 10 zahtjeva u sekundi. Čim se baza napuni, postaje <Term id="bottleneck">usko grlo</Term>: novi poslužitelji samo čekaju u redu pred njom.
        </p>
        <Analogy
          title="Više kuhara, jedan štednjak"
          breaksDown="drugi štednjak samo kupimo, a druga baza mora stalno imati iste podatke kao prva: replike za čitanje preuzmu čitanje, predmemorija (npr. Redis) skine dio upita, ali pisanje u jednu bazu ostaje zajedničko mjesto."
        >
          Teta Mira može zaposliti deset kuhara, ali ako u kuhinji postoji samo jedan štednjak, kuhinja neće skuhati deset puta više ručkova. Kuhari će stajati u redu pred štednjakom.
        </Analogy>
        <h3>Amdahlov model</h3>
        <p>
          Isto vrijedi općenito: ako dio posla mora proći kroz jedno mjesto (jedan redak u bazi, jedna brava, jedan red), taj dio ne ubrzava nijedan broj poslužitelja. <em>Amdahlov zakon</em> to kaže brojem: ako se može podijeliti
          udio p posla, ubrzanje s N poslužitelja je 1 / ((1 − p) + p / N), a nikad ne prijeđe 1 / (1 − p). Uz p = 95&nbsp;% strop je 20×, ma koliko poslužitelja dodali.
        </p>
        <AmdahlChart />
        <DeepDive title="Može li više poslužitelja biti i sporije? (USL)">
          <p>
            Amdahl pretpostavlja da poslužitelji samo čekaju na zajednički dio. U stvarnosti se moraju i <strong>međusobno usklađivati</strong> (zaključavanja, osvježavanje predmemorija, dogovaranje), a taj trošak raste s brojem
            parova. Univerzalni zakon skalabilnosti (engl. <em>Universal Scalability Law</em>, USL) dodaje i to: C(N) = N / (1 + α(N − 1) + βN(N − 1)).
          </p>
          <p>
            Uz α = 0,05 i β = 0,001 propusnost je najveća oko N ≈ 31 poslužitelja, a nakon toga – <strong>pada</strong>. Kao i Amdahl, ovo je model za razmišljanje, a ne zakon prirode: α i β za vaš sustav treba izmjeriti.
          </p>
          <UslChart />
        </DeepDive>
      </Section>

      {/* 6 ─ Partial failure and the network */}
      <Section id="spor-ili-mrtav" kicker="isprobajte" title="Spor ili mrtav?" lead="Jedno računalo radi ili ne radi. Raspodijeljeni sustav može biti napola živ – i to je novi problem koji smo upravo kupili.">
        <p>
          Kad se jedno računalo pokvari, obično stane sve odjednom i to se odmah vidi. U raspodijeljenom sustavu jedan dio može ne raditi, a ostali rade dalje: to je <Term id="partial-failure">djelomični kvar</Term>. A dijelovi znaju
          jedni za druge samo ono što si pošalju preko mreže – i ta mreža nije pouzdana.
        </p>
        <NetworkStepper />
        <MarginNote tone="red">tišina: izgubljeno, zapelo ili mrtvo?</MarginNote>
        <p>
          Pošiljatelj vidi samo je li odgovor stigao i kada. Kad odgovora nema, ne zna je li poruka izgubljena, zapela u redu ili je poslužitelj na drugoj strani mrtav. Šesti slučaj iz koraka iznad,{' '}
          <Term id="network-partition">mrežna particija</Term> (engl. <em>network partition</em>), posebno je nezgodan: obje strane rade, a svaka misli da je druga pala.
        </p>
        <Analogy
          title="Kolege koji si samo pišu poruke"
          who="lana"
          breaksDown="ljudi mogu nazvati, pitati nekog trećeg ili naslutiti da je kolega na ručku. Računala imaju samo jedno: koliko dugo čekati odgovor prije nego što odustanu."
        >
          Zamislite tim koji komunicira isključivo porukama. Pošaljete pitanje kolegi i odgovora nema. Je li bolestan? Na sastanku? Je li poruka uopće stigla? Odgovorio je, ali je odgovor zapeo? Iz svoje sobe to ne možete znati.
        </Analogy>
        <p>
          Jedino oružje koje računalo ima je <Term id="timeout">rok čekanja</Term> (engl. <em>timeout</em>): „ako odgovor ne stigne za toliko milisekundi, smatram da je druga strana mrtva”. Ali koliko je „toliko”? Živ poslužitelj
          ponekad samo zastane, npr. tijekom pauze za sakupljanje smeća (engl. <em>garbage collection</em>, GC), kad program oslobađa memoriju koju više ne koristi. Isprobajte na tisuću simuliranih provjera sa skrivenim
          kvarovima:
        </p>
        <TimeoutGame />
        <p>
          Kratak timeout brzo otkrije pad, ali živ poslužitelj koji je samo zastao (npr. tijekom GC pauze) proglasi mrtvim – <em>lažna uzbuna</em>. Dug timeout ne griješi toliko, ali korisnici čekaju. Pad ne
          promaši nijedan timeout – samo ga kasnije primijeti. Savršenog timeouta nema; postoji samo dobar dogovor između lažnih uzbuna i čekanja.
        </p>
        <Callout kind="info" title="A ako jednostavno pošaljemo ponovno?">
          Ponovni pokušaj spašava izgubljene zahtjeve – ali ako je izgubljen samo odgovor, druga strana poruku dobije dvaput („Dvaput ćevapi?!”). Zato se poruke kasnije dizajniraju tako da im dvostruka obrada ne škodi. Na to se
          vraćamo kod redova poruka.
        </Callout>
      </Section>

      {/* 7 ─ Predict + flagship */}
      <Section id="simulacija" kicker="simulacija" title="Arhitekt dostupnosti" lead="Sve zajedno: složite Klopu od dijelova, zadajte im dostupnost i odvrtite cijelu godinu u deset sekundi.">
        <Predict
          question="Klopa: ulaz od 99,99 %, dva poslužitelja aplikacije od 99 % (svaki nosi 70 % vršnog prometa) i jedna baza od 99,9 %. Kolika će joj stvarno biti dostupnost?"
          options={['99,99 % – dva poslužitelja su paralelno', 'točno 99,88 %, kako kaže formula', 'osjetno manje od 99,88 %', '98,01 % – sve je u nizu']}
          correct={2}
          explain={`Formula daje 99,88 %, ali pretpostavlja da preživjeli poslužitelj nosi sav promet i da se kvar primijeti odmah. Ovdje svaki nosi samo 70 % vrha: kad jedan padne u podne, drugi je preopterećen (143 %) i simulacija takav ručak računa kao izgubljen. Prosjek 100 godina zato je ${pctA(AVG_DVA.availability)}.`}
          then="Provjerite u simulaciji: pritisnite „Pokreni godinu” i usporedite tri broja ispod crteža."
        />
        <AvailabilityArchitect />
        <h3>Što ste upravo vidjeli</h3>
        <ul>
          <li>Formula za neovisne kvarove je optimistična: ne zna za N+1, za vrijeme do preuzimanja rada ni za kvarove koji ruše više dijelova odjednom.</li>
          <li>S bazom od 99,9 % lanac u prosjeku ne prelazi 99,9 % ni sa šest poslužitelja aplikacije – najslabija karika u nizu određuje cijeli lanac. Pojedina godina može imati sreće.</li>
          <li>„Isti ormar” dodaje zajednički kvar: kvar ormara ruši oba poslužitelja odjednom – za taj kvar dva poslužitelja vrijede kao jedan, a formula za paralelni spoj to ne vidi.</li>
          <li>„Loša konfiguracija na svim poslužiteljima” sruši sve kopije – redundancija ne štiti od iste greške posvuda.</li>
          <li>Jedna godina je jedan uzorak: „Druga godina” pokazuje koliko je sreće u svakoj brojci.</li>
        </ul>
        <KeyIdea>
          Redundancija pomaže samo kad su kvarovi <strong>neovisni</strong> i kad preživjeli imaju <strong>rezervu kapaciteta</strong>. Svaki novi dio sustava je i nova stvar koja se može pokvariti.
        </KeyIdea>
      </Section>

      {/* 8 ─ Misconceptions, recap, quiz */}
      <Section id="provjera" kicker="provjera" title="Mit ili istina – i što smo naučili" lead="Četiri česte zablude o raspodijeljenim sustavima i jedna neugodna istina.">
        <MythOrFact
          items={[
            {
              statement: 'Dvostruko poslužitelja znači dvostruki kapacitet.',
              fact: false,
              explain: 'Samo dok nitko ne čeka na isto mjesto. Zajednička komponenta – najčešće baza – ograniči propusnost, pa novi poslužitelji samo stoje u redu pred njom.',
            },
            {
              statement: 'Raspodijeljeni sustav je automatski pouzdaniji.',
              fact: false,
              explain: 'Više dijelova znači više kvarova: od deset poslužitelja od 99 % barem jedan je dolje oko 9,6 % vremena. Pouzdanost dolazi tek od redundancije i dizajna: otkrivanja kvara, preuzimanja rada i rezerve kapaciteta.',
            },
            {
              statement: 'Dva poslužitelja od 99 % uvijek daju 99,99 %.',
              fact: false,
              explain: 'Samo uz neovisne kvarove, brzo preuzimanje rada i N+1 kapacitet. Isti ormar, ista loša konfiguracija ili preopterećeni preživjeli poslužitelj ruše tu računicu.',
            },
            {
              statement: 'Svaka ozbiljna aplikacija treba mikroservise i Kubernetes.',
              fact: false,
              explain: 'Mnoge aplikacije sasvim dobro rade na jednom poslužitelju. Raspodijelite tek kad to traže opterećenje, dostupnost ili zemljopis – i tada najprije replicirajte, a ne razlažite.',
            },
            {
              statement: 'Spor poslužitelj izvana izgleda isto kao mrtav.',
              fact: true,
              explain: 'Pošiljatelj vidi samo da odgovor nije stigao. Zato se pad otkriva timeoutom, a svaki timeout ponekad proglasi mrtvim i poslužitelj koji je samo zastao.',
            },
          ]}
        />
        <Recap
          points={[
            <>
              Tri glavna razloga za više računala: <strong>kapacitet</strong>, <strong>dostupnost</strong> i <strong>blizina korisnicima</strong>. Bez njih je jedan (veći) poslužitelj jednostavniji i jeftiniji.
            </>,
            <>
              A = MTBF / (MTBF + MTTR). U nizu se dostupnosti množe; paralelno je A = 1 − Π(1 − Aᵢ) – ali samo uz neovisne kvarove, brzo preuzimanje rada i N+1.
            </>,
            <>Zajednička komponenta (baza) ograničava propusnost: deset poslužitelja ne daje deset puta više.</>,
            <>Mreža gubi, kasni, udvostručuje i miješa poruke. Spor poslužitelj izgleda kao mrtav, a timeout bira između lažnih uzbuna i čekanja.</>,
          ]}
        />
        <Quiz
          questions={[
            {
              q: 'Baza ima MTBF od 999 h i MTTR od 1 h. Kolika joj je dostupnost?',
              options: ['99 %', '99,9 %', '99,99 %', '0,1 %'],
              correct: 1,
              explain: 'A = 999 / (999 + 1) = 0,999, dakle 99,9 % – oko 8,8 h nedostupnosti godišnje.',
            },
            {
              q: 'Dva poslužitelja od 99 % rade paralelno, ali stoje u istom ormaru s istim napajanjem. Što vrijedi?',
              options: ['Dostupnost je točno 99,99 %.', 'Dostupnost je niža od 99,99 % jer kvar ormara sruši oba odjednom.', 'Dostupnost je 98,01 %.', 'Ormar ne utječe na dostupnost.'],
              correct: 1,
              explain: '99,99 % vrijedi samo za neovisne kvarove. Zajednički ormar je komponenta u nizu s cijelim parom, pa ukupna dostupnost ne može biti veća od dostupnosti ormara.',
            },
            {
              q: 'Klopa ima četiri poslužitelja aplikacije i jednu bazu. U podne su poslužitelji aplikacije na 30 % CPU-a, baza je na 100 %, a odgovori su spori. Što će pomoći?',
              options: ['Dodati još četiri poslužitelja aplikacije.', 'Rasteretiti ili ojačati bazu (predmemorija, jači stroj, replike za čitanje).', 'Skratiti timeout.', 'Ništa, tako je normalno.'],
              correct: 1,
              explain: 'Usko grlo je baza: poslužitelji aplikacije čekaju na nju. Novi poslužitelji aplikacije samo bi produljili red pred bazom.',
            },
            {
              q: 'Detektor kvarova ima timeout od 200 ms. Poslužitelj zbog GC pauze odgovori nakon 900 ms. Što se dogodilo?',
              options: ['Pad je ispravno otkriven.', 'Lažna uzbuna: živ poslužitelj proglašen je mrtvim.', 'Timeout je promašio pad.', 'Poruka je udvostručena.'],
              correct: 1,
              explain: 'Poslužitelj je živ, samo je zastao. Kratak timeout takve poslužitelje proglašava mrtvima; dulji bi ga pričekao, ali bi korisnici dulje čekali i kod pravog pada.',
            },
            {
              q: 'Dva poslužitelja, svaki nosi 70 % vršnog prometa. Jedan padne u 12:00. Koliko opterećenja dobije drugi?',
              options: ['70 %', '100 %', 'oko 143 %', '35 %'],
              correct: 2,
              explain: '100 % prometa / 70 % kapaciteta ≈ 143 %: preživjeli je preopterećen, red raste, a dio narudžbi kasni ili dobije grešku. Pravilo N+1: preživjeli moraju moći nositi sav vršni promet.',
            },
            {
              q: 'Iz prošlog predavanja: što na poslužitelju s radnicima (engl. workers) određuje količina RAM-a?',
              options: ['Koliko brzo se obradi jedan zahtjev.', 'Koliko zahtjeva može istodobno biti u obradi.', 'Koliko zahtjeva u sekundi obrade procesorske jezgre.', 'Koliko je poslužitelj dostupan.'],
              correct: 1,
              explain: 'Svaki radnik drži dio memorije, pa RAM određuje koliko ih stane – koliko zahtjeva istodobno. Koliko ih se obradi u sekundi određuju procesorske jezgre.',
            },
          ]}
        />
      </Section>

      {/* 9 ─ Cliffhanger + cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili" lead="Davor je ipak kupio drugi poslužitelj. Prvo podne s dva poslužitelja izgleda ovako.">
        <p>
          Studenti Klopu ne traže po adresi nego po imenu, <code>klopa.example</code>. Ime u adresu prevodi <Term id="dns">DNS</Term> – imenik interneta. Pogledajmo što se dogodi kad menza otvori drugi pult, a nikome to ne
          kaže.
        </p>
        <DnsStepper />
        <p>
          Drugi poslužitelj sam po sebi ne radi ništa. Netko mora studente slati na oba poslužitelja – i to pametnije od imenika koji ne zna ni koliko je koji poslužitelj jak ni je li uopće živ. Taj netko je{' '}
          <Term id="load-balancer">load balancer</Term>, tema sljedećeg predavanja.
        </p>
        <StoryMap at="03" caption="Uz Velikog stoji Srednji (2 vCPU · 4 GB), a oba koriste istu bazu. Promet zasad i dalje ide samo Velikom." />
        <CostNote
          gained={['Drugi poslužitelj: kvar jednog više ne mora srušiti Klopu.', 'Znamo izračunati koliko dostupnosti kupujemo – i gdje je najslabija karika.']}
          paid={['Srednji zasad čeka: DNS ne zna koliko je koji poslužitelj jak ni je li živ.', 'Baza je i dalje jedna: usko grlo i jedinstvena točka kvara.', 'Kad padne Veliki, Srednji sam ne nosi ručak (nije N+1).']}
          next="Davor u međuvremenu doda i treći poslužitelj: uz Velikog (4 vCPU, 8 GB) i Srednjeg (2 vCPU, 4 GB) sad stoji i Mali (1 vCPU, 2 GB). Sve tri adrese upisuje u DNS – ali imenik ne zna koji je poslužitelj jači ni je li živ. Netko mora dijeliti promet – i to pametno."
        />
      </Section>
    </>
  )
}

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
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  RoughBox,
  Section,
  StoryMap,
  Tabs,
  Term,
  Terminal,
} from '../../kit'
import { SyncChainStepper } from './sims/SyncChainStepper'
import { DeliveryTrio } from './sims/DeliveryTrio'
import { StoryBeat } from './sims/StoryBeat'
import { AmortizerExplorer } from './sims/AmortizerExplorer'
import { AckLab } from './sims/AckLab'
import { BackoffChart } from './sims/BackoffChart'
import { PoisonLab } from './sims/PoisonLab'
import { KitchenRailSim } from './sims/KitchenRailSim'
import { FanoutStepper } from './sims/FanoutStepper'
import { KafkaStepper } from './sims/KafkaStepper'
import workerPy from './code/worker.py?raw'
import declarePy from './code/declare_queues.py?raw'
import idempotentSql from './code/idempotent_insert.sql?raw'
import kafkaPy from './code/kafka_producer.py?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook: the incident and the synchronous chain */}
      <Section id="incident" kicker="priča" title="Ćevap-petak u 12:00" lead="Narudžba čeka spremanje, listić za kuhinju i SMS. Kad zapne samo jedan od tih poslova, zapnu sve narudžbe.">
        <MarginNote>pojednostavljeno: cijeli API = 4 radnika</MarginNote>
        <IncidentCard
          no={6}
          when="petak, 12:00"
          title="Ćevap-petak: trećina narudžbi dobije 503"
          who="davor"
          says={['503! 503!', 'Usred naleta.']}
          preset="l06-cevap-petak-direct · 150 s"
          seed={36343}
          metrics={[
            { label: 'nalet', value: '15 narudžbi/s' },
            { label: 'API istodobno', value: '4 narudžbe', tone: 'warn' },
            { label: 'izgubljeno', value: '152 od 445', tone: 'bad' },
          ]}
        >
          Inače stižu dvije narudžbe u sekundi, a deset sekundi u podne po petnaest. Svaki radnik API-ja drži narudžbu dok je ne spremi, upiše listić za kuhinju i pošalje SMS – a radnika API-ja ima samo četiri. Već sam nalet odbije
          trećinu narudžbi.
        </IncidentCard>
        <p>
          Nakon prošlog predavanja poslužitelji aplikacije su zamjenjivi: stanje živi u Postgresu i Redisu, a provjere ispravnosti izbacuju palog. Ali klopa-api i dalje sve radi <strong>sinkrono</strong>, unutar jednog HTTP zahtjeva:
          spremi narudžbu, upiše listić za kuhinju i pošalje SMS „narudžba je spremna”. Studenti dobiju odgovor tek kad su gotova sva tri posla. Pogledajmo što to znači kad SMS-gateway (vanjska usluga koja šalje SMS-ove) počne kasniti.
        </p>
        <SyncChainStepper />
        <p>
          Na Ćevap-petak nije trebao ni spori SMS: sam nalet od 15 narudžbi u sekundi zauzeo je sva četiri radnika (kartica gore: 152 od 445). A kad je SMS-gateway još i zapeo, Lana je brzo dodala ponovne pokušaje: ako narudžba ne
          uspije, šalje se ponovno. Promet je porastao, a iz kuhinje se začula teta Mira:
        </p>
        <StoryBeat />
        <p>
          Kako se to dogodilo? Narudžba koja je pala na SMS-u već je imala upisan listić za kuhinju. Ponovni pokušaj upisao je još jedan – i kuhinja je istu narudžbu skuhala dvaput. Usput su ponovni pokušaji povećali promet baš
          kad je API bio najzagušeniji.
        </p>
        <p>
          Imamo dva problema odjednom. Prvi: <strong>primanje</strong> narudžbe vezano je uz <strong>posao koji slijedi</strong>, pa spor SMS ili nalet sruše i samo naručivanje. Drugi: čim nešto ponavljamo, isti posao se može obaviti
          dvaput. Pitanje ovog predavanja glasi: <em>kako odvojiti primanje narudžbe od posla koji slijedi, a da se ništa ne izgubi ni ne udvostruči?</em>
        </p>
      </Section>

      {/* 2 ─ The queue as a shock absorber */}
      <Section id="amortizer" kicker="red poruka" title="Red kao amortizer" lead="Ideja iz kuhinje: konobar zakači listić na šinu i vrati se gostima, a kuhari skidaju sljedeći listić kad su slobodni.">
        <p>
          <Term id="message-queue">Red poruka</Term> (engl. <em>message queue</em>) radi upravo to. API je <Term id="producer-consumer">proizvođač</Term>: narudžbu spremi u bazu, u red stavi poruku „skuhaj narudžbu 42” i odmah
          odgovori <code>202 Accepted</code> s brojem narudžbe. Poruku čuva <Term id="message-broker">posrednik poruka</Term> (engl. <em>message broker</em>) – kod Klope je to RabbitMQ. Proces klopa-worker je{' '}
          <strong>potrošač</strong>: uzme poruku, upiše listić za kuhinju, pošalje SMS i javi posredniku da je gotov.
        </p>
        <p>
          Proizvođač i potrošač više ne moraju raditi u isto vrijeme ni istom brzinom. Za nalet to znači da višak čeka u redu umjesto da dobije 503. Ali hoće li red i ubrzati kuhanje?
        </p>
        <Predict
          question="Isti Ćevap-petak (445 narudžbi), ali API narudžbe stavlja u red, a kuhaju ih 4 potrošača, svaki prosječno jednu narudžbu u sekundi. Što se dogodi?"
          options={['Izgubi se otprilike isto, oko 150 narudžbi.', 'Izgubi se upola manje, jer red ubrzava obradu.', 'Ne izgubi se nijedna, ali zadnje narudžbe iz naleta čekaju i pola minute.', 'Ne izgubi se nijedna i sve su skuhane za nekoliko sekundi.']}
          correct={2}
          explain="Red čuva svaku narudžbu, pa se ne izgubi nijedna. Ali kapacitet je i dalje 4 narudžbe u sekundi: za vrijeme naleta red raste za 15 − 4 = 11 poruka u sekundi, do vrha od oko 110. Nakon naleta prazni se samo razlikom 4 − 2 = 2 poruke u sekundi – gotovo minutu. Zadnja narudžba iz naleta ima ispred sebe oko 110 poruka, koje 4 potrošača obrade za oko 28 s – zato čeka pola minute, iako se cijeli red prazni gotovo minutu (za to vrijeme stižu nove narudžbe)."
        />
        <AmortizerExplorer />
        <p>
          Red je <strong>amortizer</strong>: upija udarac, ali ne dodaje snagu. Dok je dolazni promet λ (lambda, narudžbi u sekundi) veći od kapaciteta kμ (k potrošača, svaki obradi μ narudžbi u sekundi), red raste za λ − kμ poruka u
          sekundi. Kad nalet prođe, red se prazni brzinom kμ − λ, pa vrijedi:
        </p>
        <RoughBox className={styles.formulaBox} seed={8301} strokeWidth={1.6} double>
          <span className={styles.formulaLabel}>vrijeme pražnjenja</span>
          <span className="mono">≈ zaostatak / (kμ − λ)</span>
        </RoughBox>
        <MarginNote>red = vrijeme čekanja, ne brzina</MarginNote>
        <p>
          Kod Klope: vrh od 113 poruka, 4 potrošača i 2 narudžbe u sekundi daju 113 / (4 − 2) ≈ 56 s (izmjereno u simulaciji: 52,7 s). Ako je i nakon naleta kμ = λ, zaostatak se više ne smanjuje; ako je kμ &lt; λ, red raste bez
          kraja – dok posrednik ne dosegne granicu memorije ili diska i ne počne blokirati proizvođače. Kapacitet dodaju samo potrošači.
        </p>
        <Analogy
          title="Analogija: kuhinjska šina za listiće"
          breaksDown="papirnati listić ne može se udvostručiti: kad ga kuhar skine, nema ga. Pravi red isporučuje poruku barem jednom – ako potrošač „padne” prije potvrde, isti listić se pojavi ponovno i narudžba se može skuhati dvaput. Zato ćemo uskoro trebati ključ idempotentnosti."
        >
          Konobar (API) zakači listić na šinu i vrati se gostu. Kuhari (potrošači) skidaju sljedeći listić čim su slobodni. Kad dođe nalet, šina se puni, ali nijedna narudžba ne pada na pod. Više kuhara brže isprazni šinu – dulja šina ne.
        </Analogy>
        <p>Usporedimo red s load balancerom iz četvrtog predavanja. Oba dijele posao – load balancer na poslužitelje, red na potrošače – ali na suprotan način:</p>
        <Compare
          left={{
            title: 'Load balancer gura',
            tone: 'blue',
            points: ['Za svaki zahtjev odlučuje kamo ide.', 'Mora pogađati tko je slobodan (algoritam, provjere ispravnosti).', 'Klijent čeka dok poslužitelj radi.'],
          }}
          right={{
            title: 'Potrošači vuku',
            tone: 'green',
            points: ['Slobodan potrošač uzme sljedeću poruku.', 'Nitko ne pogađa: zauzet potrošač jednostavno ništa ne uzima.', 'Proizvođač ne čeka – čeka poruka u redu.'],
          }}
        />
        <p>
          (Točnije: potrošači na SQS-u sami traže poruke, a RabbitMQ ih šalje sam, ali samo potrošaču koji ima slobodnog mjesta. To mjesto određuje <code>prefetch</code> – s vrijednošću 1 potrošač nikad ne drži više od jedne
          nepotvrđene poruke.)
        </p>
      </Section>

      {/* 3 ─ Acks and redelivery */}
      <Section id="potvrda" kicker="koncept" title="Potvrda i ponovna isporuka" lead="Posrednik briše poruku tek kad mu potrošač javi da je gotov. Kada mu to javi – i što ako potrošač padne prije toga?">
        <p>
          Kad potrošač preuzme poruku, posrednik je ne briše odmah. Čeka <Term id="acknowledgement">potvrdu</Term> (engl. <em>acknowledgement</em>, kraće <em>ack</em>). Dok potvrda ne stigne, poruka je „nepotvrđena”. Potrošač može
          potvrditi u dva trenutka, a o tom izboru ovisi što se dogodi kad padne:
        </p>
        <DeliveryTrio />
        <p>
          Kad se poruka vraća, ovisi o posredniku – i to je važna razlika:
        </p>
        <ul>
          <li>
            <strong>RabbitMQ</strong> zna kad je potrošač pao: prekinula se njegova veza. Sve njegove nepotvrđene poruke odmah vraća u red, označene s <code>redelivered=true</code> (ako padne cijelo računalo ili mreža, RabbitMQ to
            primijeti tek kad istekne <em>heartbeat</em>, zadano 60 s). Ako potrošač poruku drži predugo (<code>consumer_timeout</code>, zadano 30 minuta), RabbitMQ ga otkaže (stariji klijenti dobiju zatvoren kanal) i poruke
            također vrati.
          </li>
          <li>
            <strong>Amazon SQS</strong> ne prati veze. Primljena poruka postane nevidljiva ostalima na <Term id="visibility-timeout">rok vidljivosti</Term> (engl. <em>visibility timeout</em>, zadano 30 s). Ako je potrošač u tom
            roku ne obriše, poruka se ponovno pojavi – svejedno je li potrošač pao ili je samo spor.
          </li>
        </ul>
        <p>Isprobajte sve četiri kombinacije u pokusu ispod. Na SQS-u rok je ovdje 10 s, da ne čekate pola minute.</p>
        <AckLab variant="ack" />
        <p>
          Desni stupac tablice problem je tete Mire: s potvrdom nakon obrade pad <strong>nakon kuhanja, a prije potvrde</strong> znači da je narudžba skuhana, ali posrednik to ne zna. Poruka stiže drugom potrošaču i on kuha ponovno.
          Isto se na SQS-u dogodi i bez pada, kad kuhanje traje dulje od roka vidljivosti.
        </p>
        <Callout kind="fact" title="Tko što jamči">
          <ul>
            <li>RabbitMQ (4.3, uz potvrdu nakon obrade) i Amazon SQS Standard: isporuka barem jednom. SQS Standard poredak samo pokušava očuvati („best-effort”).</li>
            <li>
              SQS FIFO odbacuje dvaput poslanu poruku s istim ID-jem unutar 5 minuta (AWS to zove „exactly-once processing”), ali poruka koja nije obrisana prije isteka roka vidljivosti isporučuje se ponovno – potrošač i dalje mora
              biti idempotentan.
            </li>
            <li>NATS bez JetStreama isporučuje najviše jednom, a s JetStreamom barem jednom.</li>
            <li>Kafka je zadano „barem jednom”; „točno jednom” vrijedi samo unutar Kafke (idempotentni proizvođač, transakcije i čitanje s <code>read_committed</code>).</li>
          </ul>
          <p>(stanje: listopad 2026.)</p>
        </Callout>
      </Section>

      {/* 4 ─ Idempotency key */}
      <Section id="idempotentnost" kicker="koncept" title="Ključ idempotentnosti" lead="Ako ista poruka smije stići dvaput, druga obrada mora biti bezopasna. Za kuhinju je to lako – za SMS nije.">
        <p>
          Obrada je <Term id="idempotency">idempotentna</Term> ako dvaput primljena poruka ima isti učinak kao jednom primljena. Klopa za to ima prirodan <strong>ključ idempotentnosti</strong>: broj narudžbe. Teta Mira na ploči
          drži popis skuhanih narudžbi; kad listić 42 stigne drugi put, udari pečat „već skuhano” i ne kuha.
        </p>
        <p>
          U bazi je taj popis tablica s jedinstvenim ključem. Ključno je da se oznaka „skuhano” i sam učinak (listić za kuhinju) upišu <strong>u istoj transakciji</strong>: ili su upisana oba, ili nijedno. Tada pad u bilo kojem trenutku
          ostavlja bazu u ispravnom stanju.
        </p>
        <p>
          Listić za kuhinju ovdje nije papir iz pisača, nego redak u tablici <code>listici</code> koji kuhinja vidi na ekranu – zato može ući u istu transakciju. Da ga ispisujemo na pisaču, bio bi vanjski učinak baš kao SMS.
        </p>
        <p>
          SMS je teži. SMS-gateway je vanjski sustav i ne sudjeluje u našoj transakciji. Imamo tri mogućnosti, i svaka nešto košta:
        </p>
        <ul>
          <li>
            <strong>Bez zaštite (ili „pošalji pa zapiši”):</strong> pad nakon slanja, a prije zapisa – SMS ode <em>dvaput</em>.
          </li>
          <li>
            <strong>Zapiši pa pošalji:</strong> pad između zapisa i slanja – SMS se <em>nikad</em> ne pošalje.
          </li>
          <li>
            <strong>Ključ idempotentnosti pružatelja:</strong> uz svaki SMS šaljemo ključ (npr. <code>narudzba-42</code>), a gateway drugi SMS s istim ključem odbaci. Ovo radi samo ako ga pružatelj podržava; inače moramo podnijeti
            povremeni dvostruki SMS.
          </li>
        </ul>
        <AckLab variant="idem" />
        <p>Ono što je u pokusu radio prekidač „Idempotentnost”, u bazi izgleda ovako:</p>
        <CodeBlock
          title="idempotent_insert.sql"
          lang="sql"
          code={idempotentSql}
          caption="PostgreSQL: oznaka obrade i listić u jednoj transakciji. Druga isporuka iste poruke ne upiše ništa."
          previewLines={19}
          notes={[
            { lines: '4', text: 'PRIMARY KEY: isti broj narudžbe ne može se upisati dvaput.' },
            { lines: '12-14', text: 'ON CONFLICT DO NOTHING: drugi put RETURNING ne vrati ništa.' },
            { lines: '16-17', text: 'Listić se upisuje samo ako je oznaka upravo upisana.' },
            { lines: '19', text: 'Pad prije naredbe COMMIT: ništa nije upisano, posao se ponovi.' },
          ]}
        />
        <KeyIdea>
          Red <strong>ne ubrzava posao – čini čekanje sigurnim</strong>. Sigurno znači barem jednom: <strong>ista poruka smije stići dvaput</strong>, pa potrošač mora biti idempotentan. A idempotentnost je laka samo unutar vlastite
          transakcije u bazi.
        </KeyIdea>
        <DeepDive title="Za znatiželjne: transakcijski outbox">
          <p>
            Ista nevolja postoji i na strani API-ja: on narudžbu sprema u Postgres i objavljuje poruku u RabbitMQ. Ako padne između ta dva koraka, narudžba je spremljena, a poruka nikad nije poslana – i nitko je neće skuhati.
          </p>
          <p>
            <Term id="transactional-outbox">Transakcijski outbox</Term> to rješava ovako: API u <strong>istoj transakciji</strong> upiše narudžbu i redak u tablicu <code>outbox</code> („treba objaviti: skuhaj 42”). Zaseban proces čita
            tablicu, objavljuje poruke i označava ih poslanima. Ako padne usred posla, objavi ponovno – opet barem jednom, pa potrošač i dalje mora biti idempotentan. Isto vrijedi za SMS: zapis „treba poslati SMS” ide u istu transakciju kao listić,
            a šalje ga samo zaseban proces.
          </p>
        </DeepDive>
      </Section>

      {/* 5 ─ Poison messages, backoff and the DLQ */}
      <Section id="otrovna" kicker="koncept" prop="bolt" title="Otrovna poruka i red neobrađenih poruka" lead="Neke poruke ne uspiju zbog privremenog kvara, a neke ne uspiju nikad. Ponavljanje pomaže samo prvima.">
        <p>
          Kad obrada ne uspije, potrošač poruku vraća na <strong>ponovni pokušaj</strong>. Ako je uzrok privremen (baza se upravo restartala, SMS-gateway kasni), drugi ili treći pokušaj uspije. Ali ne smijemo ponavljati odmah i svi u isto
          vrijeme: tisuću potrošača koji u istom trenutku ponovno udare u gateway koji se upravo podigao srušit će ga opet.
        </p>
        <p>
          Zato se ponavlja sa <Term id="exponential-backoff">sve duljim, nasumično raspršenim razmakom</Term> (engl. <em>exponential backoff with jitter</em>). Prije n-tog ponovnog pokušaja čeka se nasumično vrijeme između 0 i min(strop,
          osnovica · 2ⁿ). U našoj simulaciji osnovica je 0,5&nbsp;s, a strop 30&nbsp;s.
        </p>
        <BackoffChart />
        <p>
          Ponovni pokušaji se i <strong>množe</strong>: ako u sinkronom lancu preglednik pokuša 3 puta, API svaki put 3 puta pozove SMS-gateway, a knjižnica za SMS svaki poziv ponovi još 3 puta, spori gateway primi do 3 × 3 × 3 =
          27 poziva. Zato ponavljamo na jednom sloju, s gornjom granicom.
        </p>
        <p>
          <Term id="poison-message">Otrovna poruka</Term> je poruka čija obrada ne uspije nikad – npr. narudžba s neispravnim sadržajem. Bez granice vraćala bi se zauvijek i trošila potrošače. Zato posrednik broji isporuke i nakon
          granice poruku premjesti u <Term id="dead-letter-queue">red neobrađenih poruka</Term> (engl. <em>dead-letter queue</em>, DLQ), gdje je čovjek može pregledati i, kad popravi grešku, vratiti u red.
        </p>
        <p>
          U RabbitMQ-u proizvođač ne piše izravno u red, nego na <Term id="exchange">exchange</Term> (razdjelnik), a on poruku proslijedi u jedan ili više redova povezanih s njim. <em>Dead-letter exchange</em> je razdjelnik kamo stižu odbačene
          poruke.
        </p>
        <ul>
          <li>
            <strong>RabbitMQ</strong> (quorum red) broji neuspjele isporuke u <code>x-delivery-count</code> i nakon granice <code>x-delivery-limit</code> šalje poruku na <em>dead-letter exchange</em> (zadana granica je 20). Bez dead-letter
            exchangea poruka se jednostavno odbacuje. Pazite: broje se samo <code>reject</code> i pad veze – <code>basic.nack</code> s <code>requeue</code> i istek <code>consumer_timeout</code> ne povećavaju brojač, pa otrovna
            poruka vraćena s <code>basic.nack</code> kruži zauvijek. Zato klopa-worker koristi <code>basic_reject</code> ili red čekanja. Vraćanje u red zadano je trenutačno, pa razmak treba napraviti posebno: red čekanja s rokom trajanja poruka
            (TTL) koji ih nakon isteka vraća u glavni red, ili ugrađena odgoda quorum reda (razmak raste linearno; zadano isključena).
          </li>
          <li>
            <strong>SQS</strong> broji primitke i nakon <code>maxReceiveCount</code> (u pravilu preusmjeravanja, engl. <em>redrive policy</em>) premješta poruku u DLQ. Razmak se dobiva produljenjem roka vidljivosti iste poruke (
            <code>ChangeMessageVisibility</code>). Nova poruka s odgodom (<code>DelaySeconds</code>) kreće s brojanjem primitaka od nule.
          </li>
        </ul>
        <Callout kind="fact" title="RabbitMQ 4.3: što se broji">
          Od verzije 4.3 granica isporuka quorum reda računa se po brojaču <code>delivery-count</code>: povećavaju ga <code>basic.reject</code> i pad veze, a ne povećavaju ga <code>basic.nack</code> ni istek{' '}
          <code>consumer_timeout</code>. Ista verzija donosi ugrađenu odgodu ponovnih pokušaja (<code>x-delayed-retry-type</code>, <code>x-delayed-retry-min</code>/<code>-max</code>; razmak raste linearno, zadano isključena).
          Stari dodatak za odgođene poruke (<em>delayed message exchange</em>) više se ne održava. (stanje: listopad 2026.)
        </Callout>
        <PoisonLab />
      </Section>

      {/* 6 ─ Flagship */}
      <Section id="simulacija" kicker="simulacija" title="Kuhinjska šina: sve zajedno" lead="Sad imate sve dijelove: nalet, red, potvrde, ključ idempotentnosti, ponovne pokušaje i DLQ. Pokvarite ih i popravite.">
        <p>
          Simulacija kreće s redom i 4 potrošača, a nalet od 15 narudžbi u sekundi stiže u 5. sekundi. Pod „Scenarij” možete ponoviti i sam incident (<code>l06-cevap-petak-direct</code>): bez reda, 150 s, seed 36343 – izgubi se 152 od 445 narudžbi.
        </p>
        <KitchenRailSim />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>S redom nalet ne izgubi nijednu narudžbu, ali zadnje čekaju desetke sekundi. Brže ih isprazni samo više potrošača (7 potrošača: oko 18&nbsp;s).</li>
            <li>„SMS-gateway pao”: bez reda narudžbe padaju, s redom red naraste pa se isprazni, a SMS-ovi odu kad se gateway vrati.</li>
            <li>Pad nakon kuhanja (RabbitMQ) ili kuhanje dulje od roka vidljivosti (SQS) skuha narudžbu dvaput – osim ako je uključena idempotentnost. SMS bez ključa pružatelja i tada može otići dvaput.</li>
            <li>Otrovna poruka obiđe red ponovnih pokušaja i završi u DLQ-u nakon zadanog broja isporuka.</li>
          </ul>
        </Callout>
        <DeepDive title="Što je u simulaciji stvarno, a što pojednostavljeno">
          <ul>
            <li>
              <strong>Stvarno:</strong> potvrda nakon obrade, trenutačno vraćanje nakon pada potrošača u RabbitMQ-u, rok vidljivosti SQS-a (30&nbsp;s, nije skraćen), ograničenje isporuka i DLQ, razmak između pokušaja (osnovica 0,5&nbsp;s, strop
              30&nbsp;s).
            </li>
            <li>
              <strong>Sažeto:</strong> obrada jedne poruke (listić i SMS) traje oko 1&nbsp;s; pravo kuhanje traje minutama, ali to radi kuhinja, a ne klopa-worker. Zakoni koje gledamo (kapacitet kμ, Littleov zakon, vrijeme pražnjenja)
              ne ovise o mjerilu. Sažet je samo RabbitMQ-ov <code>consumer_timeout</code>: 60&nbsp;s (sim) · stvarno: 30&nbsp;min.
            </li>
            <li>
              <strong>Pojednostavljeno:</strong> jedan red bez exchangea; objava u red nikad ne zakaže. U stvarnosti i API mora uključiti potvrde objave (engl. <em>publisher confirms</em>), inače poruka može nestati prije nego što je
              posrednik spremi. U načinu „bez reda” API nema nikakvu čekaonicu, pa narudžba odmah dobije 503 (to je model gubitaka Erlang B). Stvarni poslužitelj ima red veza (gunicorn zadano 2048), pa narudžbe ondje čekaju – ali
              nalet i spori SMS svejedno ih zadrže predugo, pa istječu na strani klijenta ili load balancera (504).
            </li>
            <li>
              „Najviše isporuka” 5 u RabbitMQ-u znači <code>x-delivery-limit: 4</code>: poruka ide u DLQ kad neuspjelih isporuka ima više od granice. Zadana granica quorum reda je 20, tj. 21 isporuka.
            </li>
          </ul>
        </DeepDive>
      </Section>

      {/* 7 ─ Queue, pub/sub or log */}
      <Section id="pubsub" kicker="koncept" prop="queue" title="Red, objavi-pretplati ili log" lead="„Skuhaj narudžbu 42” je naredba za jednog kuhara. „Narudžba 42 je zaprimljena” je vijest koju žele čuti mnogi.">
        <p>
          Do sada je svaka poruka bila <strong>naredba</strong>: posao koji treba obaviti točno jedan potrošač. Više potrošača na istom redu <Term id="competing-consumers">natječe se</Term> za poruke i dijeli posao. To je radni red.
        </p>
        <p>
          <strong>Događaj</strong> je drukčiji: obavijest da se nešto dogodilo („NarudzbaZaprimljena #42”). Zanima kuhinju, SMS i analitiku – i svaki od njih treba dobiti svoju kopiju. To je model <Term id="publish-subscribe">objavi-pretplati</Term>{' '}
          (engl. <em>publish/subscribe</em>): u RabbitMQ-u API objavi događaj na <em>fanout exchange</em> – razdjelnik koji kopiju poruke pošalje u svaki povezani red – a svaki pretplatnik ima vlastiti red. Novi pretplatnik (npr. bodovi vjernosti) samo veže svoj red – API se ne mijenja.
        </p>
        <FanoutStepper />
        <Analogy
          title="Analogija: radio emisija"
          who="petra"
          breaksDown="pretplatnik čiji red već postoji ne propusti ništa ni kad je isključen – red mu čuva poruke. Ali novi pretplatnik ne dobije ono što je objavljeno prije nego što je povezao svoj red, baš kao radio. Tek log poput Kafke čuva poruke i nakon čitanja, pa ih i novi pretplatnik može pročitati od početka."
        >
          Objavi-pretplati je kao radio emisija: voditelj govori jednom, a čuje ga svatko tko je uključio prijemnik. Voditelj ne zna tko sluša, a slušatelji se ne natječu – svatko čuje sve.
        </Analogy>
        <p>
          Treći model je <strong>log</strong> (npr. Kafka): poruke se nakon čitanja ne brišu, nego ostaju do isteka roka zadržavanja. Zato ih novi pretplatnik može pročitati od početka, a postojeći ponovno – npr. kad analitika ima
          grešku pa sve mora preračunati.
        </p>
        <DeepDive title="Za znatiželjne: log i Kafka">
          <p>
            Red briše poruku nakon potvrde. <strong>Log</strong> je drukčiji: zapisi se samo dodaju na kraj i ostaju dok ne istekne rok zadržavanja. Kafka log dijeli na <strong>particije</strong>; zapis s istim ključem (npr. ID korisnika) uvijek
            ide u istu particiju (dok se broj particija ne promijeni), pa je redoslijed sačuvan po ključu. Svaka grupa potrošača pamti svoj <strong>pomak</strong> (engl. <em>offset</em>), a <Term id="consumer-lag">zaostatak</Term> (engl.{' '}
            <em>lag</em>) je kraj particije minus spremljeni pomak (engl. <em>committed offset</em>). Vraćanjem pomaka grupa može sve pročitati ponovno.
          </p>
          <KafkaStepper />
          <p>
            U klasičnoj grupi svaku particiju čita točno jedan potrošač, pa potrošači iznad broja particija čekaju. Novije verzije Kafke imaju i dijeljene grupe (engl. <em>share groups</em>, „Kafka kao red”): više potrošača dijeli istu particiju i potvrđuje
            svaki zapis posebno, ali tada nema redoslijeda po ključu.
          </p>
          <Callout kind="fact" title="Kafka danas">
            Kafka 4.0 (ožujak 2025.) potpuno je uklonila ZooKeeper – metapodatke sama čuva u KRaft načinu, produkcijski spremnom od verzije 3.3. Kafka 4.2 (veljača 2026.) donijela je produkcijski spremne dijeljene grupe (<em>share groups</em>). Trenutačna verzija:
            4.3.1. (stanje: listopad 2026.)
          </Callout>
          <CodeBlock title="kafka_producer.py" lang="python" code={kafkaPy} mode="closed" caption="Isti događaj objavljen u Kafku: ključ određuje particiju." notes={[{ lines: '8-9', text: 'acks=all: čeka potvrdu svih sinkroniziranih replika.' }, { lines: '18-19', text: 'Ključ = korisnik: njegove narudžbe ostaju po redu.' }]} />
        </DeepDive>
      </Section>

      {/* 8 ─ Code */}
      <Section id="kod" kicker="kod" title="Potrošač u Pythonu" lead="Sve što ste radili gumbima u simulaciji, u klopa-workeru je nekoliko redaka.">
        <p>
          klopa-worker je Python proces koji knjižnicom pika čita red <code>narudzbe</code>. Važno je pet stvari: <code>prefetch_count=1</code>, potvrda tek nakon commita, idempotentan upis, ključ za SMS i
          potvrde objave (<code>confirm_delivery</code>) za poruku koja ide u red čekanja.
        </p>
        <Tabs
          tabs={[
            {
              label: 'worker.py',
              content: (
                <CodeBlock
                  title="worker.py"
                  lang="python"
                  code={workerPy}
                  notes={[
                    { lines: '21', text: 'prefetch 1: potrošač drži najviše jednu nepotvrđenu poruku.' },
                    { lines: '22', text: 'Potvrde objave: nova poruka je u redu prije ack-a stare.' },
                    { lines: '29-30', text: 'Oznaka „skuhano” i listić u istoj transakciji baze.' },
                    { lines: '31-32', text: 'SMS s ključem pružatelja: drugi pokušaj ne šalje ponovno.' },
                    { lines: '33-36', text: 'Neispravna (otrovna) poruka: bez ponavljanja, ravno u DLQ.' },
                    { lines: '37-50', text: 'Privremena greška: u red čekanja ili, nakon 5. pokušaja, u DLQ.' },
                    { lines: '51', text: 'Potvrda tek nakon obrade → isporuka barem jednom.' },
                  ]}
                />
              ),
            },
            {
              label: 'declare_queues.py',
              content: (
                <CodeBlock
                  title="declare_queues.py"
                  lang="python"
                  code={declarePy}
                  notes={[
                    { lines: '12-18', text: 'DLQ i exchange koji vodi u njega.' },
                    { lines: '25', text: 'quorum red: repliciran na više čvorova RabbitMQ-a.' },
                    { lines: '26-28', text: 'Granica 4: poruka na kojoj potrošač padne 5 puta ide u DLQ.' },
                    { lines: '30-31', text: 'at-least-once: poruka ne nestaje na putu između redova.' },
                    { lines: '41-43', text: 'Nakon 2 s poruka se vraća u glavni red.' },
                  ]}
                />
              ),
            },
          ]}
        />
        <p>
          Red čekanja ovdje ima jedan stalan rok (2&nbsp;s). Za razmak koji raste prave se dva ili tri takva reda (npr. 1&nbsp;s, 8&nbsp;s, 30&nbsp;s) ili se koristi ugrađena odgoda quorum reda (razmak raste linearno; zadano isključena). Jedan
          red s različitim rokovima po poruci ne radi dobro, jer poruka istječe tek kad dođe na čelo reda.
        </p>
        <p>Za vrijeme naleta Davor gleda redove naredbom <code>rabbitmqctl list_queues</code>:</p>
        <Terminal
          title="davor@rabbitmq-1"
          lines={[
            { cmd: 'rabbitmqctl list_queues name type messages_ready messages_unacknowledged' },
            { out: 'Timeout: 60.0 seconds ...\nListing queues for vhost / ...', tone: 'muted' },
            { out: 'name              type    messages_ready  messages_unacknowledged\nnarudzbe          quorum  113             4\nnarudzbe.cekanje  quorum  0               0\nnarudzbe.dlq      quorum  1               0', note: '113 čeka, 4 u obradi – red upija nalet', who: 'davor' },
            { comment: 'minutu kasnije' },
            { cmd: 'rabbitmqctl list_queues name messages_ready messages_unacknowledged' },
            { out: 'name              messages_ready  messages_unacknowledged\nnarudzbe          0               1\nnarudzbe.cekanje  0               0\nnarudzbe.dlq      1               0' },
          ]}
          caption="messages_ready = poruke na šini; messages_unacknowledged = poruke kod potrošača, još bez potvrde."
        />
        <Callout kind="fact" title="Verzije u primjerima">
          RabbitMQ 4.3 (od 4.0 nema zrcaljenih klasičnih redova; za visoku dostupnost koriste se quorum redovi). Primjeri u Pythonu koriste knjižnice pika, psycopg 3 i confluent-kafka. (stanje: listopad 2026.)
        </Callout>
      </Section>

      {/* 9 ─ Misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            {
              statement: 'Red ubrzava obradu.',
              fact: false,
              explain: 'Red upija nalete, ali ne dodaje kapacitet. Ako dulje vrijeme stiže više nego što potrošači stignu (λ > kμ), red raste bez kraja. Kapacitet dodaju samo potrošači.',
            },
            {
              statement: 'Svaka poruka stiže točno jednom.',
              fact: false,
              explain: 'Uobičajeno je „barem jednom”: nakon pada potrošača ili isteka roka ista poruka stiže ponovno. To je normalno ponašanje, pa potrošač mora biti idempotentan.',
            },
            {
              statement: 'S više potrošača narudžbe se obrađuju redom kojim su stigle.',
              fact: false,
              explain: 'Svaki potrošač uzima sljedeću poruku, ali obrada traje različito dugo, a vraćene poruke stižu kasnije. S više potrošača redoslijed nije zajamčen.',
            },
            {
              statement: 'Asinkrono znači da nitko ne čeka rezultat.',
              fact: false,
              explain: 'Studenti i dalje žele znati kad je ručak gotov. Odmah dobiju broj narudžbe (202), a rezultat kasnije – SMS-om ili provjerom statusa narudžbe.',
            },
            {
              statement: 'Idempotentan upis u bazu rješava i dvostruke SMS-ove.',
              fact: false,
              explain: 'Štiti samo učinke u istoj transakciji baze. SMS-gateway je vanjski sustav: treba mu ključ idempotentnosti pružatelja, inače povremeni dvostruki SMS moramo podnijeti.',
            },
            {
              statement: 'Kafka ne radi bez ZooKeepera.',
              fact: false,
              explain: 'Više ne: Kafka metapodatke čuva sama (KRaft), a ZooKeeper je potpuno uklonjen u ožujku 2025. Novije verzije imaju i dijeljene grupe (engl. share groups), pa Kafka zna raditi i kao red.',
            },
          ]}
        />
      </Section>

      {/* 10 ─ Recap and quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Red poruka razdvaja proizvođača i potrošača u vremenu: API spremi narudžbu, stavi poruku u red i odmah odgovori 202 s brojem narudžbe.',
            'Red ne povećava kapacitet. Kad je λ > kμ, red raste; nakon naleta prazni se za zaostatak / (kμ − λ). Brže ga isprazni samo više potrošača.',
            'Potvrda nakon obrade daje isporuku barem jednom: nakon pada (RabbitMQ odmah, SQS nakon roka vidljivosti) poruka stiže ponovno. Zato potrošač mora biti idempotentan – oznaka obrade i učinak u istoj transakciji, a za SMS ključ pružatelja.',
            'Ponovni pokušaji idu sa sve duljim, nasumično raspršenim razmakom; nakon granice isporuka poruka ide u red neobrađenih poruka (DLQ).',
            'Naredba ide jednom potrošaču (radni red), događaj svakom pretplatniku (objavi-pretplati). Log poput Kafke čuva zapise i za ponovno čitanje.',
          ]}
        />
        <p>Klopa nakon ovog predavanja: narudžbe idu u RabbitMQ, a klopa-worker upisuje listiće i šalje SMS.</p>
        <StoryMap at="06" />
        <Quiz
          questions={[
            {
              q: 'Nakon naleta u redu čeka 120 poruka. Stižu 3 narudžbe u sekundi, a radi 5 potrošača, svaki obradi jednu narudžbu u sekundi. Za koliko će se red otprilike isprazniti?',
              options: ['24 s', '40 s', '60 s', 'Nikad – red će rasti.'],
              correct: 2,
              explain: 'Red se prazni razlikom kapaciteta i prometa: 5 − 3 = 2 poruke u sekundi, pa 120 / 2 = 60 s. 24 s (120 / 5) bilo bi točno samo kad ne bi stizale nove narudžbe. Red bi rastao tek kad bi stizalo više od 5 narudžbi u sekundi.',
            },
            {
              q: 'RabbitMQ, potvrda nakon obrade. Potrošač upiše listić za narudžbu 42 u bazu i padne prije potvrde. Što se dogodi?',
              options: [
                'Narudžba 42 je izgubljena.',
                'Poruka se odmah vraća u red i drugi potrošač ponovno kuha narudžbu 42 – osim ako je obrada idempotentna.',
                'Poruka se vraća tek nakon 30 s, kad istekne rok vidljivosti.',
                'Ništa – RabbitMQ zna da je listić upisan.',
              ],
              correct: 1,
              explain: 'Pad prekine vezu, a RabbitMQ tada sve nepotvrđene poruke tog potrošača odmah vraća u red (redelivered=true). Posrednik ne zna je li kuhanje već obavljeno, pa bez ključa idempotentnosti narudžba se kuha dvaput. Rok vidljivosti postoji u SQS-u, ne u RabbitMQ-u.',
            },
            {
              q: 'Dijagnoza: na SQS-u (rok vidljivosti 30 s) nijedan potrošač ne pada, a ipak se neke narudžbe kuhaju dvaput. Nadzor pokazuje da obrada velikih narudžbi traje i 45 s. Što je najvjerojatniji uzrok?',
              options: ['Mreža je udvostručila poruke.', 'Obrada traje dulje od roka vidljivosti, pa se poruka ponovno pojavi i preuzme je drugi potrošač.', 'SQS Standard uvijek isporučuje svaku poruku dvaput.', 'Previše potrošača dijeli isti red.'],
              correct: 1,
              explain: 'Nakon 30 s poruka koju nitko nije obrisao opet postaje vidljiva i drugi potrošač je uzme. Rješenje: produljiti rok vidljivosti (ili ga produljivati tijekom dugog posla) i, u svakom slučaju, idempotentan potrošač.',
            },
            {
              q: 'Kuhinja je idempotentna (INSERT … ON CONFLICT DO NOTHING). Potrošač pošalje SMS i padne prije potvrde. Što stigne u kuhinju i na mobitel?',
              options: ['Jedan listić i jedan SMS.', 'Dva listića i dva SMS-a.', 'Jedan listić, ali možda dva SMS-a.', 'Ništa – narudžba je izgubljena.'],
              correct: 2,
              explain: 'Druga isporuka ne upiše novi listić (već skuhano), ali SMS-gateway nije dio naše transakcije. Bez ključa idempotentnosti pružatelja SMS ode ponovno. Zaštita „zapiši pa pošalji” spriječila bi dvostruki SMS, ali bi uz pad na krivom mjestu SMS mogao izostati.',
            },
            {
              q: 'Uz kuhinju, svaku narudžbu sad želi dobiti i analitika. Kako to napraviti s RabbitMQ-om?',
              options: [
                'Pokrenuti potrošača analitike na istom redu narudžbi.',
                'API objavljuje događaj na fanout exchange, a kuhinja i analitika imaju svaka svoj red.',
                'Kuhinja nakon kuhanja prosljeđuje poruku analitici.',
                'Povećati prefetch kuhinje da poruke stignu do analitike.',
              ],
              correct: 1,
              explain: 'Potrošači na istom redu natječu se: svaku poruku dobije samo jedan, pa bi analitika „krala” narudžbe kuhinji. Događaj na fanout exchangeu kopira se u red svakog pretplatnika. Prosljeđivanje preko kuhinje radilo bi, ali bi kuhinju vezalo uz analitiku.',
            },
            {
              q: 'Iz prošlog predavanja: zašto Klopa ne gubi košaricu kad load balancer izbaci jedan poslužitelj aplikacije?',
              options: ['Load balancer košaricu prenese na drugi poslužitelj.', 'Košarica živi u Redisu, a ne u memoriji poslužitelja, pa je svaki poslužitelj može pročitati.', 'Provjera ispravnosti spremi košaricu prije izbacivanja.', 'Preglednik ponovno pošalje cijelu košaricu.'],
              correct: 1,
              explain: 'Poslužitelji aplikacije su bez stanja: podatci o korisniku žive u Redisu i Postgresu. Zato je svejedno koji poslužitelj obradi sljedeći zahtjev. Load balancer i provjere ispravnosti o košarici ne znaju ništa.',
            },
          ]}
        />
      </Section>

      {/* 11 ─ Cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Ćevap-petak bez izgubljene narudžbe: red upije nalet, a API odgovori 202 u milisekundama.',
            'Spor ili pao SMS-gateway više ne ruši naručivanje – posao samo pričeka u redu.',
            'Dvostruke isporuke su bezopasne za kuhinju (ključ = broj narudžbe), a otrovne poruke čekaju u DLQ-u.',
          ]}
          paid={[
            'RabbitMQ je novi dio sustava: treba ga održavati, nadzirati i replicirati (quorum redovi).',
            'Odgovor je „zaprimljeno”, a ne „gotovo”: nakon naleta zadnje narudžbe čekaju i pola minute, a red je prazan tek za gotovo minutu.',
            'Klopa sad ima šest vrsta procesa – klopa-web, klopa-api, klopa-worker, Postgres, Redis i RabbitMQ – na tri ručno konfigurirana poslužitelja.',
          ]}
          next="Ponedjeljak, 09:00: u tim dolazi Iva. Prvi dan pokrene API na laptopu i kaže: „Kod mene radi, na poslužitelju ne.”"
        />
      </Section>
    </>
  )
}

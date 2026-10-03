import {
  Analogy,
  Callout,
  CodeBlock,
  CostNote,
  DeepDive,
  IncidentCard,
  KeyIdea,
  MarginNote,
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
import { CourseRewind } from './sims/CourseRewind'
import { LocalhostStepper } from './sims/LocalhostStepper'
import { PutStepper } from './sims/PutStepper'
import { DoorsLab } from './sims/DoorsLab'
import { DistanceRuler } from './sims/DistanceRuler'
import { RequestLab } from './sims/RequestLab'
import { DiagnosisChallenge } from './sims/DiagnosisChallenge'
import { DeployStepper } from './sims/DeployStepper'
import gunicornDiff from './code/gunicorn.conf.diff?raw'
import runGunicorn from './code/run-gunicorn.sh?raw'
import serverJs from './code/server.mjs?raw'
import caddyfile from './code/Caddyfile?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Incident: "kod mene radi" */}
      <Section id="incident" kicker="priča" title="Kod mene radi" lead="Lana je napisala aplikaciju za menzu. Na njezinu laptopu radi savršeno – a Petra je ne može otvoriti.">
        <IncidentCard
          no={1}
          when="nedjelja, 21:40"
          title="Lani se Klopa otvara, Petri ne"
          who="lana"
          says="Kod mene radi!"
          preset="lanin-laptop"
          seed={1}
          metrics={[
            { label: 'Lana: 200 OK', value: '20,1 ms', tone: 'ok' },
            { label: 'Petra: odbijeno', value: '0,1 ms', tone: 'bad' },
            { label: 'Petra: istek', value: '5 s (sim)', tone: 'bad' },
          ]}
        >
          Lana je Petri poslala poveznicu <code>http://localhost:8000</code> i Petra je odmah dobila grešku. Onda joj je poslala adresu laptopa, <code>http://192.168.1.23:8000</code>: sada se Petrin mobitel dugo vrti i na
          kraju odustane. „Ne otvara se”, javlja Petra.
        </IncidentCard>
        <p>
          Klopa je aplikacija za naručivanje ručka u studentskoj menzi: odaberete jelo, platite i u podne ga samo pokupite. Lana ju je napisala u Pythonu (Django), a pokreće je programom <code>gunicorn</code>. Petra
          vodi proizvod i htjela je prva isprobati narudžbu. Davor će se brinuti o poslužiteljima – kad ih bude.
        </p>
        <p>
          Dvije različite greške za dvije adrese, a kod Lane sve radi. <strong>Što se zapravo događa kad netko upiše adresu – i zašto Lanin localhost nije i Petrin?</strong> Da bismo to shvatili, pratit ćemo{' '}
          <strong>put jednog zahtjeva</strong>: što se točno dogodi između trenutka kad Petra upiše adresu i trenutka kad se pojavi stranica – ili greška.
        </p>
        <MarginNote>Svaka greška nešto govori. Treba je znati pročitati.</MarginNote>
        <p>
          Ovo je prvo predavanje tečaja koji vodi od jednog laptopa do aplikacije koja u Kubernetesu preživljava podnevnu gužvu, pad poslužitelja i nove verzije usred dana. Kamo idemo? Ovako će Klopa izgledati na kraju –
          a onda je premotajmo unatrag, modul po modul, do onoga što gradimo danas:
        </p>
        <CourseRewind />
      </Section>

      {/* 2 ─ localhost and private addresses */}
      <Section id="localhost" kicker="koncept" title="Zašto Petra ne vidi localhost" lead="Ista adresa na dva uređaja znači dvije različite stvari.">
        <Predict
          question={
            <>
              Lana pošalje Petri poveznicu <code>http://localhost:8000</code>. Petra je otvori na mobitelu. Što će se dogoditi?
            </>
          }
          options={[
            'Otvorit će se Lanina Klopa – poveznica vodi na Lanin laptop.',
            'Mobitel će se pokušati spojiti sam na sebe, a ondje nitko ne odgovara na portu 8000.',
            'DNS će javiti da ime localhost ne postoji.',
            'Zahtjev će otići na internet i tražiti računalo s imenom localhost.',
          ]}
          correct={1}
          explain={
            <>
              <code>localhost</code> (adresa <code>127.0.0.1</code>) uvijek znači „ovo računalo”. Za to ime mobitel ne pita DNS i zahtjev ne izlazi na mrežu: Petrin mobitel spaja se sam na sebe, na port 8000. Ondje Klopa ne radi, pa je
              veza odmah odbijena.
            </>
          }
          then="Pogledajte sva tri pokušaja u animaciji ispod."
        />
        <LocalhostStepper />
        <p>
          <Term id="localhost">localhost</Term> je posebno ime za posebnu adresu, <code>127.0.0.1</code>. Svako računalo, mobitel i poslužitelj ima je i na svakome ona znači isto: <em>ja</em>. Zato je Lanin localhost
          njezin laptop, a Petrin localhost Petrin mobitel. Poveznica s localhostom radi samo na računalu na kojem je i aplikacija.
        </p>
        <MarginNote tone="red">127.0.0.1 nikad ne vodi na tuđe računalo.</MarginNote>
        <p>
          Adresa <code>192.168.1.23</code> je stvarna adresa Lanina laptopa – ali <Term id="private-address">privatna</Term>. Adrese koje počinju s <code>10.</code>, <code>172.16.</code>–<code>172.31.</code> i{' '}
          <code>192.168.</code> rezervirane su za lokalne mreže i ne usmjeravaju se internetom. Lanin kućni usmjerivač (engl. <em>router</em>) radi prevođenje adresa (engl. <em>NAT</em>): svi uređaji u stanu prema van izlaze s jednom javnom
          adresom usmjerivača. Tako se laptop može spajati van, ali izvana nitko ne može započeti vezu prema laptopu. Petra je na mobilnim podatcima, dakle izvana: njezin paket nema kamo stići.
        </p>
        <Analogy
          title="Privatna adresa = broj sobe u studentskom domu"
          who="petra"
          breaksDown="porta u domu će posjetitelja koji pita za Lanu uputiti u njezinu sobu. Kućni usmjerivač to sam ne radi: pušta odgovore na veze koje je laptop započeo, a novu vezu izvana ne zna kome dati – osim ako na njemu netko posebno ne postavi preusmjeravanje porta."
        >
          „Soba 214” ima smisla samo unutar zgrade: soba 214 postoji u svakom domu u gradu. Iz sobe možete nazvati bilo koga, ali tko izvana nazove „sobu 214”, ne zna u kojoj zgradi zvoni.
        </Analogy>
      </Section>

      {/* 3 ─ the journey, step by step */}
      <Section id="put" kicker="korak po korak" title="Put zahtjeva korak po korak" lead={
          <>
            Što se dogodi kad Petra upiše <code>https://klopa.example</code> – paket po paket, s mjerenjem vremena.
          </>
        }>
        <p>
          Zamislimo da Klopa već radi na iznajmljenom virtualnom poslužitelju s javnom adresom, <Term id="vps">VPS</Term>-u u Frankfurtu (kako je tamo stigla, vidjet ćemo
          na kraju predavanja). Petra upiše adresu. Prije nego što stigne ijedan bajt jelovnika, mobitel mora doznati adresu, otvoriti vezu, dogovoriti šifriranje i poslati
          zahtjev. Usput se put može prekinuti na četiri mjesta: <strong>ime</strong> (koje u adresu prevodi <Term id="dns">DNS</Term>), <strong>put do poslužitelja</strong>, <strong>vrata</strong> i{' '}
          <strong>proces</strong> iza njih.
        </p>
        <PutStepper />
        <Analogy
          title="DNS = imenik"
          breaksDown="imenik ne zna javlja li se itko na tom broju ni na kojim je vratima (portu) aplikacija. DNS vraća samo adresu – i to onu koja je upisana, pa i ako je stara."
        >
          Ime se pamti lakše od broja, pa ga potražimo u imeniku: „klopa.example → 203.0.113.10”. Tko je imenik nedavno listao, neko vrijeme pamti broj i ne lista ponovno – koliko dugo smije pamtiti, kaže TTL.
        </Analogy>
        <Callout kind="fact" title="Koliko povratnih putovanja do prvog bajta">
          <ul>
            <li>Nova HTTPS veza s TLS 1.3: TCP (1) + TLS (1) + HTTP (1) = najmanje 3 povratna putovanja. Sa starijim TLS 1.2 rukovanje traje 2, ukupno 4.</li>
            <li>HTTP/3 radi preko protokola QUIC koji spaja prijenos i šifriranje u jedno povratno putovanje.</li>
            <li>Drugi zahtjev na već otvorenoj vezi plaća samo HTTP: jedno povratno putovanje.</li>
          </ul>
        </Callout>
        <DeepDive title="Što je zapravo TCP rukovanje?">
          <p>
            Prije razgovora obje strane moraju znati da druga sluša i dogovoriti brojeve kojima će označavati pakete. Klijent pošalje SYN („želim razgovarati, moj početni broj je x”), poslužitelj odgovori SYN-ACK („i ja; moj početni broj je
            y, x je primljen”), a klijent potvrdi s ACK – i odmah uz to može poslati prvi podatak. Zato rukovanje traje jedno povratno putovanje.
          </p>
          <p>
            Ako na portu nitko ne sluša, operacijski sustav poslužitelja umjesto SYN-ACK odgovori paketom RST – to je <Term id="connection-refused">odbijena veza</Term>. Ako ne stigne ništa, klijent ponavlja SYN sve
            rjeđe i na kraju odustane – <Term id="timeout">istek vremena</Term>.
          </p>
        </DeepDive>
        <h3>Udaljenost je latencija</h3>
        <p>
          <Term id="latency">Latencija</Term> je vrijeme koje prođe od slanja zahtjeva do odgovora. Velik dio nje u internetu ne ovisi o brzini poslužitelja nego o fizici: signal u optičkom vlaknu putuje oko 200 000 km u
          sekundi, otprilike dvije trećine brzine svjetlosti u vakuumu. Za put tamo i natrag to je najmanje <strong>1 ms na svakih 100 km</strong>.
        </p>
        <MarginNote>100 km udaljenosti ≈ 1 ms tamo i natrag</MarginNote>
        <DistanceRuler />
        <p>
          Za poslužitelj u Sydneyu nova HTTPS veza traje najmanje 3 × 160 ms = 480 ms prije prvog bajta – i to je donja granica: kabeli ne idu zračnom linijom, a usmjerivači usput zadrže pakete. Nikakvo
          optimiziranje koda to ne skraćuje. Pomaže samo manje povratnih putovanja (npr. ponovno korištenje već otvorene veze) ili poslužitelj bliže korisnicima. Klopa je za studente u Hrvatskoj, pa je Frankfurt dobar
          izbor.
        </p>
      </Section>

      {/* 4 ─ bind address, ports, firewall, NAT */}
      <Section id="vrata" kicker="isprobajte" title="Tko sluša na kojim vratima" lead="IP adresa vodi do računala, port do procesa – ali samo ako proces sluša na pravoj adresi.">
        <p>
          Računalo ima više adresa: barem <code>127.0.0.1</code> i adresu na mreži (javnu na poslužitelju, privatnu kod kuće). Proces koji čeka zahtjeve kaže operacijskom sustavu na kojoj adresi i kojem{' '}
          <Term id="port">portu</Term> sluša – to je njegova <Term id="bind-address">adresa slušanja</Term>:
        </p>
        <ul>
          <li>
            <code>127.0.0.1:8000</code> – samo zahtjevi s istog računala;
          </li>
          <li>
            <code>0.0.0.0:8000</code> (za IPv6 <code>[::]:8000</code>) – na svim adresama tog računala.
          </li>
        </ul>
        <p>
          Zadane vrijednosti nisu iste u svim alatima: gunicorn i Djangov <code>runserver</code> bez dodatne opcije slušaju na <code>127.0.0.1:8000</code>, a Node.js sa <code>server.listen(8000)</code> sluša na svim
          adresama. Zato ista greška nekome „nikad nije bila problem”.
        </p>
        <p>
          Ispred svih vrata stoji još i <Term id="firewall">vatrozid</Term> (engl. <em>firewall</em>): propušta samo pakete za portove koje smo dopustili. Na VPS-u je to vatrozid pružatelja usluga u oblaku ili <code>ufw</code> – kad
          je uključen, ostale pakete po zadanom tiho odbacuje. Bez vatrozida zatvoren port odmah odgovara odbijanjem.
        </p>
        <DoorsLab />
        <Analogy
          title="IP adresa i port = zgrada i vrata stana"
          who="lana"
          breaksDown="vrata stana možete zaključati, a port nije brava: tko god dođe do otvorenog porta, može pokucati. Štiti vatrozid ispred zgrade. Usto, iza jedne adrese i porta po zadanom živi točno jedan proces – stan s jednim stanarom."
        >
          IP adresa dovede paket do zgrade, a port do vrata određenog stana. Ako u stanu nitko ne živi, netko s porte odmah kaže „nema ga” – to je odbijena veza. Ako je ulaz u zgradu zazidan, nitko ne kaže ništa.
        </Analogy>
        <Callout kind="warn" title="0.0.0.0 nije adresa za posjet">
          <code>0.0.0.0</code> se piše samo u postavkama poslužitelja i znači „sve moje adrese”. U preglednik se upisuje stvarna adresa ili ime, npr. <code>http://klopa.example:8000</code>.
        </Callout>
        <DeepDive title="Može li više procesa slušati na istom portu?">
          <p>
            Po zadanom ne: drugi proces dobije grešku <code>Address already in use</code>. Postoje dvije namjerne iznimke. Opcija <code>SO_REUSEPORT</code> dopušta da nekoliko procesa otvori isti port, a jezgra
            operacijskog sustava dijeli nove veze među njima. Češći je drugi obrazac: gunicornov glavni proces (<em>master</em>) otvori port jednom, a radnici dijele tu istu utičnicu; kod Nodeova modula{' '}
            <code>cluster</code> glavni proces po zadanom sam prima veze i dijeli ih radnicima.
          </p>
          <p>
            Na kućnom usmjerivaču može se postaviti preusmjeravanje porta (engl. <em>port forwarding</em>): jedan vanjski port prosljeđuje se na laptop. Ali laptop se gasi, kućna adresa se mijenja, mobilne i kampusne mreže to često ne dopuštaju – a otvoren
            laptop na internetu je sigurnosni rizik. Zato aplikacije za druge ljude žive na poslužiteljima s javnom adresom.
          </p>
        </DeepDive>
      </Section>

      {/* 6 ─ flagship simulation */}
      <Section id="simulacija" kicker="simulacija" title="Pokvarite put zahtjeva" lead="Sada sve zajedno: odaberite gdje radi Klopa, tko šalje zahtjev i što je pokvareno.">
        <Predict
          question="Na jednom poslužitelju vatrozid tiho odbacuje pakete na port 8000. Na drugom ih propušta, ali gunicorn ne radi. Petra otvara oba. Gdje će dulje čekati na grešku?"
          options={['Jednako dugo – ne radi ni jedan ni drugi.', 'Kod vatrozida: čekat će dok ne odustane.', 'Kod ugašene aplikacije: poslužitelj mora pričekati da se proces probudi.', 'Nigdje – obje greške stižu odmah.']}
          correct={1}
          explain="Kad gunicorn ne radi, na portu 8000 nitko ne sluša: operacijski sustav poslužitelja odmah vrati RST i Petra dobije odbijenu vezu nakon jednog povratnog putovanja. Vatrozid s pravilom DROP ne vraća ništa, pa Petrin mobitel čeka dok ne odustane."
        />
        <RequestLab />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <table className={styles.symptoms}>
            <thead>
              <tr>
                <th>Simptom</th>
                <th>Kada stiže</th>
                <th>Što znači</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>NXDOMAIN</code>
                </td>
                <td>nakon DNS upita</td>
                <td>ime ne postoji – nijedan paket nije krenuo prema poslužitelju</td>
              </tr>
              <tr>
                <td>odbijena veza</td>
                <td>nakon jednog povratnog putovanja</td>
                <td>paket je stigao, ali na tom portu nitko ne sluša (aplikacija ne radi ili sluša samo na 127.0.0.1)</td>
              </tr>
              <tr>
                <td>istek vremena</td>
                <td>tek kad klijent odustane</td>
                <td>paketu nitko ne odgovara: vatrozid ga tiho odbacuje ili je adresa stara ili privatna</td>
              </tr>
              <tr>
                <td>
                  <code>502 Bad Gateway</code>
                </td>
                <td>nakon TCP-a, TLS-a i HTTP-a</td>
                <td>proxy radi, ali se ne može spojiti na aplikaciju iza sebe</td>
              </tr>
            </tbody>
          </table>
        </Callout>
        <KeyIdea>
          Svaki simptom pokazuje na jedan sloj: <strong>ime</strong>, <strong>put do poslužitelja</strong>, <strong>vrata</strong> ili <strong>proces</strong>. „Odbijeno” i „istek vremena” pričaju različite priče – a
          udaljenost košta vrijeme koje nijedan kod ne može ukloniti.
        </KeyIdea>
        <Callout kind="info" title="Što je stvarno, a što pojednostavljeno">
          <ul>
            <li>
              <strong>Stvarno:</strong> redoslijed DNS → TCP → TLS → HTTP, broj povratnih putovanja, RST kad nitko ne sluša i tišina kad vatrozid paket odbaci (pravilo REJECT umjesto DROP odgovorilo bi odmah i izgledalo
              kao odbijena veza).
            </li>
            <li>
              <strong>Donje granice:</strong> RTT je izračunan iz udaljenosti zračnom linijom; stvarni je uvijek veći.
            </li>
            <li>
              <strong>Sažeto:</strong> klijent u simulaciji odustaje nakon 5 s. Stvarni preglednici i operacijski sustavi čekaju desetke sekundi – Linux bez ikakvog odgovora na SYN odustaje tek nakon otprilike dvije
              minute.
            </li>
            <li>
              <strong>Primjeri:</strong> DNS od 12 ms i obrada od 20 ms nisu pravilo; ovise o razrješivaču i aplikaciji. Crtež nije u mjerilu, a IPv6 i ponovno korištenje veza izostavili smo. Petrin mobitel i sam je iza NAT-a operatera:{' '}
              <code>198.51.100.23</code> je javna adresa operatera koju poslužitelj vidi kao izvor.
            </li>
          </ul>
        </Callout>
      </Section>

      {/* 7 ─ diagnosis challenge */}
      <Section id="dijagnoza" kicker="izazov" title="Četiri prijave kvara" lead="Davor sve vidi na poslužitelju. Petra vidi samo svoj mobitel – i to je često sve što dobijete u prijavi kvara.">
        <p>
          Kad netko javi „Klopa ne radi”, prvo pitanje nije „što je pokvareno?” nego „<em>što točno vidite</em> i koliko ste čekali?”. Ovdje su četiri Petrine poruke iz jednog tjedna. Pošaljite isti zahtjev kao
          ona i iz simptoma zaključite koji je sloj pokvaren.
        </p>
        <DiagnosisChallenge />
        <Terminal
          title="Lanin terminal"
          caption="Isti simptomi u naredbi curl: broj greške i vrijeme govore koji je sloj pokvaren."
          lines={[
            { comment: 'Ime ne postoji: curl ni ne pokuša otvoriti vezu' },
            { cmd: 'curl https://narudzbe.klopa.example' },
            { out: 'curl: (6) Could not resolve host: narudzbe.klopa.example', tone: 'bad' },
            { comment: 'Nitko ne sluša na portu: odbijeno za jedno povratno putovanje' },
            { cmd: 'curl http://klopa.example:8000' },
            { out: "curl: (7) Failed to connect to klopa.example port 8000 after 19 ms: Couldn't connect to server", tone: 'bad', note: '19 ms: brzo „ne”, dakle paket je stigao.', who: 'davor' },
            { comment: 'Vatrozid tiho odbacuje: curl čeka koliko mu dopustimo' },
            { cmd: 'curl --connect-timeout 5 http://klopa.example:8000' },
            { out: 'curl: (28) Failed to connect to klopa.example port 8000 after 5002 ms: Timeout was reached', tone: 'bad' },
            { comment: 'Proxy radi, aplikacija ne: HTTP odgovor sa statusom 502' },
            { cmd: 'curl -sI https://klopa.example' },
            { out: 'HTTP/2 502\nserver: Caddy', tone: 'bad' },
          ]}
        />
      </Section>

      {/* 8 ─ first deploy + code */}
      <Section id="postavljanje" kicker="kod i postavljanje" title="Prvo postavljanje: s laptopa na poslužitelj" lead="Da bi Petra vidjela Klopu, Klopa mora raditi na računalu s javnom adresom – i slušati na pravim vratima.">
        <p>
          Sad znamo što treba: računalo s <strong>javnom IP adresom</strong>, aplikaciju koja sluša na adresi dostupnoj izvana (ili proxy ispred nje), otvoren port u vatrozidu i <strong>ime u DNS-u</strong>. Takvo
          računalo ne moramo kupiti – iznajmimo VPS.
        </p>
        <DeployStepper />
        <Callout kind="tip" title="Postavljanje nije Deployment">
          <Term id="deploy">Postaviti</Term> aplikaciju (engl. <em>deploy</em>) znači dovesti neku verziju do toga da radi u nekom okruženju – ovdje ručno, na jednom poslužitelju. <strong>Deployment</strong> s velikim D je nešto drugo: objekt u
          Kubernetesu koji upoznajemo u 13. predavanju.
        </Callout>
        <p>Klopa sada izgleda ovako – i to je prva stranica Klopa karte. Svako sljedeće predavanje dodat će joj po jedan dio, i to tek kad nas nešto natjera:</p>
        <StoryMap at="01" />
        <h3>Isto to u konfiguraciji</h3>
        <p>
          Prekidač „Sluša samo na 127.0.0.1” iz simulacije u stvarnosti je jedna linija konfiguracije: adresa slušanja <code>127.0.0.1</code> ili <code>0.0.0.0</code>.
        </p>
        <Tabs
          tabs={[
            {
              label: 'gunicorn.conf.py',
              content: (
                <CodeBlock
                  title="gunicorn.conf.py"
                  lang="diff"
                  code={gunicornDiff}
                  mode="open"
                  caption="Jedna promjena dijeli „radi samo kod mene” od „radi i za Petru”."
                  notes={[
                    { lines: '4', text: 'zadano: samo ovo računalo (127.0.0.1)' },
                    { lines: '5', text: 'sve adrese – i javna 203.0.113.10' },
                  ]}
                />
              ),
            },
            {
              label: 'naredbe',
              content: (
                <CodeBlock
                  title="pokretanje.sh"
                  lang="bash"
                  code={runGunicorn}
                  caption="Isto preko naredbenog retka; gunicorn u zapisniku kaže gdje sluša."
                  notes={[
                    { lines: '2-3', text: 'bez --bind: samo 127.0.0.1' },
                    { lines: '10', text: 'iza proxyja: namjerno samo iznutra' },
                  ]}
                />
              ),
            },
            {
              label: 'Node.js',
              content: (
                <CodeBlock
                  title="server.mjs"
                  lang="javascript"
                  code={serverJs}
                  mode="open"
                  caption="Node ima suprotan zadani izbor: bez adrese sluša posvuda."
                  notes={[
                    { lines: '8', text: 'bez adrese: :: i 0.0.0.0 – sve adrese' },
                    { lines: '11', text: 'samo ovo računalo' },
                  ]}
                />
              ),
            },
          ]}
        />
        <CodeBlock
          title="Caddyfile"
          lang="nginx"
          code={caddyfile}
          mode="open"
          caption="Cijela konfiguracija proxyja: ime, certifikat i prosljeđivanje na 127.0.0.1:8000."
          notes={[
            { lines: '2', text: 'ime za koje Caddy nabavi certifikat' },
            { lines: '4', text: 'prosljeđuje aplikaciji na istom stroju' },
          ]}
        />
        <Terminal
          title="Lanin laptop"
          caption="curl -v ispisuje svaki korak puta. Ispis je skraćen."
          lines={[
            { cmd: 'curl -v https://klopa.example/' },
            { comment: '① DNS: ime → IP adresa' },
            { out: '* Host klopa.example:443 was resolved.\n* IPv4: 203.0.113.10', tone: 'muted' },
            { comment: '② TCP: veza na adresu i port' },
            { out: '*   Trying 203.0.113.10:443...\n* Connected to klopa.example (203.0.113.10) port 443' },
            { comment: '③ TLS 1.3: certifikat i ključevi' },
            { out: '* TLSv1.3 (OUT), TLS handshake, Client hello (1):\n* TLSv1.3 (IN), TLS handshake, Server hello (2):\n*  subject: CN=klopa.example' },
            { comment: '④ HTTP: zahtjev (>) i odgovor (<)' },
            { out: '> GET / HTTP/2\n> Host: klopa.example\n< HTTP/2 200\n< server: Caddy', tone: 'ok', note: 'Statusni kod 200 – Petra vidi jelovnik.', who: 'lana' },
          ]}
        />
        <DeepDive title="dig i ss: što kaže DNS i tko sluša">
        <Terminal
          title="VPS"
          caption="dig pita DNS, a ss pokazuje tko na poslužitelju sluša na kojoj adresi i portu."
          lines={[
            { comment: 'Što DNS kaže za ime – kratko, pa s TTL-om' },
            { cmd: 'dig +short klopa.example' },
            { out: '203.0.113.10' },
            { cmd: 'dig klopa.example | grep -A1 "ANSWER SECTION"' },
            { out: ';; ANSWER SECTION:\nklopa.example.    300    IN    A    203.0.113.10' },
            { cmd: 'dig narudzbe.klopa.example | grep status' },
            { out: ';; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 40213', tone: 'bad' },
            { comment: 'Tko sluša? (stupci i retci skraćeni)' },
            { cmd: 'sudo ss -ltnp' },
            {
              out: 'State   Local Address:Port   Process\nLISTEN  0.0.0.0:22           users:(("sshd",pid=701,fd=3))\nLISTEN  *:80                 users:(("caddy",pid=640,fd=6))\nLISTEN  *:443                users:(("caddy",pid=640,fd=7))\nLISTEN  127.0.0.1:8000       users:(("gunicorn",pid=812,fd=5))',
              note: 'gunicorn sluša samo iznutra – izvana do njega dolazi samo Caddy.',
              who: 'davor',
            },
          ]}
        />
        </DeepDive>
        <DeepDive title="Zašto je aplikacija iza proxyja sigurnija na 127.0.0.1">
          <p>
            Kad Caddy i gunicorn rade na istom stroju, Caddy aplikaciju doseže preko <code>127.0.0.1:8000</code>. Ako gunicorn sluša samo ondje, nitko izvana ne može zaobići proxy i razgovarati s aplikacijom izravno,
            nešifrirano – čak ni ako netko greškom otvori port 8000 u vatrozidu. Proxy usto sam obnavlja certifikat, a kasnije će raspoređivati promet na više kopija aplikacije.
          </p>
        </DeepDive>
      </Section>

      {/* 9 ─ myths, recap, quiz */}
      <Section id="sazetak" kicker="sažetak" title="Zablude, sažetak i provjera">
        <MythOrFact
          items={[
            {
              statement: 'localhost je moj poslužitelj.',
              fact: false,
              explain: (
                <>
                  <code>localhost</code> (<code>127.0.0.1</code>) uvijek znači računalo koje šalje zahtjev. Na Petrinu mobitelu to je Petrin mobitel.
                </>
              ),
            },
            {
              statement: 'Domena pokazuje na moju aplikaciju.',
              fact: false,
              explain: 'DNS vraća samo IP adresu. Port je zaseban dio adrese (zadano 80 za http i 443 za https), a DNS ne zna radi li aplikacija uopće.',
            },
            {
              statement: 'Connection refused znači da je poslužitelj spor.',
              fact: false,
              explain: 'Odbijena veza stiže brzo: paket je stigao, ali na tom portu nitko ne sluša. Tiho odbačen ili nedostupan paket izgleda drukčije – kao istek vremena.',
            },
            {
              statement: (
                <>
                  Ako aplikacija sluša na <code>0.0.0.0</code>, svi je mogu dohvatiti.
                </>
              ),
              fact: false,
              explain: (
                <>
                  <code>0.0.0.0</code> znači „sve adrese ovog računala”. Laptop iza NAT-a ima samo privatnu adresu; treba javna IP adresa i otvoren port u vatrozidu.
                </>
              ),
            },
            { statement: 'Latencija se može optimizirati do nule.', fact: false, explain: 'Brzina svjetlosti postavlja donju granicu: oko 1 ms povratnog puta na svakih 100 km, i to po svakom povratnom putovanju.' },
          ]}
        />
        <Recap
          points={[
            'Put zahtjeva: ime → IP adresa (DNS) → TCP veza na IP adresu i port → TLS (za https) → HTTP zahtjev procesu koji sluša na tom portu → odgovor sa statusnim kodom.',
            'localhost (127.0.0.1) uvijek znači „ovo računalo”. Proces koji sluša na 127.0.0.1 dostupan je samo iznutra, a privatna adresa iza NAT-a nije dostupna s interneta.',
            'Simptom pokazuje sloj: NXDOMAIN = ime; odbijena veza (brzo) = nitko ne sluša; istek vremena (sporo) = paketu nitko ne odgovara; 502 = proxy radi, a aplikacija iza njega ne prima veze.',
            'Udaljenost je latencija: najmanje 1 ms povratnog puta na 100 km, a nova HTTPS veza traje najmanje 3 povratna putovanja do prvog bajta.',
            'Postaviti aplikaciju znači: poslužitelj s javnom adresom, proces koji sluša na pravoj adresi i portu, otvoren vatrozid i DNS zapis – u praksi s proxyjem i TLS-om ispred.',
          ]}
        />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Petra javi da joj preglednik gotovo odmah prikaže <code>ERR_CONNECTION_REFUSED</code>. Što je najvjerojatnije?
                </>
              ),
              options: [
                <>
                  Ime <code>klopa.example</code> ne postoji u DNS-u.
                </>,
                'Paket je stigao do poslužitelja, ali na tom portu nitko ne sluša.',
                'Vatrozid tiho odbacuje pakete.',
                'Poslužitelj je preopterećen pa odgovara sporo.',
              ],
              correct: 1,
              explain:
                'Odbijena veza je brz odgovor „ne”: operacijski sustav poslužitelja vratio je RST jer na tom portu nitko ne sluša (aplikacija ne radi ili sluša samo na 127.0.0.1). Nepostojeće ime javlja se kao NXDOMAIN, a vatrozid koji tiho odbacuje pakete daje istek vremena.',
            },
            {
              q: (
                <>
                  Lana na VPS-u pokrene <code>gunicorn klopa.wsgi</code>. Na samom poslužitelju <code>curl http://localhost:8000</code> vraća 200, a Petra s <code>http://klopa.example:8000</code> dobiva odbijenu vezu.
                  Vatrozid propušta port 8000. Zašto?
                </>
              ),
              options: [
                'DNS zapis još nije stigao do Petrina operatera.',
                <>
                  <code>gunicorn</code> bez <code>--bind</code> sluša samo na <code>127.0.0.1:8000</code>.
                </>,
                'Petrin mobitel blokira port 8000.',
                'Petrin operater blokira sve portove osim 80 i 443.',
              ],
              correct: 1,
              explain: (
                <>
                  Zadana adresa slušanja gunicorna je <code>127.0.0.1:8000</code>: zahtjevi s istog računala prolaze, a paket koji stigne na javnu adresu <code>203.0.113.10:8000</code> ne nalazi nikoga i dobiva
                  RST. Blokada kod operatera izgledala bi drukčije – kao istek vremena. Rješenje je <code>--bind 0.0.0.0:8000</code> ili, bolje, proxy ispred aplikacije.
                </>
              ),
            },
            {
              q: 'Poslužitelj je u Ashburnu, 7254 km od Zagreba (RTT najmanje 72,5 ms). Koliko je najmanje vremena do prvog bajta odgovora za novu HTTPS vezu s TLS 1.3, ako ne računamo DNS ni obradu?',
              options: ['72,5 ms', '145 ms', '217,5 ms', '36 ms'],
              correct: 2,
              explain: 'Nova HTTPS veza treba tri povratna putovanja prije prvog bajta: TCP (1) + TLS 1.3 (1) + HTTP (1). To je 3 × 72,5 ms = 217,5 ms – i to je donja granica; stvarno je više.',
            },
            {
              q: 'Klopa je preseljena na novi poslužitelj i Lana je promijenila DNS zapis. Neki studenti još neko vrijeme dobivaju istek vremena, a drugima sve radi. Što se događa?',
              options: [
                'Novi poslužitelj ne podnosi promet pa odbacuje dio zahtjeva.',
                'Njihovi razrješivači još pamte stari zapis (TTL) i šalju ih na adresu na kojoj više nitko ne odgovara.',
                'Stari poslužitelj im odbija vezu.',
                'Njihovi mobiteli imaju privatnu adresu iza NAT-a.',
              ],
              correct: 1,
              explain:
                'DNS odgovori pamte se onoliko koliko kaže TTL. Dok ne istekne, dio klijenata dobiva staru adresu. Ako je stari poslužitelj ugašen, paket nitko ne prima i klijent čeka do isteka vremena. Zato se TTL prije selidbe smanji.',
            },
            {
              q: (
                <>
                  Lana pokrene Klopu na laptopu s <code>--bind 0.0.0.0:8000</code>. Petra je na mobilnim podatcima. Hoće li joj <code>http://192.168.1.23:8000</code> raditi?
                </>
              ),
              options: [
                <>
                  Hoće – <code>0.0.0.0</code> znači da aplikacija sluša na svim adresama.
                </>,
                <>
                  Neće – <code>192.168.1.23</code> je privatna adresa i s interneta do nje nema puta.
                </>,
                'Hoće, ali tek nakon što DNS zapis istekne.',
                'Neće – Petra dobiva NXDOMAIN jer to nije ime.',
              ],
              correct: 1,
              explain:
                '0.0.0.0 znači „sve adrese ovog računala”, a laptop ima samo privatnu adresu iza kućnog usmjerivača. Petrin paket nema kamo stići, pa čeka do isteka vremena. Na istoj Wi-Fi mreži radilo bi; za internet treba javna adresa.',
            },
            {
              q: (
                <>
                  Klopa radi iza Caddyja na istom poslužitelju. <code>gunicorn</code> se sruši. Što vidi Petra kad otvori <code>https://klopa.example</code>?
                </>
              ),
              options: ['ERR_CONNECTION_REFUSED', 'NXDOMAIN', 'Istek vremena', '502 Bad Gateway'],
              correct: 3,
              explain: (
                <>
                  Caddy i dalje radi i prihvaća Petrinu vezu na portu 443, ali njegova veza prema <code>127.0.0.1:8000</code> je odbijena. Zato Petri odgovara on: 502 Bad Gateway – „ne mogu doći do aplikacije”.
                  Odbijena veza bila bi da ni Caddy ne radi.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* 10 ─ the price of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Klopa radi na poslužitelju s javnom adresom i Petra je napokon vidi.',
            <>
              Ime <code>klopa.example</code> vodi do poslužitelja, a Caddy daje HTTPS.
            </>,
            'Po simptomu znamo pronaći sloj na kojem je put prekinut.',
          ]}
          paid={[
            'Sve radi na jednom poslužitelju s dvije procesorske jezgre i 2 GB RAM-a – kapacitet ima strop.',
            'Kad taj poslužitelj padne, pada cijela Klopa.',
            'Postavljanje je ručno: kopirati kod, ponovno pokrenuti gunicorn.',
          ]}
          next="Ponedjeljak, 12:00. Cijeli kampus otkrio je Klopu i stranica se počinje vući: najsporiji odgovori stižu tek nakon 3 s, a otprilike svaki drugi zahtjev dobiva grešku 503. Procesor je pritom na 17 %. Kako poslužitelj može biti pun dok procesor odmara?"
        />
      </Section>
    </>
  )
}

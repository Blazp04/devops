import {
  Analogy,
  Badge,
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
  Section,
  StoryMap,
  Term,
  Terminal,
} from '../../kit'
import { DetectionWindow } from './sims/DetectionWindow'
import { FourFaults } from './sims/FourFaults'
import { BlackHole } from './sims/BlackHole'
import { CapacityN1 } from './sims/CapacityN1'
import { CartSim } from './sims/CartSim'
import { FlagshipSim } from './sims/FlagshipSim'
import { CacheFigure } from './sims/CacheFigure'
import { ReplicaLag } from './sims/ReplicaLag'
import { VipStepper } from './sims/VipStepper'
import nginxConf from './code/nginx-provjere.conf?raw'
import healthzPy from './code/healthz.py?raw'
import sessionsDiff from './code/sesije-redis.diff?raw'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section id="incident" kicker="priča" title="Veliki pada usred ručka" lead="Load balancer još dvije sekunde šalje narudžbe mrtvom poslužitelju, a studentima se prazne košarice.">
        <IncidentCard
          no={5}
          when="utorak, 12:03"
          title="Veliki se srušio, a load balancer mu i dalje šalje narudžbe"
          who="davor"
          says={['37 narudžbi', 'za 2 sekunde!']}
          preset="„Incident 12:03” (najmanje veza, 15 zahtjeva/s, pad procesa na S3 u 12:03:00, 30 s)"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '15' },
            { label: 'propalo za 2 s', value: '37', tone: 'bad' },
            { label: 'greške u 30 s', value: '8,0 %', tone: 'bad' },
            { label: 'odjava u 30 s (20 studenata)', value: '249', tone: 'bad' },
          ]}
        >
          Procesu na Velikom (S3, 4 vCPU · 8 GB) ponestalo je memorije i srušio se. Nakon pokusa sa sporim procesorom Davor je load balancer prebacio na algoritam „najmanje veza” – i prije nego što je load balancer shvatio da Velikog
          nema, propalo je 37 narudžbi. Istodobno studenti javljaju da im se košarica ispraznila i da su odjavljeni.
        </IncidentCard>
        <p>
          Nakon prošlog predavanja ispred Klope stoji <Term id="load-balancer">load balancer</Term>, a iza njega tri poslužitelja: Mali (S1), Srednji (S2) i Veliki (S3). Ideja je bila jednostavna: ako jedan padne, ostala dva
          preuzmu posao. U 12:03 Veliki je stvarno pao – i pokazalo se da „preuzmu posao” ne ide samo od sebe. Tog dana load balancer je za kvar
          mogao doznati samo iz aktivne provjere ispravnosti, koja kuca u svom ritmu. A odjave? Počele su i prije pada – zašto, vidjet ćemo u
          odjeljku o košarici.
        </p>
        <p>U ovom predavanju odgovaramo na dva pitanja iz incidenta:</p>
        <ul>
          <li>
            <strong>Zašto load balancer kasni</strong> – i zašto je baš najpametniji algoritam iz prošlog predavanja izgubio najviše narudžbi?
          </li>
          <li>
            <strong>Gdje bi zapravo trebala živjeti košarica</strong> da je pad jednog poslužitelja ne odnese sa sobom?
          </li>
        </ul>
      </Section>

      {/* 2 · detection window */}
      <Section id="prozor" kicker="koncept" title="Prozor otkrivanja" lead="Load balancer ne vidi što se događa unutar poslužitelja. Zna samo ono što izmjeri – a mjerenje traje.">
        <MarginNote>kuc-kuc = GET /healthz</MarginNote>
        <p>
          Load balancer ne zna je li proces na S3 živ. Može ga samo pitati. Svakih nekoliko sekundi pošalje mu mali zahtjev na posebnu adresu, recimo <code>/healthz</code>, i čeka odgovor <code>200</code>. To je{' '}
          <Term id="health-check">provjera ispravnosti</Term> (engl. <em>health check</em>), točnije <strong>aktivna</strong> provjera: load balancer je šalje sam, u stalnom ritmu, bez obzira na promet.
        </p>
        <p>
          Jedan neuspjeh ne znači mnogo: mreža je mogla izgubiti paket, a poslužitelj je mogao na trenutak zastati. Zato load balancer poslužitelj izbacuje tek nakon <strong>U neuspjeha zaredom</strong> (prag), a vraća ga u promet
          tek nakon <strong>H uspjeha zaredom</strong>. Prag štiti od lažnih uzbuna, ali ima cijenu: između pada i izbacivanja uvijek prođe neko vrijeme.
        </p>
        <Predict
          question="Load balancer provjerava S3 svake 2 sekunde i izbacuje ga nakon dviju neuspjelih provjera zaredom. Proces na S3 padne. Koliko dugo load balancer još šalje narudžbe na S3?"
          options={['Nimalo – load balancer odmah vidi da je proces pao.', 'Najviše 2 sekunde.', 'Između 2 i 4 sekunde, ovisno o tome kada je proces pao.', 'Sve dok netko ručno ne ukloni S3.']}
          correct={2}
          explain="Prva neuspjela provjera stiže najkasnije za jedan interval, a potrebne su dvije zaredom. Padne li proces tik prije provjere, prozor traje oko 2 s; padne li odmah nakon nje, gotovo 4 s. Općenito: između (U − 1) · interval i U · interval."
          then="Provjerite na vremenskoj crti ispod: pomičite trenutak pada."
        />
        <DetectionWindow />
        <p>
          Crveni pojas je <strong>prozor otkrivanja</strong>: vrijeme u kojem je proces već mrtav, a load balancer mu i dalje vjeruje. Sve narudžbe poslane u njega propadaju. Prozor nikad nije nula – može samo biti kraći ili dulji. Ako
          proces <em>visi</em>, prozor je još dulji: svaka provjera čeka odgovor dok joj ne istekne vrijeme (ovdje 1 s).
        </p>
        <Callout kind="fact" title="Koliko to traje u stvarnosti">
          AWS Application Load Balancer zadano provjerava svakih 30 s, na odgovor čeka 5 s, poslužitelj izbacuje nakon 2 neuspjeha, a vraća ga nakon 5 uspjeha. Srušeni poslužitelj tako još <strong>30–60 s</strong> dobiva promet
          (do ≈65 s ako visi), a popravljeni se vraća tek nakon ≈150 s. Simulacije u ovom predavanju zato su ubrzane – provjera svake <Badge tone="neutral">2 s (sim) · stvarno: 30 s</Badge>
        </Callout>
        <h3>Brži svjedok: sam promet</h3>
        <p>
          Aktivna provjera kuca u svom ritmu, a pravi zahtjevi u podne stižu petnaest puta u sekundi. Zašto ne gledati i njih? To radi <Term id="passive-health-check">pasivna provjera</Term> (engl. <em>passive health check</em>): ako se
          veza prema poslužitelju ne može uspostaviti, load balancer ga odmah izbacuje na neko vrijeme. NGINX to radi i bez ikakve postavke: jedan neuspjeli pokušaj spajanja – i poslužitelj je 10 sekundi izvan prometa,
          a narudžba se odmah pokuša na drugom poslužitelju.
        </p>
        <p>
          Zašto to onda nije spasilo Klopu? U pokusu sa sporim procesorom NGINX je usporenog Velikog povremeno izbacivao, pa je Davor isključio i pasivnu provjeru i ponovni pokušaj (<code>max_fails=0</code>,{' '}
          <code>proxy_next_upstream off</code>). Ostala je samo aktivna provjera – a nju NGINX otvorenog koda nema. Radila ju je Davorova skripta: u stalnom ritmu kucne na <code>/healthz</code> svakog poslužitelja, a onaj
          koji dvaput zaredom ne odgovori u NGINX-u označi kao <code>down</code>.
        </p>
        <p>
          Pasivna provjera ne zna ništa o poslužitelju na koji promet trenutačno ne ide, pa ni ne zna kada se popravio: nakon 10 s jednostavno pokuša s pravim zahtjevom – a ako poslužitelj još ne radi, taj zahtjev plati
          student. Zato se dvije vrste provjera nadopunjuju: pasivna brzo reagira na pravi promet, a aktivna redovito provjerava sve poslužitelje.
        </p>
      </Section>

      {/* 3 · four failure modes */}
      <Section id="simptomi" kicker="isprobajte" title="Pad, gašenje, zastoj ili pražnjenje" lead="Poslužitelj može prestati raditi na četiri načina – i svaki izgleda drukčije.">
        <p>
          Sjetite se prvog predavanja: kad na adresi nitko ne sluša, operacijski sustav odmah vrati <Term id="connection-refused">odbijenu vezu</Term>; kad stroj šuti, klijent čeka dok mu ne istekne strpljenje. Load balancer vidi
          iste dvije stvari. Pokrenimo četiri jednaka ručka i u svakom pokvarimo poslužitelj A na drukčiji način.
        </p>
        <FourFaults />
        <ul>
          <li>
            <strong>Pad procesa.</strong> Stroj radi, ali na portu 8000 nitko ne sluša. Jezgra operacijskog sustava vezu odmah odbije, a load balancer klijentu vrati <strong>502 Bad Gateway</strong> – za nekoliko milisekundi. Brzo i
            glasno.
          </li>
          <li>
            <strong>Ugašen stroj.</strong> Nema ni procesa ni operacijskog sustava koji bi vezu odbio – paketi jednostavno nestaju. Load balancer čeka da mu istekne vrijeme za spajanje i tek tada vraća{' '}
            <strong>504 Gateway Timeout</strong>. Zahtjevi koji su već bili unutra vise dok klijent ne odustane.
          </li>
          <li>
            <strong>Zastoj.</strong> Veza se uspostavi, zahtjev uđe – i ništa. Klijent nakon 5 s odustaje. Najpodmuklije od svega: poslužitelj „radi”, samo ne odgovara. Pasivna provjera ga ne izbacuje: veza je uspjela,
            a klijent odustane prije nego što load balanceru istekne čekanje na odgovor (NGINX zadano čeka 60 s).
          </li>
          <li>
            <strong>
              <Term id="connection-draining">Pražnjenje</Term>
            </strong>{' '}
            (engl. <em>connection draining</em>). Planirani odlazak: load balancer poslužitelju više ne šalje nove zahtjeve, a započeti se dovrše. Kad više ništa nije u
            obradi, poslužitelj se smije ugasiti – bez ijedne greške.
          </li>
        </ul>
        <p>
          Vremena su i ovdje ubrzana. Load balancer na spajanje čeka <Badge tone="neutral">1 s (sim) · stvarno: 60 s</Badge> (zadano u NGINX-u; AWS ALB čeka 10 s), a
          klijent odustaje nakon <Badge tone="neutral">5 s (sim)</Badge> – pravi preglednik čeka i dulje.
        </p>
        <Callout kind="tip" title="Pravilo za dežurne">
          Brzi 502 znači da proces ne sluša. Spori 504 znači da stroj ili proces šuti. Spori 504 kod dijela studenata, a u logu aplikacije nijedne greške? Provjerite nije li proces zamrznut.
        </Callout>
      </Section>

      {/* 4 · black hole and N+1 */}
      <Section id="crna-rupa" kicker="koncept" title="Crna rupa i rezerva" lead="Najpametniji algoritam iz prošlog predavanja najgore podnosi pad. A i kad load balancer reagira, preživjeli moraju imati snage.">
        <p>
          U incidentu je load balancer izbacio S3 za 2 sekunde. Kružno raspoređivanje u te dvije sekunde S3-u šalje svaku treću narudžbu, pa ih propadne 11. Algoritam najmanje veza izgubi 37. Zašto?
        </p>
        <p>
          Srušeni proces sve odbija odmah: 502 za nekoliko milisekundi. Zato S3 nikad nema nijednu aktivnu vezu – a <Term id="least-connections">najmanje veza</Term> upravo takav poslužitelj smatra najslobodnijim. Load balancer
          mu šalje gotovo sve nove narudžbe: 34 u dvije sekunde. Srušeni poslužitelj usisava promet kao <strong>crna rupa</strong>.
        </p>
        <BlackHole />
        <p>
          Dva lijeka ne čekaju provjeru. <strong>Pasivna provjera</strong> izbacuje S3 već nakon prvog odbijanja. <Term id="retry">Ponovni pokušaj</Term> (engl. <em>retry</em>) odbijenu narudžbu odmah šalje drugom poslužitelju,
          pa student ništa ne primijeti. Tri narudžbe propadnu u svakom slučaju: one koje je S3 baš obrađivao kad je proces pao.
        </p>
        <Callout kind="warn" title="Kada je ponovni pokušaj siguran">
          Ovdje je ponavljanje bezopasno jer narudžba do S3 nije ni stigla – veza je odbijena prije slanja. Da je S3 narudžbu već obradio, a izgubio se samo odgovor, ponavljanje bi kuhinji poslalo istu narudžbu dvaput. Zato NGINX
          zahtjeve poput <code>POST</code> sam ne ponavlja kad su već poslani poslužitelju. O tome više u sljedećem predavanju.
        </Callout>
        <h3>Zalihost bez rezerve ne štiti</h3>
        <p>
          Recimo da load balancer reagira savršeno. Što onda? Bez Velikog ostaju Mali (5 zahtjeva/s) i Srednji (10 zahtjeva/s), ukupno 15 – točno koliko u podne stiže. Preživjeli rade na 100 %, a svaki mali nalet puni redove.
          Tri poslužitelja nisu isto što i <Term id="redundancy">zalihost</Term>: treba nam <Term id="n-plus-one">N+1</Term> – dovoljno snage da i bez najvećeg poslužitelja ostali rade ispod otprilike 80 %.
        </p>
        <CapacityN1 />
      </Section>

      {/* 5 · where the cart lives */}
      <Section id="kosarica" kicker="koncept" title="Gdje živi košarica" lead="Košarica u memoriji poslužitelja vrijedi samo dok vas load balancer šalje baš tom poslužitelju.">
        <p>
          Druga pritužba iz incidenta nema veze s padom. Klopa prijavu i košaricu drži u <Term id="session">sesiji</Term> (engl. <em>session</em>): preglednik pamti samo kolačić s oznakom sesije, a sadržaj je spremljen
          na samom poslužitelju, u njegovoj lokalnoj predmemoriji. Dok je postojao jedan poslužitelj, to je bilo savršeno. Sada load balancer sljedeći zahtjev istog studenta pošalje bilo kamo – a tamo njegove
          košarice nema.
        </p>
        <p>
          Prvi refleks je <Term id="sticky-session">ljepljiva sesija</Term> (engl. <em>sticky session</em>): load balancer pri prvom zahtjevu postavi svoj kolačić i studenta odsad uvijek šalje istom poslužitelju. Odjava više nema
          – dok taj poslužitelj ne padne. Pravo rješenje je drugo: stanje se seli iz poslužitelja u zajedničko spremište.
        </p>
        <CartSim />
        <Compare
          left={{
            title: 'Ljepljiva sesija',
            tone: 'rose',
            points: [
              'Load balancer studenta po kolačiću vraća istom poslužitelju.',
              'Opterećenje je neravnomjerno: tko je zapeo na Malom, tamo i ostaje.',
              'Padne li poslužitelj, njegove košarice nestaju s njim.',
              'Novi poslužitelj dobiva samo nove studente – postojeći se ne raspoređuju.',
            ],
          }}
          right={{
            title: 'Stanje u Redisu',
            tone: 'green',
            points: [
              'Sesija živi u zajedničkom Redisu, a poslužitelji je samo čitaju i pišu.',
              'Svaki poslužitelj može obraditi svaki zahtjev; load balancer bira slobodno.',
              'Pad poslužitelja nikoga ne odjavljuje.',
              'Novi poslužitelj odmah preuzima svoj dio prometa.',
            ],
          }}
        />
        <p>
          Poslužitelj koji u svojoj memoriji ne drži ničije stanje zovemo <Term id="stateless-service">servisom bez stanja</Term> (engl. <em>stateless service</em>). To ne znači da aplikacija nema podataka – podatci samo žive drugdje: u
          Redisu i Postgresu. Zato je svejedno koji će poslužitelj obraditi zahtjev, i zato se svaki može bez žaljenja zamijeniti.
        </p>
        <Analogy
          title="Vlastiti bicikl i gradski romobili"
          breaksDown="Baze podataka i drugi sustavi sa stanjem ne mogu se tako zamijeniti: važni su njihovi podatci i identitet. Njima se vraćamo u 19. predavanju."
        >
          Vlastiti bicikl popravljate kad se pokvari – na njemu je vaše sjedalo, vaš lokot, vaša košara. Gradski romobil ne popravljate: pokvareni ostavite i uzmete sljedeći, jer su svi jednaki. Poslužitelj bez stanja je gradski
          romobil: kad padne, load balancer jednostavno uzme drugi.
        </Analogy>
        <KeyIdea>
          Poslužitelji će padati. Studenti to neće osjetiti samo ako <strong>kvar brzo otkrijemo</strong>, ako <strong>preživjelima ostane rezerve</strong> i ako poslužitelj u svojoj memoriji <strong>ne drži ničije stanje</strong>.
        </KeyIdea>
        <DeepDive title="Za znatiželjne: ljepljivost po IP adresi">
          <p>
            Umjesto kolačića load balancer može studenta vezati za poslužitelj prema njegovoj IP adresi. To radi i bez kolačića, ali ima zamku: cijeli studentski dom ili kampus iza jedne javne adrese (NAT) završi na istom
            poslužitelju. Kubernetes nudi upravo takvu ljepljivost po IP adresi – vidjet ćemo je u 14. predavanju, uz isti zaključak: stanje ne pripada poslužitelju.
          </p>
        </DeepDive>
      </Section>

      {/* 6 · flagship */}
      <Section id="simulacija" kicker="simulacija" title="Ugasite poslužitelj usred ručka" lead="Sve odjednom: provjere, kvarovi, ponovni pokušaj i košarice – na istom ručku kao u incidentu.">
        <p>
          Simulacija kreće pet sekundi prije pada, s postavkama s dana incidenta. Pred vama su tri zadatka. Sve kontrole djeluju odmah, a <em>ispočetka</em> ponavlja ručak s istim seedom (42) i vašim postavkama.
          Pazite: svaka promjena postavki mijenja i redoslijed slučajnih događaja, pa jedan ručak nije konačna presuda nekom lijeku. Gumb <em>Postavke incidenta</em> vraća sve na dan incidenta.
        </p>
        <FlagshipSim />
        <h3>Što ste upravo vidjeli</h3>
        <ul>
          <li>
            Bez lijekova algoritam najmanje veza srušeni S3 hrani narudžbama sve dok ga provjere ne izbace: 37 propalih i 8 % grešaka u 30 s nakon pada. Ponovni pokušaj odbijene narudžbe tiho prebaci na S1 i S2 – propadnu samo
            tri koje je S3 baš obrađivao (0,7 %).
          </li>
          <li>
            Pasivna provjera crnu rupu zatvori odmah, ali greške ne nestanu: u ovom ručku ostane ih 4,1 %, a u dnevniku su to 503 i 504 s Malog. Dok se S3 ne vrati (oko 12 s), Mali i Srednji rade na 100 %, pa
            o slučaju ovisi hoće li im se red napuniti – ovdje se napuni. Na mnogo ručkova pasivna provjera i ponovni pokušaj pomažu otprilike jednako. Brže otkrivanje ne stvara kapacitet – to je opet N+1.
          </li>
          <li>
            Ispražnjeni S2 dovrši započeto, dobije pečat „ISPRAŽNJEN” – i tek se tada smije ugasiti. Nijedna narudžba ne propada, ali samo ako ostalima ima rezerve: isprazni li se S2 dok je S3 izvan prometa,
            Mali ostaje sam i narudžbe padaju. Zato zadatak broji greške cijelog sustava.
          </li>
          <li>Ugašen stroj i zamrznut proces ne odbijaju – oni šute. Narudžbe čekaju sa satom koji otkucava, pa stižu spori 504.</li>
          <li>S košaricama u Redisu pad poslužitelja nikoga ne odjavljuje. Ali „Ugasi Redis” odjavi sve studente odjednom, a „Ugasi load balancer” zaustavi cijelu Klopu.</li>
        </ul>
        <DeepDive title="Što simulacija pojednostavljuje">
          <ul>
            <li>Vrijeme je ubrzano: provjera svake 2 s (stvarno 30 s na AWS ALB), spajanje 1 s (NGINX zadano 60 s), ponovno pokretanje srušenog procesa 6 s uz 3 s zagrijavanja.</li>
            <li>
              Kad jezgra operacijskog sustava zbog nedostatka memorije (OOM) ubije jednog radnika, gunicorn ga sam zamijeni i port ostaje otvoren. U incidentu je systemd (zadano <code>OOMPolicy=stop</code>) zaustavio cijelu
              uslugu i ponovno je pokrenuo tek nakon nekoliko sekundi – zato je port bio zatvoren.
            </li>
            <li>
              Sve radnike jednog poslužitelja crtamo kao jednu cjelinu; košarica živi na stroju, ne u pojedinom radniku. U simulaciji lokalne košarice nestaju i kad padne samo proces. S Redisom na samom stroju pad procesa ih
              ne briše – ali dok je poslužitelj izvan prometa, studenti ionako završe na drugom poslužitelju, gdje njihove košarice nema.
            </li>
            <li>
              U oblaku paketi prema ugašenom stroju nestaju, pa load balancer čeka do isteka (504). U lokalnoj mreži jezgra nakon ≈3 s bez odgovora na ARP upit („tko ima ovu adresu?”) javi „No route to host”, pa NGINX
              vrati 502 – ali tek nakon čekanja.
            </li>
            <li>Mreža ne kasni: latencija je samo čekanje u redu, rad procesora i čekanje baze.</li>
          </ul>
        </DeepDive>
      </Section>

      {/* 7 · the new single points of failure */}
      <Section id="baza" kicker="koncept" title="Novo usko grlo: baza" lead="Poslužitelji su sada zamjenjivi. Nezamjenjivi su ostali Redis, Postgres – i sam load balancer.">
        <p>
          Sve što je bilo stanje sada je izvan poslužitelja: narudžbe, korisnici i jelovnik u Postgresu, sesije u Redisu. Tri poslužitelja aplikacije za gotovo svaki zahtjev pitaju bazu, pa baza, koja je i dosad bila
          samo jedna, postaje usko grlo. Nova <Term id="single-point-of-failure">jedinstvena točka kvara</Term> je Redis: u simulaciji ste vidjeli da su, kad je on stao, odjavljeni svi.
        </p>
        <p>
          Prvi lijek za opterećenje baze je <Term id="cache">predmemorija</Term> (engl. <em>cache</em>). Jelovnik se mijenja jednom dnevno, a čita se na gotovo svakom zahtjevu – u podne petnaest puta u sekundi. Zašto ga svaki put tražiti od baze? Kod obrasca{' '}
          <em>cache-aside</em> aplikacija prvo pita Redis; samo kad podatka ondje nema, čita ga iz baze i sprema u Redis za sljedeći put.
        </p>
        <CacheFigure />
        <p>
          Uz 90 % pogodaka prosječno čitanje traje 3 ms umjesto 20, a do baze stiže samo svako deseto. Predmemorija ipak nije besplatna: podatak u njoj može zastarjeti (cijena je promijenjena, a Redis još pamti staru), pa treba
          odlučiti kada ga obrisati. A ako baza padne, predmemorija je ne zamjenjuje – promašaji i sva pisanja i dalje trebaju bazu.
        </p>
        <DeepDive title="Za znatiželjne: replike za čitanje i CAP">
          <p>
            Drugi način rasterećenja baze su <Term id="read-replica">replike za čitanje</Term>: kopije glavne baze koje primaju njezine promjene i odgovaraju na čitanja. Svako pisanje i dalje ide u glavnu bazu – replike skaliraju
            čitanje, a ne pisanje. Ako kopiranje kasni (asinkrona replikacija), student može ne vidjeti ono što je upravo zapisao:
          </p>
          <ReplicaLag />
          <p>
            A slavni <Term id="cap-theorem">CAP teorem</Term>? On ne kaže „uvijek birate dva od tri”. Kaže samo ovo: <em>dok je mreža između kopija prekinuta</em> (<Term id="network-partition">mrežna particija</Term>), sustav
            mora birati između toga da odbije dio zahtjeva (dosljednost) i toga da odgovara s možda zastarjelim podatcima (dostupnost). Kad mreža radi, CAP nema što reći – tada se bira između brzine i dosljednosti.
          </p>
          <MythOrFact
            title="Mit ili istina?"
            items={[
              {
                statement: 'Replike za čitanje skaliraju i pisanje.',
                fact: false,
                explain: 'Svako pisanje i dalje ide u glavnu bazu. Replike rasterećuju samo čitanja – i mogu kasniti, pa vratiti zastarjeli podatak.',
              },
              {
                statement: 'CAP teorem: uvijek birate dva od tri.',
                fact: false,
                explain: 'CAP vrijedi samo dok traje mrežna particija: tada sustav bira između dosljednosti i dostupnosti. Kad mreža radi, CAP ne prisiljava ni na kakav izbor.',
              },
            ]}
          />
        </DeepDive>
        <h3>Tko balansira load balancer?</h3>
        <p>
          Ostaje još jedna točka kvara: sam load balancer. Ako on stane, nije važno koliko je poslužitelja iza njega. Klasično rješenje je par load balancera koji dijele jednu <Term id="floating-ip">plutajuću adresu</Term>:
          kad glavni utihne, adresu preuzme rezervni, a studenti i dalje šalju na isto mjesto.
        </p>
        <Callout kind="info" title="Druga rješenja">
          <ul>
            <li>
              <strong>DNS s više adresa:</strong> jednostavno, ali sporo – mrtvu adresu treba ukloniti iz DNS-a, a klijenti i resolveri pamte stari odgovor dok ne istekne <Term id="ttl">TTL</Term> (neki i dulje); preglednici
              tada često tek nakon čekanja probaju drugu adresu.
            </li>
            <li>
              <strong>Anycast:</strong> ista IP adresa objavljena s više mjesta; mreža svakog klijenta šalje najbližem živom.
            </li>
            <li>
              <strong>Upravljani load balancer u oblaku:</strong> iza jednog imena radi flota strojeva, a pružatelj ih sam zamjenjuje. Većina timova bira upravo to.
            </li>
          </ul>
        </Callout>
        <DeepDive title="Za znatiželjne: kako plutajuća adresa prelazi">
          <VipStepper />
        </DeepDive>
      </Section>

      {/* 8 · code */}
      <Section id="kod" kicker="kod" title="Provjere i sesije u konfiguraciji" lead="Tri kratke datoteke: ono što ste vidjeli u simulacijama, zapisano za NGINX i Django.">
        <p>
          Prvo load balancer. Pasivnu provjeru i ponovni pokušaj u simulaciji ste uključivali prekidačima; u NGINX-u su to zadane postavke (retci 6–8 i 19–20). Ovdje ih pišemo izričito, da ih nitko više ne isključi kao na
          dan incidenta. Redak 17 poslužitelju prosljeđuje ime <code>klopa.example</code> (bez njega Django odbija zahtjeve), a <code>proxy_connect_timeout</code> određuje koliko dugo narudžba čeka na ugašen stroj.
        </p>
        <CodeBlock
          title="klopa.conf"
          lang="nginx"
          code={nginxConf}
          highlight="6-8"
          caption="Pasivna provjera (max_fails, fail_timeout) i ponovni pokušaj (proxy_next_upstream) za Klopin load balancer: zadane vrijednosti, napisane izričito."
          notes={[
            { lines: '3', text: 'bez zone svaki proces NGINX-a broji neuspjehe zasebno' },
            { lines: '6-8', text: 'pasivna provjera: 1 neuspjeh → 10 s izvan prometa' },
            { lines: '17', text: 'Django provjerava ime (Host), inače vraća 400' },
            { lines: '19-20', text: 'odbijeno ili isteklo → još jednom, na drugom' },
            { lines: '21', text: 'ugašen stroj: čekamo 2 s, a ne 60' },
          ]}
        />
        <Callout kind="fact" title="Aktivne provjere u NGINX-u">
          NGINX otvorenog koda ima samo pasivne provjere; direktiva za aktivne (<code>health_check</code>) dio je komercijalnog NGINX Plusa – zato je Klopi aktivnu provjeru radila Davorova skripta. Ugrađene aktivne provjere
          imaju HAProxy, Envoy te load balanceri u oblaku (AWS ALB, Google Cloud Load Balancing, Azure Load Balancer).
        </Callout>
        <p>
          Zatim adresa koju aktivna provjera kuca. Najvažnija odluka je što ona <em>ne</em> provjerava:
        </p>
        <CodeBlock
          title="klopa/health.py"
          lang="python"
          code={healthzPy}
          caption="Pogled /healthz u Djangu: minimalna provjera ispravnosti koja odgovara 200 dok god proces radi i prima zahtjeve."
          notes={[
            { lines: '5-10', text: 'plitka provjera: samo „živ sam i primam zahtjeve”' },
            { lines: '7-9', text: 'zajednička baza u provjeri = svi padnu odjednom' },
            { lines: '16-17', text: 'provjera stiže na IP, inače Django vraća 400' },
          ]}
        />
        <DeepDive title="Za znatiželjne: Davor provjerava S3 iz terminala">
          <Terminal
            title="Davor provjerava S3 s load balancera"
            lines={[
              { comment: '# S3 radi' },
              { cmd: 'curl http://10.0.0.13:8000/healthz', prompt: 'davor@lb:~$' },
              { out: 'ok', tone: 'ok' },
              { comment: '# 12:03 – proces na S3 je pao, a stroj radi' },
              { cmd: 'curl http://10.0.0.13:8000/healthz', prompt: 'davor@lb:~$' },
              { out: "curl: (7) Failed to connect to 10.0.0.13 port 8000 after 1 ms: Couldn't connect to server", tone: 'bad', note: 'odbijeno za 1 ms: na portu 8000 nitko ne sluša', who: 'davor' },
              { comment: '# zastoj: veza se uspostavi, a odgovora nema' },
              { cmd: 'curl --max-time 5 http://10.0.0.13:8000/healthz', prompt: 'davor@lb:~$' },
              { out: 'curl: (28) Operation timed out after 5002 milliseconds with 0 bytes received', tone: 'bad' },
            ]}
            caption="Isti simptomi kao u simulaciji: srušen proces odmah odbija vezu, a zamrznut proces šuti dok klijent ne odustane."
          />
        </DeepDive>
        <p>
          Na kraju košarica. Djangove sesije zadano žive u bazi – a to je već zajedničko spremište. Klopa ih je radi brzine prebacila u predmemoriju, ali onu na samom poslužitelju: svaki poslužitelj imao je svoj Redis.
          Popravak je jedan redak u postavkama:
        </p>
        <CodeBlock
          title="klopa/settings.py"
          lang="diff"
          code={sessionsDiff}
          previewLines={13}
          caption="Isti SESSION_ENGINE i isti Redis, samo druga adresa: sesije se sele s pojedinog poslužitelja u zajednički Redis."
          notes={[
            { lines: '5', text: 'sesija se sprema u predmemoriju „default”' },
            { lines: '10-11', text: 'prije: Redis na ovom stroju – samo za njega' },
            { lines: '12-13', text: 'sada: svi poslužitelji pitaju isti Redis' },
          ]}
        />
        <Callout kind="warn" title="Redis bez trajnosti">
          Ako Redis ne sprema podatke na disk, njegovo ponovno pokretanje odjavi sve studente – baš kao gumb „Ugasi Redis” u simulaciji. Djangov <code>cached_db</code> zato sesiju piše i u bazu, a iz Redisa je samo brže čita.
        </Callout>
      </Section>

      {/* 9 · myths, recap + quiz */}
      <Section id="sazetak" kicker="provjera" title="Mitovi, sažetak i provjera">
        <MythOrFact
          items={[
            {
              statement: 'Load balancer odmah zna da je poslužitelj pao.',
              fact: false,
              explain: 'Zna tek nakon U neuspjelih provjera zaredom: između (U − 1) · interval i U · interval, a ako poslužitelj visi, tome se dodaje i čekanje na odgovor provjere. Uz zadane postavke AWS ALB-a to je 30–60 s.',
            },
            {
              statement: 'Srušen proces i ugašen stroj load balancer vidi različito.',
              fact: true,
              explain: 'Srušen proces vezu odbije odmah, pa load balancer brzo vrati 502. Ugašen stroj šuti, pa load balancer čeka da istekne vrijeme za spajanje i tek onda vraća 504.',
            },
            {
              statement: 'Load balancer uklanja jedinstvenu točku kvara.',
              fact: false,
              explain: 'Uklanja je s poslužitelja aplikacije, ali sam postaje nova – osim ako i njega ne udvostručimo (par s plutajućom adresom) ili ne koristimo upravljani load balancer u oblaku.',
            },
            {
              statement: 'Ljepljive sesije rješavaju problem stanja.',
              fact: false,
              explain: 'Samo ga skrivaju: opterećenje postaje neravnomjerno, sesije nestaju s poslužiteljem, a novi poslužitelj ne preuzima postojeće korisnike. Rješenje je stanje premjestiti u Redis ili bazu.',
            },
            {
              statement: 'Servis bez stanja znači da aplikacija nema podataka.',
              fact: false,
              explain: 'Podatci postoje, samo ne žive u memoriji poslužitelja nego u Redisu i bazi. Zato svaka kopija servisa može obraditi svaki zahtjev.',
            },
          ]}
        />
        <Recap
          points={[
            'Load balancer o kvaru zna samo ono što izmjeri. Aktivna provjera izbacuje poslužitelj tek nakon U neuspjeha zaredom: između (U − 1) · interval i U · interval, uz zadane AWS ALB postavke 30–60 s.',
            'Pasivna provjera i ponovni pokušaj reagiraju na prave zahtjeve, bez čekanja provjere. Bez njih algoritam najmanje veza srušeni poslužitelj pretvara u crnu rupu.',
            'Pad procesa daje brz 502, ugašen stroj i zastoj spore 504, a pražnjenje nijednu grešku.',
            'Zalihost štiti samo uz rezervu: kad padne najveći poslužitelj, preživjeli trebaju ostati ispod otprilike 80 % (N+1).',
            'Stanje ne smije živjeti na poslužitelju aplikacije. Ljepljive sesije to skrivaju, a zajednički Redis ili baza to rješavaju – Redis pritom postaje nova jedinstvena točka kvara, a baza usko grlo.',
          ]}
        />
        <StoryMap at="05" />
        <Quiz
          questions={[
            {
              q: 'Utorak, 12:03. Nadzorna ploča: zahtjevi koje load balancer pošalje na S3 završavaju s 502 za 3 ms, S3 ima 0 aktivnih veza, a load balancer (najmanje veza) mu šalje gotovo sve nove zahtjeve. Što se događa?',
              options: [
                'S3 je najbrži poslužitelj, pa ga algoritam s pravom bira.',
                'Proces na S3 je pao; brzi 502 drže mu broj veza na nuli, pa ga najmanje veza smatra najslobodnijim.',
                'S3 je zamrznut i zahtjevi kod njega čekaju.',
                'Load balancer je pao.',
              ],
              correct: 1,
              explain:
                'Brz 502 znači da na portu nitko ne sluša. Zamrznut poslužitelj zadržava zahtjeve, pa ima mnogo aktivnih veza i najmanje veza ga izbjegava. Dok aktivna provjera ne reagira, pomažu pasivna provjera i ponovni pokušaj.',
            },
            {
              q: 'Load balancer provjerava svakih 10 s i poslužitelj izbacuje nakon 3 neuspjeha zaredom. Proces padne. Koliko dugo load balancer još može slati promet srušenom procesu?',
              options: ['Najviše 10 s', 'Između 20 i 30 s', 'Točno 30 s', 'Između 30 i 40 s'],
              correct: 1,
              explain: '(U − 1) · interval = 20 s do U · interval = 30 s, ovisno o tome kada je proces pao između dviju provjera.',
            },
            {
              q: 'Podsjetnik iz 1. predavanja: S2 je ugašen (stroj bez struje), a S3-u je pao proces. Što load balancer dobije kad im pokuša poslati zahtjev?',
              options: [
                'Oba odmah odbiju vezu.',
                'S3 odmah odbije vezu jer na portu nitko ne sluša; S2 šuti, pa load balancer čeka da istekne vrijeme spajanja.',
                'S2 odmah odbije vezu, a S3 šuti.',
                'Oba šute dok ne istekne vrijeme.',
              ],
              correct: 1,
              explain:
                'Vezu odbija operacijski sustav kad na portu nitko ne sluša – za to stroj mora raditi. Na ugašenom stroju nema nikoga tko bi vezu odbio, pa load balancer čeka (NGINX zadano 60 s) i vraća 504. To su „odbijena veza” i „isteklo vrijeme” iz 1. predavanja.',
            },
            {
              q: 'Kapaciteti poslužitelja su 5, 10 i 20 zahtjeva/s, a u podne stiže 15 zahtjeva/s. Je li Klopa spremna na pad jednog poslužitelja?',
              options: ['Da – ukupno 35 zahtjeva/s, više nego dovoljno.', 'Ne – padne li Veliki, preživjeli rade na 100 % i redovi rastu.', 'Da, ako load balancer koristi najmanje veza.', 'Da, uz ljepljive sesije.'],
              correct: 1,
              explain: 'Bez Velikog ostaje 5 + 10 = 15 zahtjeva/s – točno koliko stiže. Za N+1 preživjeli bi trebali raditi ispod otprilike 80 %, dakle trebalo bi im barem 19 zahtjeva/s kapaciteta.',
            },
            {
              q: 'Klopa uključi ljepljive sesije (kolačić load balancera) i u 12:10 doda četvrti poslužitelj. Što će se dogoditi?',
              options: [
                'Promet se odmah podijeli na četiri jednaka dijela.',
                'Novi poslužitelj dobiva uglavnom nove studente; postojeći ostaju na svojim poslužiteljima.',
                'Svi studenti bit će odjavljeni.',
                'Load balancer odbija dodati poslužitelj dok su sesije ljepljive.',
              ],
              correct: 1,
              explain: 'Kolačić drži svakog studenta na poslužitelju koji ga je prvi obradio. Novi poslužitelj zato dugo dobiva malo prometa. Sa sesijama u Redisu odmah bi preuzeo svoj dio.',
            },
            {
              q: 'Klopa jelovnik čita kroz Redis (1 ms), a baza odgovara za 20 ms. U Redisu se nađe 90 % čitanja. Koliko od svakih 100 čitanja stigne do baze i koliko prosječno traje čitanje?',
              options: ['90 čitanja, oko 18 ms', '10 čitanja, oko 3 ms', '10 čitanja, 1 ms', 'Nijedno, 1 ms'],
              correct: 1,
              explain: 'Promašaji (10 %) idu u bazu. Prosjek: 0,9 · 1 ms + 0,1 · (1 + 20) ms = 3 ms. Baza i dalje mora raditi: bez nje promašaji i pisanja nemaju odgovor.',
            },
          ]}
        />
      </Section>

      {/* 10 · cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Pad otkrivaju provjere ispravnosti, a dok one ne reagiraju, ponovni pokušaj i pasivna provjera skrivaju ga od studenata.',
            'Poslužitelji su bez stanja: pad bilo kojeg nikoga ne odjavljuje, a novi odmah preuzima promet.',
            'Poslužitelj za nadogradnju praznimo bez ijedne izgubljene narudžbe.',
          ]}
          paid={[
            'Redis je nova jedinstvena točka kvara, a baza, i dalje samo jedna, postala je usko grlo.',
            'Rezerva N+1 znači plaćati poslužitelj koji većinu dana čeka.',
            'Load balancer je i dalje jedan, osim ako ne platimo par ili upravljanu uslugu.',
          ]}
          next="Poslužitelji aplikacije sada su zamjenjivi, a stanje živi u Postgresu i Redisu. No API sve radi sinkrono: spremi narudžbu, upiše listić za kuhinju i pošalje SMS – i tek onda odgovori. Ćevap-petak, 12:00: deset sekundi stiže po petnaest narudžbi u sekundi, a SMS-gateway počne kasniti."
        />
      </Section>
    </>
  )
}

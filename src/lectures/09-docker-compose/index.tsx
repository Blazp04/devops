import { Analogy, Callout, CodeBlock, CostNote, DeepDive, IncidentCard, KeyIdea, MarginNote, MythOrFact, Predict, Quiz, Recap, Section, StoryMap, Tabs, Term, Terminal } from '../../kit'
import { SixCommandsStepper } from './sims/SixCommandsStepper'
import { LocalhostStepper } from './sims/LocalhostStepper'
import { DnsLab } from './sims/DnsLab'
import { PortsStepper } from './sims/PortsStepper'
import { VolumeLab } from './sims/VolumeLab'
import { ReadyStepper } from './sims/ReadyStepper'
import { ComposeSlagalica } from './sims/ComposeSlagalica'
import { HostDownStepper } from './sims/HostDownStepper'
import composeYaml from './code/compose.yaml?raw'
import envExample from './code/env.example?raw'
import nginxConf from './code/nginx.conf?raw'
import naredbe from './code/naredbe.sh?raw'
import readmeRun from './code/docker-run-readme.sh?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook: Iva's README, six commands nobody remembers */}
      <Section id="incident" kicker="priča" title="Šest naredbi koje nitko ne pamti" lead="Slike su gotove. Ali pokrenuti cijelu Klopu i dalje je ručni posao – i lako ga je pokvariti.">
        <IncidentCard
          no={9}
          when="ponedjeljak, 09:40"
          title="API ne nalazi bazu, a narudžbe nestaju"
          who="iva"
          says={['Gdje je', 'baza?!']}
          metrics={[
            {
              label: (
                <>
                  naredbi <code className={styles.metricCode}>docker run</code>
                </>
              ),
              value: '6',
              tone: 'warn',
            },
            {
              label: (
                <>
                  API → <code className={styles.metricCode}>localhost:5432</code>
                </>
              ),
              value: 'odbijeno',
              tone: 'bad',
            },
            {
              label: (
                <>
                  stare narudžbe nakon <code className={styles.metricCode}>docker rm</code> baze
                </>
              ),
              value: '0',
              tone: 'bad',
            },
            { label: 'viseći volumeni', value: '1', tone: 'warn' },
          ]}
          preset="ivin-readme"
          seed={9}
        >
          Iva je pokrenula Postgres i API u dva kontejnera, ali API javlja da baze na <code>localhost:5432</code> nema. Kad ih je napokon spojila, nakon <code>docker rm</code> baze nestale su sve testne narudžbe.
        </IncidentCard>
        <p>
          U prošlom smo predavanju Klopu spakirali u slike kontejnera: <code>klopa-web</code>, <code>klopa-api</code> i <code>klopa-worker</code>. Uz njih trebaju i Postgres, Redis i RabbitMQ – ukupno šest kontejnera. Iva je zato u README zapisala šest naredbi{' '}
          <code>docker run</code>, svaku s po nekoliko zastavica, i komentar „pokrenite ih ovim redom”. Naredbe je složila po sjećanju sa svog laptopa: API-ju je ostavila <code>DATABASE_HOST=localhost</code>, a bazi nije dala
          volumen. U ponedjeljak ujutro preskočila je i vlastiti komentar.
        </p>
        <SixCommandsStepper />
        <p>
          Ono što ste vidjeli u zadnjem koraku je <Term id="docker-compose">Docker Compose</Term>: alat koji iz jedne datoteke <code>compose.yaml</code> pokreće više povezanih kontejnera na jednom računalu. Svaki dio aplikacije u datoteci je jedan{' '}
          <Term id="compose-service">servis</Term> (<code>web</code>, <code>api</code>, <code>db</code>…). Datoteka stoji u repozitoriju, uz kod, pa Iva i Davor pokreću potpuno istu Klopu.
        </p>
        <MarginNote>docker compose – bez crtice</MarginNote>
        <p>
          Važnija od uštede tipkanja je promjena načina razmišljanja. U README-u su bili <em>koraci</em> („stvori mrežu, pa pokreni bazu, pa…”). U <code>compose.yaml</code> je <em>opis</em> onoga što želimo, a Compose sam smišlja korake. Tu ideju – opisati
          željeno stanje umjesto koraka – srest ćemo u Kubernetesu u punoj snazi.
        </p>
        <Analogy title="Analogija: recept za cijeli ručak" who="mira" breaksDown="Recept se i dalje kuha u jednoj kuhinji. Ako ta kuhinja izgori, nema ručka – recept ne zna ni za jednu drugu kuhinju. Do toga ćemo doći na kraju predavanja.">
          Teta Mira ne drži šest papirića („prvo stavi vodu”, „onda krumpir”…), nego jedan recept za cijeli ručak: što sve treba, što ide prije čega i u kojim posudama. Po istom receptu svatko u kuhinji skuha isti ručak.
        </Analogy>
        <p>Prije same datoteke riješimo dvije zamke iz Ivina jutra: tko je zapravo <code>localhost</code> i kamo su nestale narudžbe.</p>
      </Section>

      {/* 2 ─ localhost and names (scenes 2 and 3) */}
      <Section id="mreza" kicker="koncept" title="Tko je localhost i kako se servisi nalaze" lead={
          <>
            Svaki kontejner ima vlastiti mrežni imenski prostor. Zato <code>localhost</code> u kontejneru nije vaše računalo – a druge kontejnere tražimo po imenu.
          </>
        }
      >
        <Predict
          question={
            <>
              API radi u jednom kontejneru, Postgres u drugom, s objavljenim portom <code>-p 5432:5432</code>. API se spaja na <code>localhost:5432</code>. Što će se dogoditi?
            </>
          }
          options={[
            <>Spojit će se – port 5432 je objavljen.</>,
            <>
              <code>Connection refused</code> – na portu 5432 u kontejneru <code>api</code> nitko ne sluša.
            </>,
            <>
              <code>could not translate host name</code> – ime nije poznato.
            </>,
            <>Spojit će se, ali sporije, zaobilazno preko računala.</>,
          ]}
          correct={1}
          explain={
            <>
              <code>localhost</code> u kontejneru je sam taj kontejner. Objavljeni port otvara vrata s računala u kontejner <code>db</code> – API kroz njih ne prolazi, jer njegov <code>localhost</code> uopće nije računalo.
            </>
          }
          then="Pogledajmo to korak po korak."
        />
        <LocalhostStepper />
        <p>
          To je <Term id="linux-namespace">imenski prostor</Term> iz 7. predavanja na djelu: svaki kontejner dobije vlastiti mrežni imenski prostor, sa svojim sučeljem <code>lo</code> i svojom adresom na <code>eth0</code>. Za program u kontejneru{' '}
          <code>localhost</code> znači „ja sam”, kao i na svakom računalu.
        </p>
        <p>
          Kako API dozna da je <code>db</code> baš <code>172.18.0.2</code>? Compose za svaki projekt stvori <Term id="user-defined-network">korisnički definiranu mrežu</Term> (ovdje <code>klopa_default</code>) i na nju spoji sve servise. Takva mreža ima ugrađeni DNS na adresi{' '}
          <code>127.0.0.11</code>: kad kontejner pita za ime <code>db</code>, dobije trenutačnu adresu kontejnera tog servisa. Zadana Dockerova mreža <code>bridge</code> – na nju <code>docker run</code> spaja kontejner ako ne kažete drukčije – takav imenik nema.
        </p>
        <DnsLab />
        <MarginNote tone="green">ime servisa = DNS ime</MarginNote>
        <Callout kind="tip" title="Adrese ne upisujte nigdje">
          Kontejner nakon ponovnog stvaranja može dobiti drugu adresu, a ime servisa ostaje isto. Zato u konfiguraciji stoji <code>DATABASE_HOST: db</code>, nikad <code>172.18.0.2</code>. Isto načelo – stalno ime ispred promjenjivih adresa – vratit će se u
          Kubernetesu kao Service.
        </Callout>
      </Section>

      {/* 3 ─ ports and data (scene 4) */}
      <Section id="vrata-podatci" kicker="isprobajte" title="Vrata i podatci" lead="Što s računala smije ući u kontejnere – i što od podataka ostaje kad kontejnera više nema.">
        <p>
          Iz prošlog predavanja znate da <Term id="port-mapping">preslikavanje porta</Term> otvara vrata u zidu kontejnera. U Composeu se to zove <code>ports</code>, a Klopi trebaju samo jedna vrata: ona prema webu.
        </p>
        <PortsStepper />
        <p>
          Sada druga Ivina nevolja: narudžbe su nestale nakon <code>docker rm</code>. Znate da <Term id="writable-layer">zapisivi sloj</Term> nestaje s kontejnerom, pa podatci baze moraju živjeti izvan njega, u{' '}
          <Term id="volume">volumenu</Term>. Ali Iva volumen <em>nije</em> zadala – a narudžbe su ipak preživjele ponovno pokretanje baze. Kako?
        </p>
        <p>
          Slika <code>postgres</code> u svom Dockerfileu ima naredbu <code>VOLUME</code>. Ako na tu putanju ništa ne spojite, Docker sam stvori <Term id="anonymous-volume">anonimni volumen</Term> – bez imena, s dugim heksadecimalnim identifikatorom. Dok je
          kontejner isti, podatci su tamo. Novi kontejner (nakon <code>docker rm</code>, ili <code>down</code> pa <code>up</code>) dobije novi, prazan anonimni volumen, a stari ostaje „viseći”: nitko ga ne koristi, ali ga nitko ni ne briše.
        </p>
        <p>Postgres može podatke držati na četiri mjesta:</p>
        <ul>
          <li>
            <strong>
              <Term id="named-volume">imenovani volumen</Term>
            </strong>{' '}
            (<code>pgdata:/var/lib/postgresql</code>) – njime upravlja Docker, preživi <code>docker rm</code> i <code>down</code>, a briše ga tek <code>down -v</code>;
          </li>
          <li>
            <strong>anonimni volumen</strong> – nastane sam, ali ga kontejner stvoren nakon <code>docker rm</code> ili <code>down</code> ne nasljeđuje;
          </li>
          <li>
            <strong>
              <Term id="bind-mount">bind mount</Term>
            </strong>{' '}
            (<code>./pgdata:/var/lib/postgresql</code>) – obična mapa na računalu; zgodno za kod u razvoju, za bazu ovisi o mapi i ovlastima na računalu;
          </li>
          <li>
            <strong>
              <Term id="tmpfs">tmpfs</Term>
            </strong>{' '}
            – radna memorija: prazna čim kontejner stane.
          </li>
        </ul>
        <VolumeLab />
        <p>
          <code>docker compose down</code> briše kontejnere i mrežu projekta, a imenovane volumene ostavlja. <code>docker compose down -v</code> briše i volumene projekta – zajedno s narudžbama. Ta dva znaka vrijedi pročitati dvaput prije nego što pritisnete Enter.
        </p>
        <Callout kind="fact" title="Gdje slika postgres drži podatke">
          Od glavne verzije 18 slika <code>postgres</code> drži podatke u <code>/var/lib/postgresql/18/docker</code> (varijabla <code>PGDATA</code>), a <code>VOLUME</code> joj je <code>/var/lib/postgresql</code>. Volumen zato spajamo na{' '}
          <code>/var/lib/postgresql</code>. Stariji tutorijali spajaju ga na <code>/var/lib/postgresql/data</code> – slika 18+ tada odbija krenuti i u logu javi <code className={styles.wrap}>Error: in 18+, these Docker images are configured…</code>. (stanje: listopad 2026.)
        </Callout>
      </Section>

      {/* 4 ─ started is not ready (scene 5) */}
      <Section id="spremnost" kicker="korak po korak" title="Pokrenut nije isto što i spreman" lead={
          <>
            <code>depends_on</code> određuje redoslijed pokretanja. Na spremnost baze čeka tek uz provjeru ispravnosti.
          </>
        }
      >
        <p>
          Treća Ivina nevolja bila je redoslijed. Compose ga zna iz <code>depends_on</code> – ali pazite što točno znači „pokrenut”. Klopin API pri pokretanju najprije pokrene migracije baze (<code>manage.py migrate</code>), pa mu baza treba odmah.
        </p>
        <ReadyStepper />
        <p>
          <Term id="compose-healthcheck">Provjera ispravnosti</Term> (u Composeu <code>healthcheck</code>) naredba je koju Docker periodički pokreće <em>unutar</em> kontejnera – za Postgres je to <code>pg_isready</code>. Dok ne uspije, kontejner je u stanju{' '}
          <code>starting</code>, nakon uspjeha <code>healthy</code>. Tek uz <code>condition: service_healthy</code> Compose čeka to stanje prije nego što pokrene ovisni servis.
        </p>
        <p>
          <Term id="restart-policy">Pravilo ponovnog pokretanja</Term> <code>restart: unless-stopped</code> ponovno pokreće kontejner čiji je proces završio, sa sve duljom stankom – isto <Term id="exponential-backoff">eksponencijalno odgađanje</Term> kao kod ponovnih pokušaja u
          6. predavanju. Zaustavite li kontejner sami (<code>docker stop</code>), ostaje ugašen.
        </p>
        <Callout kind="warn" title="Zadani razmak provjera je 30 s">
          Bez dodatnih postavki Docker provjeru ispravnosti pokreće svakih 30 s, pa bi API na zdravu bazu čekao najmanje pola minute: prva provjera kreće tek nakon 30 s. Zato u našem <code>compose.yaml</code> stoje <code>start_period</code> i <code>start_interval: 1s</code>: dok se servis pokreće,
          provjera se ponavlja svake sekunde.
        </Callout>
      </Section>

      {/* 5 ─ flagship */}
      <Section id="slagalica" kicker="simulacija" title="Compose slagalica" lead={
          <>
            Sve iz ovog predavanja na jednom računalu: popravite Ivin <code>compose.yaml</code> – pa ga pokušajte srušiti.
          </>
        }
      >
        <p>
          Simulacija kreće od Ivine datoteke (preset <code>ivin-readme</code>, seed 9) i ništa još ne radi. Pritisnite „compose up”, čitajte zapisnik ispod crteža i mijenjajte datoteku: servis odvucite na drugu mrežu, promijenite <code>ports</code>,{' '}
          <code>DATABASE_HOST</code> ili mjesto podataka baze. Crtež prikazuje <em>datoteku</em>; crtkani okvir znači da izmjena još nije primijenjena. Kontejner baze u projektu se zove{' '}
          <code>klopa-db-1</code>, pa ga brišemo naredbom <code>docker rm -f klopa-db-1</code>.
        </p>
        <ComposeSlagalica />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              S <code>DATABASE_HOST: localhost</code> API pita sam sebe i gasi se; s <code>db</code> pronalazi bazu po imenu.
            </li>
            <li>
              Servis na mreži <code>bridge</code> ostaje bez imena: <code>could not translate host name</code>, a web vraća <code>502</code>.
            </li>
            <li>
              Dva servisa na istom portu računala: drugi ne krene (<code>port is already allocated</code>).
            </li>
            <li>
              Bez imenovanog volumena <code>docker rm</code> baze ostavi narudžbe u visećem volumenu; s njim prežive i <code>down</code>.
            </li>
            <li>
              Imenovani volumen na staroj putanji <code>…/data</code>: <code>postgres:18</code> odbija krenuti.
            </li>
            <li>„Ugasi računalo” ruši sve, i nijedan redak u datoteci to ne mijenja.</li>
          </ul>
        </Callout>
        <DeepDive title="Kada Compose ponovno stvara kontejner">
          <p>
            <code>docker compose up</code> uspoređuje datoteku s kontejnerima koji postoje. Servis kojemu se konfiguracija promijenila stvara ponovno (u ispisu: <code>Recreate</code>), a ostale ne dira. Pri tome novom kontejneru preda anonimne volumene starog –
            zato izmjena <code>ports</code> ne briše narudžbe ni bez imenovanog volumena. Nakon <code>down</code> starih kontejnera više nema, pa sljedeći <code>up</code> nema od koga naslijediti anonimni volumen.
          </p>
          <p>
            Compose radi samo dok izvršava vašu naredbu. Obriše li netko kontejner ručno, nitko ga ne vraća dok opet ne pokrenete <code>docker compose up</code>. Zapamtite tu rečenicu – u sljedećem predavanju ona postaje problem.
          </p>
        </DeepDive>
        <p>Ostao je još jedan kvar koji nijedan redak u datoteci ne popravlja: pad samog računala.</p>
        <HostDownStepper />
        <KeyIdea>
          Compose već uči dvije velike ideje: <strong>opisujemo što želimo</strong>, a ne korake, i servisi se nalaze <strong>po imenu</strong>, a ne po adresi. Ali sve se to događa na <strong>jednom računalu</strong>, i nitko ne pazi stalno da stvarno stanje
          odgovara opisu.
        </KeyIdea>
        <p>
          Svaka stavka s Davorova popisa dobit će ime u sljedećim predavanjima: više računala zajedno čine klaster, raspored kontejnera radi raspoređivač (engl. <em>scheduler</em>), zamjenu palih kontejnera petlja usklađivanja, postupnu nadogradnju Deployment, a
          stalne adrese Service.
        </p>
      </Section>

      {/* 6 ─ code */}
      <Section id="kod" kicker="kod" title="compose.yaml za cijelu Klopu" lead="Sve što ste složili u simulaciji, u datoteci koja stoji u repozitoriju.">
        <CodeBlock
          title="compose.yaml"
          lang="yaml"
          code={composeYaml}
          previewLines={24}
          caption="Šest servisa, provjere ispravnosti, imenovani volumen i jedna objavljena vrata."
          notes={[
            { lines: '3', text: 'ime projekta: klopa_default, klopa_pgdata, klopa-api-1' },
            { lines: '8-9', text: 'jedina vrata u zidu – samo web' },
            { lines: '20', text: 'ime servisa, nikad localhost' },
            { lines: '24-30', text: 'api čeka zdravu bazu, Redis i RabbitMQ' },
            { lines: '52', text: 'postgres:18+ → /var/lib/postgresql' },
            { lines: '53-57', text: 'pg_isready preko TCP-a (-h); $$ = znak $ za ljusku' },
            { lines: '80', text: 'imenovani volumen: preživi down, ne i down -v' },
          ]}
        />
        <Tabs
          tabs={[
            {
              label: '.env.example',
              content: (
                <CodeBlock
                  title=".env.example"
                  lang="ini"
                  code={envExample}
                  mode="open"
                  caption={
                    <>
                      Predložak u Gitu; prava datoteka <code>.env</code> ostaje na računalu. O tajnama više u 16. predavanju.
                    </>
                  }
                />
              ),
            },
            {
              label: 'nginx.conf (web)',
              content: (
                <CodeBlock
                  title="nginx.conf"
                  lang="nginx"
                  code={nginxConf}
                  mode="open"
                  caption={
                    <>
                      Web zove API po imenu servisa, preko ugrađenog DNS-a na <code>127.0.0.11</code>.
                    </>
                  }
                />
              ),
            },
            { label: 'naredbe', content: <CodeBlock title="svakodnevne naredbe" lang="bash" code={naredbe} mode="open" /> },
            {
              label: 'README (prije)',
              content: (
                <CodeBlock
                  title="README.md (Ivina verzija)"
                  lang="bash"
                  code={readmeRun}
                  mode="open"
                  caption={
                    <>
                      Šest naredbi <code>docker run</code> kakve je Iva pokrenula – s <code>localhost</code> i bez <code>-v</code>. Sve to zamjenjuje <code>compose.yaml</code>.
                    </>
                  }
                />
              ),
            },
          ]}
        />
        <Terminal
          title="Ivin laptop"
          caption="Svakodnevni posao s Composeom: pokretanje, provjera stanja, čitanje logova i pregled volumena."
          lines={[
            { cmd: 'docker compose up -d' },
            {
              out: '[+] Running 8/8\n ✔ Network klopa_default       Created\n ✔ Volume klopa_pgdata         Created\n ✔ Container klopa-db-1        Healthy\n ✔ Container klopa-redis-1     Healthy\n ✔ Container klopa-rabbitmq-1  Healthy\n ✔ Container klopa-api-1       Started\n ✔ Container klopa-worker-1    Started\n ✔ Container klopa-web-1       Started',
              tone: 'ok',
            },
            { cmd: 'docker compose ps --format "table {{.Name}}\\t{{.Status}}"' },
            { out: 'NAME               STATUS\nklopa-api-1        Up 2 minutes (healthy)\nklopa-db-1         Up 2 minutes (healthy)\nklopa-rabbitmq-1   Up 2 minutes (healthy)\nklopa-redis-1      Up 2 minutes (healthy)\nklopa-web-1        Up 2 minutes\nklopa-worker-1     Up 2 minutes' },
            { cmd: 'docker compose logs -f api' },
            { out: 'api-1  | Operations to perform:\napi-1  |   Apply all migrations: admin, auth, narudzbe\napi-1  | [INFO] Listening at: http://0.0.0.0:8000 (1)', tone: 'muted' },
            { comment: 'Ctrl+C, pa pogledajmo volumene' },
            { cmd: 'docker volume ls' },
            { out: 'DRIVER    VOLUME NAME' },
            { out: 'local     3f9a1c7e0b5d4e2a9c81f0d6b7a3e5c2d1f4a8b6c9e0d7f3a2b5c8e1d4f7a0b3', note: 'Ivin stari Postgres: anonimni volumen bez kontejnera', who: 'davor' },
            { out: 'local     klopa_pgdata' },
          ]}
        />
        <Callout kind="fact" title="docker compose, a ne docker-compose">
          Stari <code>docker-compose</code> (v1, pisan u Pythonu) ne dobiva ažuriranja od srpnja 2023. Danas se koristi dodatak <code>docker compose</code> (v2 i novije); verzija 5 izašla je u prosincu 2025., a verzije 3 i 4 su preskočene. Ključ{' '}
          <code>version:</code> na vrhu datoteke Compose zanemaruje – i ispiše upozorenje da je atribut zastario; samo ga obrišite. Trenutačna verzija je 5.5.1. (stanje: listopad 2026.)
        </Callout>
      </Section>

      {/* 7 ─ myths */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?" lead="Šest rečenica koje ćete čuti uz Compose. Okrenite svaki papirić.">
        <MythOrFact
          items={[
            {
              statement: 'Kontejneri razgovaraju preko IP adresa koje moram potražiti.',
              fact: false,
              explain: (
                <>
                  Na korisnički definiranoj mreži (Compose je stvara sam) servisi se nalaze po imenu: <code>db:5432</code>. Adrese se mijenjaju, imena ne.
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>localhost</code> u kontejneru je moje računalo.
                </>
              ),
              fact: false,
              explain: (
                <>
                  Svaki kontejner ima vlastiti mrežni imenski prostor; <code>localhost</code> je sam taj kontejner.
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>depends_on</code> čeka da baza bude spremna.
                </>
              ),
              fact: false,
              explain: (
                <>
                  Samo uz <code>condition: service_healthy</code> i provjeru ispravnosti. Bez toga <code>depends_on</code> određuje samo redoslijed pokretanja.
                </>
              ),
            },
            {
              statement: 'Bez volumena podatci baze žive u kontejneru.',
              fact: false,
              explain: (
                <>
                  Slika <code>postgres</code> ima <code>VOLUME</code>, pa Docker stvori anonimni volumen. Kontejner stvoren nakon <code>docker rm</code> ili <code>down</code> ga ne nasljeđuje – podatci „nestanu” i ostanu viseći dok ih <code>docker volume prune</code> ne obriše.
                </>
              ),
            },
            {
              statement: (
                <>
                  Treba <code>docker-compose</code> i <code>version: '3.8'</code>.
                </>
              ),
              fact: false,
              explain: (
                <>
                  Stari <code>docker-compose</code> više se ne održava. Koristite <code>docker compose</code>; ključ <code>version</code> se zanemaruje (uz upozorenje da je zastario).
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>restart: always</code> znači visoku dostupnost.
                </>
              ),
              fact: false,
              explain: <>Pravilo ponovnog pokretanja vraća kontejnere samo na istom računalu. Kad računalo padne, ništa se ne premješta drugamo.</>,
            },
          ]}
        />
      </Section>

      {/* 8 ─ recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            <>
              <code>compose.yaml</code> opisuje cijelu aplikaciju: servise, portove, mreže i volumene. <code>docker compose up -d</code> iz njega stvara sve pravim redom.
            </>,
            <>
              Na korisnički definiranoj mreži servisi se nalaze po imenu (<code>db:5432</code>); <code>localhost</code> u kontejneru je sam taj kontejner.
            </>,
            <>
              Imenovani volumen preživi <code>down</code> i <code>docker rm</code>, a briše ga <code>down -v</code>. Bez njega Postgres piše u anonimni volumen koji kontejner stvoren nakon <code>docker rm</code> ili <code>down</code> ne nasljeđuje.
            </>,
            <>
              <code>depends_on</code> određuje redoslijed; na spremnost čeka tek <code>condition: service_healthy</code> s provjerom ispravnosti.
            </>,
            <>
              <code>restart</code> ponovno pokreće kontejnere na istom računalu. Kad računalo padne, Klopa stoji.
            </>,
          ]}
        />
        <StoryMap at="09" caption="Klopa nakon 9. predavanja: šest kontejnera opisanih jednom datotekom – još uvijek na jednom računalu kojim upravlja Davor." />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Nakon <code>docker compose up</code> API u logu piše <code className={styles.wrap}>could not translate host name "db" to address</code>. Što je najvjerojatniji uzrok?
                </>
              ),
              options: [
                <>
                  <code>db</code> nije na istoj korisnički definiranoj mreži kao <code>api</code> (npr. ima <code>network_mode: bridge</code>) ili ne radi.
                </>,
                <>Postgres se još inicijalizira.</>,
                <>Lozinka za bazu je kriva.</>,
                <>Port 5432 nije objavljen na računalu.</>,
              ],
              correct: 0,
              explain: (
                <>
                  Poruka kaže da se <em>ime</em> nije moglo pretvoriti u adresu – to je DNS. Ugrađeni DNS zna samo kontejnere koji rade na istoj korisnički definiranoj mreži. Baza u inicijalizaciji dala bi <code>Connection refused</code>, kriva lozinka
                  grešku prijave, a objavljeni port za razgovor kontejnera nije potreban.
                </>
              ),
            },
            {
              q: (
                <>
                  Baza nema imenovani volumen. Napravite <code>docker compose down</code> pa <code>docker compose up -d</code>. Što je s narudžbama?
                </>
              ),
              options: [
                <>Ostale su – Compose spoji isti anonimni volumen.</>,
                <>Nema ih u bazi, ali leže u visećem anonimnom volumenu.</>,
                <>Obrisane su zauvijek već nakon down.</>,
                <>Ostale su, jer down ne briše ništa.</>,
              ],
              correct: 1,
              explain: (
                <>
                  <code>down</code> briše kontejnere, a anonimne volumene (bez <code>-v</code>) ostavlja. Novi kontejner dobije novi, prazan anonimni volumen. Stari s narudžbama visi dok ga ne obrišete.
                </>
              ),
            },
            {
              q: (
                <>
                  Što radi <code>depends_on: [db]</code> bez uvjeta?
                </>
              ),
              options: [<>Čeka da baza prihvaća veze.</>, <>
                  Određuje redoslijed: <code>db</code> se pokreće prije <code>api</code> – na spremnost baze ne čeka.
                </>, <>Ponovno pokrene api kad baza padne.</>, <>Stavi api i db u istu mrežu.</>],
              correct: 1,
              explain: (
                <>
                  Kratki oblik određuje samo redoslijed pokretanja (i obrnutim redom gasi). Na spremnost se čeka tek s <code>condition: service_healthy</code> i provjerom ispravnosti. Mrežu Compose daje svim servisima i bez <code>depends_on</code>.
                </>
              ),
            },
            {
              q: (
                <>
                  Web prosljeđuje zahtjeve na <code>api:8000</code>. Koje <code>ports</code> treba servis <code>api</code>?
                </>
              ),
              options: [
                <>Nijedan.</>,
                <>
                  <code>"8000:8000"</code>
                </>,
                <>
                  <code>"8080:8000"</code>
                </>,
                <>
                  <code>"80:8000"</code>
                </>,
              ],
              correct: 0,
              explain: (
                <>
                  <code>ports</code> otvara vrata s računala u kontejner. Web i API razgovaraju unutar mreže projekta, pa API vrata ne treba. <code>8080:8000</code> bi se uz to sudario s webom: <code>port is already allocated</code>.
                </>
              ),
            },
            {
              q: (
                <>
                  Svi servisi imaju <code>restart: always</code>. Kvar napajanja ugasi računalo. Što se događa?
                </>
              ),
              options: [
                <>Docker ih pokrene na drugom računalu.</>,
                <>Ništa, dok se to računalo ponovno ne pokrene – tada ih Docker sam pokrene.</>,
                <>Compose ih premjesti na računalo koje radi.</>,
                <>Kontejneri nastave raditi u memoriji.</>,
              ],
              correct: 1,
              explain: <>Pravilo ponovnog pokretanja zna samo za svoje računalo. Kad se ono vrati, Docker pokrene kontejnere – sve odjednom, bez redoslijeda iz <code>depends_on</code>. Za premještanje drugamo treba orkestrator.</>,
            },
            {
              q: <>Iz 8. predavanja: gdje završi datoteka koju proces zapiše u kontejneru, a nije u volumenu?</>,
              options: [<>
                  U zapisivom sloju kontejnera, koji nestaje s <code>docker rm</code>.
                </>, <>U slici, pa je ima svaki novi kontejner.</>, <>U registru, uz sliku.</>, <>Docker je sam premjesti u volumen.</>],
              correct: 0,
              explain: <>Slika je nepromjenjiva; sve što kontejner zapiše ide u njegov zapisivi sloj i nestaje zajedno s kontejnerom. Zato podatci baze žive u volumenu.</>,
            },
          ]}
        />
      </Section>

      {/* 9 ─ cost */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            <>
              Cijela Klopa opisana je jednom datotekom u Gitu, a <code>docker compose up -d</code> je diže uvijek istim redom.
            </>,
            <>Servisi se nalaze po imenu, a narudžbe su u imenovanom volumenu.</>,
            <>API čeka da baza bude spremna, a srušeni kontejner se sam vraća.</>,
          ]}
          paid={[
            <>Sve radi na jednom računalu: kad ono padne, pada cijela Klopa.</>,
            <>
              Nitko ne uspoređuje stanje s datotekom: obrisan kontejner ili ugašeno računalo ostaju takvi dok netko ručno ne pokrene <code>docker compose up</code>.
            </>,
            <>Za više računala treba više kopija datoteke i netko tko ručno odlučuje što ide kamo.</>,
          ]}
          next={<>Klopa sada radi na tri računala, a Davor ručno odlučuje koji kontejner ide kamo. U 03:00 poslužitelj-2 umre s devet kontejnera na sebi, a Davorov mobitel zvoni.</>}
        />
      </Section>
    </>
  )
}

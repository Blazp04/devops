import { Analogy, Callout, CodeBlock, CostNote, DeepDive, IncidentCard, KeyIdea, MarginNote, MythOrFact, Predict, Quiz, Recap, Section, StoryMap, Tabs, Term, Terminal } from '../../kit'
import { DockerizeStepper } from './sims/DockerizeStepper'
import { LayersStepper } from './sims/LayersStepper'
import { ImageContainers } from './sims/ImageContainers'
import { BuildLab } from './sims/BuildLab'
import { SecretInspector } from './sims/SecretInspector'
import { RegistryStepper } from './sims/RegistryStepper'
import { PortLab } from './sims/PortLab'
import { UnderHoodStepper } from './sims/UnderHoodStepper'
import { REGISTRY_STORY } from './registryStory'
import styles from './styles.module.css'
import dockerfileWeb from './code/Dockerfile.web?raw'
import dockerfileWebLos from './code/Dockerfile.web-los?raw'
import dockerfileApi from './code/Dockerfile.api?raw'
import dockerfileSecret from './code/Dockerfile.secret?raw'
import dockerignore from './code/dockerignore.txt?raw'
import naredbe from './code/naredbe.sh?raw'
import tajnaBuild from './code/tajna-build.sh?raw'
import buildx from './code/buildx.sh?raw'

const R = REGISTRY_STORY
const REF = `${R.host}/${R.repo}`
/** code in the small incident-metric labels keeps the label's size (the kit shrinks inline code to 0,9 em, under 12 px there) */
const METRIC_CODE = { fontSize: '1em' } as const

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook: the incident and „kod mene radi” */}
      <Section id="incident" kicker="priča" title="Kod mene radi" lead="Klopa je dobila svoj prvi Dockerfile. Radi – ali izgradnja je spora, slika golema, a u njoj je tajna.">
        <IncidentCard
          no={8}
          when="četvrtak, 15:20"
          title="Prva Klopina slika: spora izgradnja, 1,7 GB i ključ unutra"
          who="davor"
          says={['Ključ za SMS', 'u slici?!']}
          metrics={[
            { label: 'ponovna izgradnja', value: '44 s', tone: 'bad' },
            { label: 'slika', value: '1,7 GB', tone: 'bad' },
            { label: <><code style={METRIC_CODE}>.env</code> u slici</>, value: 'sloj 6', tone: 'bad' },
            { label: <>isti <code style={METRIC_CODE}>latest</code></>, value: '2 digesta', tone: 'warn' },
          ]}
          preset="ivin-prvi"
          seed={42}
        >
          Iva je napisala prvi Dockerfile za Klopin web, u korijenu repozitorija. Nakon promjene jednog retka koda izgradnja traje 44&nbsp;s, slika ima 1,7&nbsp;GB, Davor je u njoj pronašao <code>.env</code> s ključem za SMS-gateway, a{' '}
          <code>latest</code> na poslužitelju nije isti <code>latest</code> kao na Ivinom laptopu.
        </IncidentCard>
        <p>
          U prošlom smo predavanju vidjeli da je <Term id="container">kontejner</Term> običan proces s „naočalama” (imenski prostori: vidi samo svoje datoteke, procese i mrežu) i „pojasom” (cgroups: ograničeni su mu procesor i memorija). Ostalo je
          pitanje: odakle kontejneru njegove datoteke – kod, Node.js, sistemske biblioteke – i kako postići da na Ivinom laptopu i na poslužitelju budu potpuno iste?
        </p>
        <MarginNote tone="red">najskuplja rečenica u IT-u: „kod mene radi”</MarginNote>
        <p>Krenimo od problema koji svaki tim prije ili kasnije upozna.</p>
        <DockerizeStepper />
        <p>
          To je <Term id="containerization">kontejnerizacija</Term> (engl. <em>containerization</em>, u žargonu „dockerizacija”): aplikaciju i sve o čemu ovisi pakiramo u <Term id="container-image">sliku kontejnera</Term> (engl. <em>image</em>), a iz
          slike pokrećemo kontejnere. Recept za sliku je <Term id="dockerfile">Dockerfile</Term>, a gotova slika putuje kroz <Term id="registry">registar</Term>. Na poslužitelj više ne prenosimo upute „instaliraj ovo i ono”, nego gotov paket.
        </p>
        <Analogy
          title="Analogija: brodski kontejner"
          who="mira"
          breaksDown="„radi svugdje” ne vrijedi za različite arhitekture procesora (slika za amd64 ne radi na arm64 bez emulacije) ni operacijskih sustava: Linuxov kontejner na macOS-u ili Windowsu radi u skrivenom Linuxovom virtualnom stroju. A čelični kontejner je stvarna zaštitna granica – softverski kontejner samo je ograničen proces koji dijeli jezgru operacijskog sustava s domaćinom."
        >
          Lučka dizalica ne zna je li u kontejneru namještaj ili banane – zna samo standardne mjere i kuke. Tako i Docker, poslužitelj ili Kubernetes s kontejnerom rade jednako, bez obzira na to je li unutra Node.js ili Python.
        </Analogy>
        <p>
          Iva je upravo to napravila i Klopa se doista pokreće u kontejneru. Ali kartica s incidentom gore pokazuje četiri problema odjednom: sporu izgradnju, golemu sliku, ključ u slici i ime koje ne znači isto na dva računala. Sva četiri imaju
          isti korijen – <strong>način na koji se slika gradi</strong>.
        </p>
      </Section>

      {/* 2 ─ Concept: image vs container, layers */}
      <Section id="slika" kicker="slika" title="Slika, kontejner i slojevi" lead="Slika je nepromjenjiv predložak, kontejner je njezin pokrenuti primjerak – a oboje je građeno od slojeva.">
        <p>
          Ako ste ikad programirali objektno, najbolja usporedba vam je već poznata. <strong>Slika je klasa, kontejner je objekt.</strong> Iz jedne slike možemo pokrenuti koliko god kontejnera; svaki ima svoje stanje, a slika se pritom ne mijenja.
        </p>
        <ImageContainers />
        <Analogy
          title="Analogija: klasa i objekt"
          who="lana"
          breaksDown={
            <>
              slika nije kod koji se izvršava, nego hrpa nepromjenjivih slojeva datoteka. A „stanje objekta” – zapisivi sloj kontejnera – briše se zajedno s kontejnerom. Naredba <code>docker commit</code> mogla bi ga doduše pretvoriti u novu
              sliku, ali to je loša praksa: tako nastaje slika koju nitko ne zna ponovno izgraditi. Podatci idu u volumen, a promjene u Dockerfile.
            </>
          }
        >
          <code>new KlopaApi()</code> tri puta: tri objekta s vlastitim poljima, jedna klasa. <code>docker run klopa-api</code> tri puta: tri kontejnera s vlastitim zapisivim slojem, jedna slika.
        </Analogy>
        <p>
          Kako izgleda unutrašnjost slike? Bazna slika iz retka <code>FROM</code> donosi svoje slojeve, a svaka sljedeća naredba koja mijenja datoteke (<code>COPY</code>, <code>RUN</code>, <code>WORKDIR</code> kad stvara mapu) dodaje još jedan <Term id="image-layer">sloj</Term>. Sloj je
          nepromjenjiv i sadrži samo razliku u odnosu na sloj ispod. Pogledajmo korak po korak što iz toga slijedi.
        </p>
        <LayersStepper />
        <p>
          Naredbe <code>USER</code>, <code>ENV</code>, <code>CMD</code> i <code>EXPOSE</code> ne dodaju datoteke: mijenjaju samo postavke slike (s kojim se korisnikom i kojom naredbom kontejner pokreće), a <code>ARG</code> postoji samo za vrijeme
          izgradnje. U ispisu <code>docker image history</code> sve se vide kao koraci veličine 0&nbsp;B.
        </p>
        <Analogy
          title="Analogija: slojevi kao commitovi u Gitu"
          who="davor"
          breaksDown="slično kao u Gitu, obrisana datoteka ostaje u povijesti. Razlika: iz slike ne možemo izbaciti sloj – možemo samo izgraditi novu sliku bez njega, a stara s tajnom ostaje u registru i kod svih koji su je povukli (zato ključ rotiramo)."
        >
          Svaki sloj bilježi samo promjene u odnosu na prethodni i ima svoj sažetak, kao commit. Isti slojevi dijele se među slikama, kao što grane dijele zajedničke commitove.
        </Analogy>
      </Section>

      {/* 3 ─ Flagship: build cache lab */}
      <Section id="laboratorij" kicker="simulacija" title="Laboratorij predmemorije izgradnje" lead="Zašto Ivina izgradnja nakon promjene jednog retka traje 44 s – i kako je premještanjem jedne kartice spustiti na 4 s.">
        <p>
          Kad pokrenemo <code>docker build</code>, graditelj <Term id="buildkit">BuildKit</Term> prolazi Dockerfile redak po redak i za svaki korak računa ključ. Ako je isti ključ već u <Term id="build-cache">predmemoriji izgradnje</Term>, korak se
          ne izvršava: ispiše se <code>CACHED</code> i za tren je gotov. Ključ čine tri stvari:
        </p>
        <ul>
          <li>
            <strong>sama naredba</strong> (tekst retka);
          </li>
          <li>
            <strong>njezini ulazi</strong> – za <code>COPY</code> sažetak sadržaja kopiranih datoteka iz <Term id="build-context">konteksta izgradnje</Term>, za <code>RUN</code> tekst naredbe i okruženje (ali ne i datoteke koje naredba čita);
          </li>
          <li>
            <strong>ključ sloja ispod</strong>, tj. svih prethodnih redaka iste faze.
          </li>
        </ul>
        <p>
          Zbog treće stavke promjena se prenosi lančano, kao efekt domina: čim jedan korak promaši predmemoriju, svi koraci nakon njega u istoj fazi grade se ponovno – čak i ako se njihovi ulazi nisu promijenili. (U višefaznom Dockerfileu druga
          faza ima svoj lanac: njezin <code>FROM</code> ostaje <code>CACHED</code>, a <code>COPY --from</code> se ponovno izvrši samo ako su se kopirane datoteke promijenile.)
        </p>
        <Predict
          question={
            <>
              U Ivinom Dockerfileu <code>COPY . .</code> stoji prije <code>RUN npm ci</code>. Iva promijeni jedan redak u <code>src/</code> i pokrene izgradnju. Što se gradi ponovno?
            </>
          }
          options={[
            <>
              Samo <code>COPY . .</code> (oko 1&nbsp;s)
            </>,
            <>
              <code>COPY . .</code> i sve nakon njega, uključujući <code>npm ci</code> (oko 44&nbsp;s)
            </>,
            <>
              Cijela slika, od <code>FROM</code> (oko 53&nbsp;s)
            </>,
            <>
              Ništa – <code>package.json</code> se nije promijenio
            </>,
          ]}
          correct={1}
          explain={
            <>
              <code>COPY . .</code> kopira i <code>src/</code>, pa se sažetak njegovih ulaza promijeni i korak promaši predmemoriju. Svi koraci nakon njega imaju novi ključ „sloja ispod”, pa se ponovno izvrši i <code>npm ci</code> (40&nbsp;s) – iako
              se ovisnosti nisu promijenile. <code>FROM</code> i <code>WORKDIR</code> ostaju iz predmemorije.
            </>
          }
          then="Provjerite u laboratoriju: „Promijeni kod”, pa „Izgradi”."
        />
        <KeyIdea>
          Slika je hrpa <strong>nepromjenjivih slojeva</strong>. Korak se uzima iz predmemorije samo ako se <strong>ni on ni njegovi ulazi</strong> nisu promijenili <strong>i nijedan raniji korak njegove faze</strong> nije ponovno izgrađen – zato naredbe slažemo od onoga što se rijetko
          mijenja prema onome što se mijenja stalno.
        </KeyIdea>
        <BuildLab />
        <DeepDive title="Ako zapnete: putokazi za zadatke">
          <ul>
            <li>
              <strong>&lt; 5&nbsp;s:</strong> povucite <code>COPY . .</code> ispod <code>RUN npm ci</code>, izgradite jednom (promijenio se Dockerfile), pa „Promijeni kod” i „Izgradi”.
            </li>
            <li>
              <strong>&lt; 200&nbsp;MB:</strong> slika s jednom fazom nosi Node.js, <code>node_modules</code> i alate za izgradnju. Uključite „Višefaznu izgradnju”: u konačnu sliku ide samo nginx i gotove datoteke.
            </li>
            <li>
              <strong>Ključ:</strong> bez <code>.dockerignore</code> <code>COPY . .</code> kopira i <code>.env</code> – kliknite taj sloj u slici. Ili pritisnite „Kopiraj .env pa ga obriši”, izgradite i potražite ga u nižem sloju.
            </li>
            <li>
              <strong>Nije root:</strong> dodajte <code>USER node</code> iz ladice ili uključite višefaznu izgradnju (nginx-unprivileged radi kao korisnik 101).
            </li>
          </ul>
        </DeepDive>
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <strong>Redoslijed je brzina.</strong> Ovisnosti (<code>package*.json</code>, <code>npm ci</code>) idu prije koda (<code>COPY . .</code>): promjena koda tada gradi samo <code>COPY</code> i <code>npm run build</code> – oko 4&nbsp;s
              umjesto 44&nbsp;s.
            </li>
            <li>
              <strong>
                <Term id="dockerignore">.dockerignore</Term>
              </strong>{' '}
              smanjuje kontekst izgradnje s oko 410&nbsp;MB na desetak MB: <code>node_modules</code>, <code>.git</code> i <code>.env</code> ne putuju graditelju. Bez njega i svaki <code>git commit</code> mijenja <code>.git/</code> i poništava{' '}
              <code>COPY . .</code>.
            </li>
            <li>
              <strong>
                <Term id="multi-stage-build">Višefazna izgradnja</Term>
              </strong>{' '}
              ostavlja alate za izgradnju u prvoj fazi: konačna slika ima oko 50&nbsp;MB i radi kao korisnik koji nije root.
            </li>
            <li>
              <strong>Izgradnja iz predmemorije daje isti digest.</strong> Ako je baš svaki korak <code>CACHED</code>, slika je bajt po bajt ista. Čim se ijedan sloj ponovno izgradi – ili gradimo na novom računalu bez predmemorije – digest je
              drugačiji, čak i za isti kod, jer naredbe <code>RUN</code> stvaraju datoteke s novim vremenom izmjene.
            </li>
          </ul>
        </Callout>
        <Callout kind="fact" title="Što je u laboratoriju stvarno, a što pojednostavljeno (stanje: listopad 2026.)">
          Pravila predmemorije (ključ = naredba + ulazi + sloj ispod, kaskada, <code>CACHED</code>) rade kao u BuildKitu. Trajanja i veličine su ilustrativni (npr. <code>npm ci</code> 40&nbsp;s, puna slika <code>node:24</code> oko
          1,1&nbsp;GB, <code>node:24-slim</code> oko 250&nbsp;MB), a naredbe <code>RUN</code> se ne izvršavaju stvarno.
        </Callout>
      </Section>

      {/* 4 ─ Secret in a layer */}
      <Section id="tajna" kicker="sigurnost" title="Tajna u sloju" lead={
          <>
            „Obrisali smo <code>.env</code>” – ali samo u gornjem sloju. Tko god može povući sliku, može pročitati i donji.
          </>
        }>
        <p>
          Kako je ključ za SMS-gateway završio u Ivinoj slici? Bez <code>.dockerignore</code> naredba <code>COPY . .</code> kopirala je cijeli repozitorij, a s njim i datoteku <code>.env</code>. Da je Iva dodala <code>RUN rm .env</code>, ništa se ne
          bi promijenilo: kao što smo vidjeli kod slojeva, brisanje samo dodaje oznaku brisanja (engl. <em>whiteout</em>) u novi sloj. Datoteka i dalje leži u sloju ispod: <code>docker save</code> izvozi sve slojeve, pa je svatko tko ima sliku
          može izvući i pročitati. (<code>docker image history</code> samu datoteku ne pokazuje – vidi se samo naredba poput <code>RUN rm .env</code>, koja otkriva da je ondje bila.)
        </p>
        <p>
          Druga tajna treba nam već pri izgradnji: Klopin web koristi privatni npm paket, pa <code>npm ci</code> treba token. Isprobajte tri načina da token dođe do izgradnje.
        </p>
        <SecretInspector />
        <p>Iz toga slijede pravila koja vrijede za svaki Dockerfile:</p>
        <ol>
          <li>
            <strong>
              <code>.dockerignore</code> prvo.
            </strong>{' '}
            Ono čega nema u kontekstu izgradnje, ne može završiti u slici: <code>.env</code>, <code>.npmrc</code>, <code>.git</code>, <code>node_modules</code>.
          </li>
          <li>
            <strong>
              Nikad tajne u <code>ENV</code> ni <code>ARG</code>.
            </strong>{' '}
            Vrijednost <code>ENV</code> zapisana je u postavkama slike (<code>docker image inspect</code>), a vrijednost <code>ARG</code> u povijesti slike uz svaku naredbu <code>RUN</code> koja slijedi.
          </li>
          <li>
            <strong>Tajne za izgradnju predajemo kao tajne BuildKita:</strong> <code className={styles.wrapCode}>RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci</code> i{' '}
            <code className={styles.wrapCode}>docker build --secret id=npmrc,src=…</code>. Datoteka postoji samo dok traje ta jedna naredba i ne zapisuje se ni u jedan sloj.
          </li>
          <li>
            <strong>Tajne za rad aplikacije uopće ne idu u sliku.</strong> Ključ za SMS-gateway predaje se kontejneru tek pri pokretanju, kao varijabla okruženja ili datoteka. Kako to radi Kubernetes, vidjet ćemo u predavanju o Secretima.
          </li>
          <li>
            <strong>Višefazna izgradnja nije zamjena.</strong> Ona ostavlja alate i međudatoteke u prvoj fazi, pa token iz te faze ne dođe u konačnu sliku. Ali slojevi prve faze i dalje postoje u predmemoriji graditelja (npr. u predmemoriji CI-ja) –
            zato i ondje tajnu predajemo kao <code>--mount=type=secret</code>.
          </li>
        </ol>
        <Callout kind="danger" title="Ako je ključ već bio u slici">
          Ako je slika s tajnom ikad otišla u registar, smatrajte ključ procurjelim i zamijenite ga (rotirajte) kod pružatelja usluge. Brisanje slike iz registra ne vraća ono što je netko možda već povukao.
        </Callout>
      </Section>

      {/* 5 ─ Registry, tag, digest */}
      <Section id="registar" kicker="registar" prop="box" title="Registar, tag i digest" lead="Ime s tagom kaže koju sliku želimo. Samo digest kaže koju smo dobili.">
        <p>
          Registar je poslužitelj koji čuva slike: zadano je to Docker Hub, a Klopa ima svoj, <code>{R.host}</code>. Puno ime slike ima tri dijela: <code>registar/ime:tag</code>, npr. <code className={styles.wrapCode}>{REF}:1.3.2</code>.{' '}
          <Term id="tag">Tag</Term> je samo oznaka koju je netko zalijepio na sliku; <Term id="digest">digest</Term> (<code>sha256:…</code>) je sažetak njezina sadržaja.
        </p>
        <RegistryStepper />
        <p>
          Ovako izgleda drugi <code>docker push</code> iz animacije (ispis daje isti model kao laboratorij):
        </p>
        <Terminal
          title="Ivin laptop"
          lines={[
            { comment: 'nova slika, samo s promijenjenim kodom' },
            { cmd: `docker push ${REF}:${R.sha2}`, prompt: 'iva@klopa:~$' },
            { out: `The push refers to repository [${REF}]` },
            { out: R.push2.log.slice(0, R.push2.existed).join('\n'), tone: 'muted' },
            { out: R.push2.log.slice(R.push2.existed, R.push2.existed + R.push2.uploaded).join('\n'), tone: 'ok', note: 'Šalje se samo novi sloj – ostali su već ondje.', who: 'iva' },
            { out: R.push2.log.slice(R.push2.existed + R.push2.uploaded).join('\n') },
          ]}
        />
        <MarginNote>latest ≠ najnovija. latest = ono što je netko zadnji označio.</MarginNote>
        <p>
          Tag <code>latest</code> nije ništa posebno: to je zadani tag kad ga ne napišemo, a pokazuje na sliku na koju ga je netko zadnji put pomaknuo. Zato u praksi slike označavamo nepromjenjivim tagovima – verzijom (<code>1.3.2</code>) ili kratkim
          SHA-om commita – a gdje je važno, pokrećemo ih po digestu: <code className={styles.wrapCode}>{REF}:1.3.2@sha256:…</code>. Ako navedemo i tag i digest, Docker i Kubernetes gledaju samo digest. Kubernetes, do kojega stižemo za nekoliko
          predavanja, sliku s tagom <code>latest</code> zadano ponovno traži u registru pri svakom pokretanju.
        </p>
        <DeepDive title="Zašto se digest u registru mijenja pri svakoj izgradnji">
          <Callout kind="fact" title="Atestacije i indeks (stanje: listopad 2026.)">
            Docker 29 uz sliku zadano šalje i atestacije – zapis o tome kako je slika izgrađena, s vremenom izgradnje. Registar tada za tag čuva popis manifesta (indeks), a digest tog popisa mijenja se pri svakoj izgradnji. Digest same slike
            (manifesta za <code>linux/amd64</code>), koji prikazuje laboratorij, ostaje isti kad je sve iz predmemorije. Oba digesta pokazuje naredba <code>docker buildx imagetools inspect</code>.
          </Callout>
        </DeepDive>
        <Callout kind="fact" title="Docker Hub i javne slike (stanje: listopad 2026.)">
          <ul>
            <li>Docker Hub ograničava broj povlačenja u razdoblju od 6 sati: bez prijave 100 po IPv4 adresi (ili IPv6 mreži /64), s osobnim besplatnim računom 200. Učionica iza jedne javne adrese brzo dođe do granice.</li>
            <li>
              Od 28. kolovoza 2025. besplatne slike <code>bitnami/*</code> premještene su u <code>bitnamilegacy</code>, bez zakrpa; stari katalog uklonjen je 29. rujna 2025. Stari vodiči (tutorijali) s njima više ne rade.
            </li>
            <li>Docker Hardened Images (minimalne bazne slike) besplatne su i otvorene (Apache-2.0) od 17. prosinca 2025.</li>
          </ul>
        </Callout>
      </Section>

      {/* 6 ─ Running: ports, writable layer, under the hood */}
      <Section id="vrata" kicker="isprobajte" title="Vrata u zidu" lead="Kontejner ima vlastitu mrežu. Da bi do njega stigao zahtjev s domaćina, trebaju vrata – i aplikacija koja sluša na pravom mjestu.">
        <p>
          Sjetite se: kontejner ima vlastiti imenski prostor mreže, pa i vlastiti <code>localhost</code>. Naredba <code className={styles.wrapCode}>docker run -p 8080:8000 klopa-api</code> otvara vrata u zidu – <Term id="port-mapping">preslikavanje porta</Term>: promet na port
          8080 domaćina šalje se na port 8000 u kontejneru. Redak <code>EXPOSE 8000</code> u Dockerfileu samo dokumentira koji port aplikacija koristi; vrata ne otvara. <code>-p 8080:8000</code> otvara port na svim mrežnim sučeljima
          domaćina; ako želimo pristup samo s vlastitog računala, pišemo <code className={styles.wrapCode}>-p 127.0.0.1:8080:8000</code>.
        </p>
        <p>
          Druga polovica priče je aplikacija. Kao u prvom predavanju: program koji sluša na <code>127.0.0.1</code> prima samo veze s istog računala – a „isto računalo” je sada kontejner. Gunicorn bez opcije <code>--bind</code> sluša baš na{' '}
          <code>127.0.0.1:8000</code>.
        </p>
        <Predict
          question={
            <>
              Iva pokrene <code className={styles.wrapCode}>docker run -p 8080:8000 klopa-api</code>, a gunicorn u slici ima zadane postavke. Što vrati <code>curl localhost:8080</code> na njezinu laptopu?
            </>
          }
          options={[
            <>
              <code>HTTP/1.1 200 OK</code>
            </>,
            <>
              <code>Connection refused</code> – na portu 8080 nitko ne sluša
            </>,
            <>
              <code>Connection reset by peer</code> – vrata postoje, ali iza njih nitko ne čeka
            </>,
            <>
              <code>404 Not Found</code>
            </>,
          ]}
          correct={2}
          explain={
            <>
              Vrata postoje (Docker prima vezu na portu 8080 i prosljeđuje je kontejneru na port 8000), ali gunicorn sluša samo na <code>127.0.0.1</code> unutar kontejnera, a ne na njegovu mrežnom sučelju. Veza se zato prekine. Rješenje je u slici:{' '}
              <code>--bind 0.0.0.0:8000</code>. (Na Docker Desktopu <code>curl</code> često javi „Empty reply from server” – uzrok je isti.)
            </>
          }
          then="Isprobajte sve tri kombinacije u laboratoriju ispod."
        />
        <PortLab />
        <p>
          Zadnji zadatak pokazuje drugu važnu stvar. Sve što proces zapiše, završi u <Term id="writable-layer">zapisivom sloju</Term> kontejnera – a on se briše zajedno s kontejnerom. (Klopin API radi kao korisnik 10001, pa smije pisati samo ondje gdje mu je dopušteno, npr. u{' '}
          <code>/tmp</code>.) Zato:
        </p>
        <ul>
          <li>
            <strong>podatci</strong> (narudžbe, baza) moraju živjeti izvan kontejnera, u <Term id="volume">volumenu</Term> – o tome u sljedećem predavanju;
          </li>
          <li>
            <strong>kod i konfiguraciju</strong> nikad ne popravljamo u pokrenutom kontejneru: popravak ide u repozitorij, iz njega nova slika, iz slike novi kontejner.
          </li>
        </ul>
        <DeepDive title="Ispod haube: od naredbe docker do procesa">
          <p>
            Naredba <code>docker</code> samo je klijent. Pravi posao obavlja lanac programa, a svaka karika drži se otvorenih standarda <Term id="oci">OCI</Term> (Open Container Initiative): kako izgleda slika, kako se pokreće kontejner i kako se
            slike prenose iz registra.
          </p>
          <UnderHoodStepper />
          <p>
            Program koji stvarno pokreće kontejnere zove se <Term id="container-runtime">izvršno okruženje za kontejnere</Term> (engl. <em>container runtime</em>). Kubernetes s njim razgovara kroz sučelje CRI (engl. <em>Container Runtime Interface</em>), a Docker mu ne treba – slika izgrađena
            Dockerom ipak radi bez ikakve promjene, jer je OCI slika. Isto vrijedi za Podman, koji kontejnere pokreće bez stalno pokrenutog pozadinskog procesa.
          </p>
          <Callout kind="fact" title="Verzije koje se spominju (stanje: listopad 2026.)">
            Kubernetes je posrednik dockershim uklonio u verziji 1.24; danas su uobičajena izvršna okruženja containerd i CRI-O. Docker Engine 29.0.0 (10. studenoga 2025.) za nove instalacije zadano sprema slike u containerd; aktualna verzija je
            29.8.2. Docker je OCI-ju darovao runc, a na macOS-u Docker Desktop kontejnere pokreće u Linuxovu virtualnom stroju.
          </Callout>
        </DeepDive>
      </Section>

      {/* 7 ─ Code */}
      <Section id="kod" kicker="kod" title="Dockerfile koji ostaje u repozitoriju" lead="Sve što ste složili u laboratoriju, u datotekama koje Klopa stvarno koristi.">
        <Tabs
          wide
          tabs={[
            {
              label: 'klopa-web',
              content: (
                <>
                  <CodeBlock
                    title="Dockerfile"
                    lang="dockerfile"
                    code={dockerfileWeb}
                    caption="Dobar redoslijed i dvije faze: Node.js gradi, nginx poslužuje."
                    previewLines={11}
                    notes={[
                      { lines: '7-8', text: 'ovisnosti prije koda: npm ci ostaje CACHED' },
                      { lines: '10-11', text: 'promjena koda gradi samo ova dva koraka' },
                      { lines: '14-15', text: 'u sliku ide samo nginx + dist: oko 50 MB' },
                      { lines: '17', text: 'nije root: zadatak iz laboratorija' },
                    ]}
                  />
                  <CodeBlock title="Dockerfile (Ivin prvi, za usporedbu)" lang="dockerfile" code={dockerfileWebLos} mode="closed" caption={
                      <>
                        Radi, ali: 44&nbsp;s nakon svake promjene koda, 1,7&nbsp;GB, korisnik <code>root</code> i <code>.env</code> u slici.
                      </>
                    }
                  />
                </>
              ),
            },
            {
              label: 'klopa-api',
              content: (
                <CodeBlock
                  title="Dockerfile"
                  lang="dockerfile"
                  code={dockerfileApi}
                  caption="Isti obrazac za Python: requirements.txt prije koda, korisnik koji nije root i gunicorn na 0.0.0.0."
                  notes={[
                    { lines: '5-6', text: 'pip install samo kad se promijeni requirements.txt' },
                    { lines: '7', text: 'promjena koda: oko 1 s' },
                    { lines: '11', text: 'samo dokumentacija – vrata otvara -p' },
                    { lines: '13', text: 'bez --bind gunicorn sluša na 127.0.0.1' },
                  ]}
                />
              ),
            },
            {
              label: 'Tajne',
              content: (
                <>
                  <CodeBlock
                    title=".dockerignore"
                    lang="text"
                    code={dockerignore}
                    caption="Što ne šaljemo graditelju: brža izgradnja i nijedna tajna u kontekstu."
                    notes={[
                      { lines: '2-3', text: 'gradi ih sama slika – ne treba ih slati' },
                      { lines: '4', text: 'svaki commit mijenja .git/ i poništava COPY . .' },
                      { lines: '5-7', text: 'tajne nikad ne ulaze u kontekst' },
                    ]}
                  />
                  <CodeBlock
                    title="Dockerfile (faza build)"
                    lang="dockerfile"
                    code={dockerfileSecret}
                    caption="Token za privatni npm paket postoji samo dok traje npm ci."
                    notes={[{ lines: '7', text: 'tajna se montira, ne kopira: nije ni u jednom sloju' }]}
                  />
                  <CodeBlock title="izgradnja s tajnom" lang="bash" code={tajnaBuild} mode="open" />
                </>
              ),
            },
            {
              label: 'Naredbe',
              content: (
                <>
                  <Terminal
                    title="Lanin laptop · klopa-api"
                    lines={[
                      { cmd: 'docker build -t registry.klopa.example/klopa-api:1.3.2 .' },
                      {
                        out: '[+] Building 1.4s (10/10) FINISHED\n => [1/5] FROM docker.io/library/python:3.13-slim\n => CACHED [2/5] WORKDIR /app\n => CACHED [3/5] COPY requirements.txt .\n => CACHED [4/5] RUN pip install --no-cache-dir -r requirements.txt\n => [5/5] COPY . .\n => exporting to image',
                        note: 'Prije izdanja promijenio se samo kod: pip install ostaje CACHED.',
                        who: 'lana',
                      },
                      { cmd: 'docker run -d --name klopa-api -p 8080:8000 registry.klopa.example/klopa-api:1.3.2' },
                      { cmd: 'curl -i localhost:8080/healthz' },
                      { out: 'HTTP/1.1 200 OK', tone: 'ok' },
                      { comment: 'prvo slanje verzije 1.3.2 – taj se tag poslije više ne pomiče' },
                      { cmd: 'docker push registry.klopa.example/klopa-api:1.3.2' },
                      { cmd: "docker image inspect --format '{{index .RepoDigests 0}}' registry.klopa.example/klopa-api:1.3.2" },
                      { out: 'registry.klopa.example/klopa-api@sha256:…' },
                    ]}
                  />
                  <CodeBlock title="naredbe.sh" lang="bash" code={naredbe} mode="closed" caption="Sve naredbe iz predavanja s komentarima, za kopiranje." />
                </>
              ),
            },
          ]}
        />
        <CodeBlock title="buildx.sh (više arhitektura)" lang="bash" code={buildx} mode="closed" caption="Za laptope s ARM procesorom i poslužitelje x86-64: jedno ime, popis slika po arhitekturi." />
        <Callout kind="fact" title="Verzije u primjerima (stanje: listopad 2026.)">
          Verzije baznih slika su fiksirane (engl. <em>pinned</em>): <code>node:24-slim</code> (Node.js 24 LTS), <code className={styles.wrapCode}>nginxinc/nginx-unprivileged:1.30-alpine</code> i <code>python:3.13-slim</code>. BuildKit je zadani graditelj od Docker Enginea 23.0 (1.
          veljače 2023.), pa varijabla <code>DOCKER_BUILDKIT=1</code> više ne treba. Prije upotrebe provjerite aktualne tagove i oznake zakrpa.
        </Callout>
        <Callout kind="warn" title="Docker Desktop i licenca: provjerite za svoju ustanovu">
          Docker Desktop je besplatan za osobnu upotrebu i male tvrtke. Za obrazovanje uvjeti nisu jednoznačni: neka su sveučilišta nakon promjene ugovora u prosincu 2024. objavila da je besplatna upotreba ograničena na upisane studente, a da
          djelatnici mogu trebati licencu. Besplatne su alternative Docker Engine na Linuxu, Podman Desktop i Rancher Desktop; Podman (bez pozadinskog procesa) je od 21. siječnja 2025. projekt u CNCF Sandboxu.
        </Callout>
      </Section>

      {/* 8 ─ Myths */}
      <Section id="zablude" kicker="zablude" title="Što se o Dockeru često krivo kaže" lead="Devet rečenica koje ćete čuti na vježbama i na internetu – neke su i istinite. Okrenite svaki papirić.">
        <MythOrFact
          items={[
            {
              statement: 'Slika i kontejner su isto.',
              fact: false,
              explain: 'Slika je nepromjenjiv predložak (klasa), a kontejner pokrenuti primjerak (objekt) s vlastitim zapisivim slojem. Iz jedne slike pokrećemo mnogo kontejnera.',
            },
            {
              statement: 'Promjene u pokrenutom kontejneru se spremaju.',
              fact: false,
              explain: (
                <>
                  Zapisivi sloj preživi <code>docker stop</code> i <code>docker start</code> istog kontejnera, ali briše se s <code>docker rm</code>, a novi kontejner iz slike kreće s praznim slojem. Podatci trebaju volumen, a promjena
                  koda novu sliku.
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>RUN rm</code> briše tajnu iz slike.
                </>
              ),
              fact: false,
              explain: 'Datoteka ostaje u nižem sloju; novi sloj je samo skriva oznakom brisanja. Svatko tko ima sliku može je pročitati.',
            },
            {
              statement: (
                <>
                  Promjena jednog retka koda može ponovno pokrenuti <code>npm ci</code>.
                </>
              ),
              fact: true,
              explain: (
                <>
                  Može, ako <code>COPY . .</code> stoji prije <code>RUN npm ci</code>: promašaj predmemorije na <code>COPY</code> povlači sve korake nakon njega u istoj fazi.
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>latest</code> je fiksna, najnovija verzija.
                </>
              ),
              fact: false,
              explain: (
                <>
                  <code>latest</code> je pomični tag: pokazuje na sliku na koju ga je netko zadnji pomaknuo, pa na dva računala može značiti dvije različite slike. Identitet slike je digest.
                </>
              ),
            },
            {
              statement: (
                <>
                  <code>EXPOSE</code> objavljuje port.
                </>
              ),
              fact: false,
              explain: (
                <>
                  <code>EXPOSE</code> samo dokumentira port. Vrata na domaćinu otvara tek <code>docker run -p</code> (ili <code>ports</code> u Composeu).
                </>
              ),
            },
            {
              statement: 'Isti digest znači bajt po bajt istu sliku.',
              fact: true,
              explain: 'Digest je SHA-256 sažetak sadržaja: promijeni li se ijedan bajt, mijenja se i digest.',
            },
            {
              statement: 'Kubernetes pokreće Docker.',
              fact: false,
              explain: 'Kubernetes kroz sučelje CRI razgovara s containerdom ili CRI-O-m; posrednik za Docker (dockershim) uklonjen je prije nekoliko godina. Slike izgrađene Dockerom ipak rade, jer su OCI slike.',
            },
            {
              statement: (
                <>
                  Za BuildKit treba postaviti <code>DOCKER_BUILDKIT=1</code>.
                </>
              ),
              fact: false,
              explain: 'BuildKit je zadani graditelj Docker Enginea od 2023. Varijabla danas služi samo tome da se isključi.',
            },
          ]}
        />
      </Section>

      {/* 9 ─ Recap and quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Kontejnerizacija pakira aplikaciju i sve njezine ovisnosti u sliku kontejnera: ista slika radi isto na laptopu i na poslužitelju (iste arhitekture procesora).',
            <>
              Slika je hrpa nepromjenjivih slojeva (klasa); kontejner je pokrenuti primjerak s tankim zapisivim slojem (objekt) koji nestaje s <code>docker rm</code>.
            </>,
            <>
              Korak je <code>CACHED</code> samo ako se ni on ni njegovi ulazi nisu promijenili i nijedan raniji korak u istoj fazi nije ponovno izgrađen: naredbe slažemo od rijetkih promjena prema čestima, uz <code>.dockerignore</code> i u više faza.
            </>,
            <>
              Obrisana datoteka ostaje u nižem sloju: tajne nikad u <code>COPY</code>, <code>ENV</code> ni <code>ARG</code> – za izgradnju <code>--mount=type=secret</code>, za rad tek pri pokretanju kontejnera.
            </>,
            <>
              Tag je pomični papirić, digest je identitet. Port otvara <code>-p</code>, a aplikacija u kontejneru mora slušati na <code>0.0.0.0</code>.
            </>,
          ]}
        />
        <StoryMap at="08" caption="Klopa nakon ovog predavanja: svaki dio ima svoju sliku kontejnera, izgrađenu iz Dockerfilea u repozitoriju." />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Koji je redoslijed najbolji za Dockerfile klopa-api ako se kod mijenja nekoliko puta na sat, a <code>requirements.txt</code> jednom tjedno?
                </>
              ),
              options: [
                <>
                  <code>FROM</code> → <code>COPY . .</code> → <code>RUN pip install</code> → <code>CMD</code>
                </>,
                <>
                  <code>FROM</code> → <code>RUN pip install</code> → <code>COPY . .</code> → <code>COPY requirements.txt .</code> → <code>CMD</code>
                </>,
                <>
                  <code>FROM</code> → <code>WORKDIR</code> → <code>COPY requirements.txt .</code> → <code>RUN pip install</code> → <code>COPY . .</code> → <code>CMD</code>
                </>,
                'Redoslijed nije važan – BuildKit sam pronađe što se promijenilo.',
              ],
              correct: 2,
              explain: (
                <>
                  Ono što se rijetko mijenja ide prvo. Promjena koda tada promaši predmemoriju tek na <code>COPY . .</code>, pa se <code>pip install</code> (30&nbsp;s) ne ponavlja. Redoslijed s <code>pip install</code> na početku ne radi: naredba se izvršava
                  prije nego što <code>requirements.txt</code> uopće postoji u slici.
                </>
              ),
            },
            {
              q: (
                <>
                  Iva pokrene <code className={styles.wrapCode}>docker run -p 8080:8000 klopa-api</code>, a <code>curl localhost:8080</code> vrati „Connection reset by peer”. Ispis naredbe <code>docker logs klopa-api</code> kaže da gunicorn radi. Što je najvjerojatniji uzrok?
                </>
              ),
              options: [
                <>
                  U Dockerfileu nedostaje <code>EXPOSE 8000</code>.
                </>,
                <>
                  Gunicorn u kontejneru sluša na <code>127.0.0.1</code>, a ne na <code>0.0.0.0</code>.
                </>,
                'Port 8080 na laptopu već koristi drugi program.',
                'Slika je izgrađena za drugu arhitekturu procesora.',
              ],
              correct: 1,
              explain: (
                <>
                  Vrata (<code>-p</code>) postoje, pa veza ne bude odbijena, ali iza njih nitko ne sluša na mrežnom sučelju kontejnera. <code>EXPOSE</code> ne bi ništa promijenio, a zauzet port javio bi grešku već pri <code>docker run</code>.
                </>
              ),
            },
            {
              q: (
                <>
                  Dockerfile sadrži <code>COPY .env .</code> pa odmah <code>RUN rm .env</code>. Je li ključ iz <code>.env</code> u slici?
                </>
              ),
              options: [
                <>
                  Jest, u sloju koji je napravio <code>COPY</code>; gornji sloj ga samo skriva.
                </>,
                <>
                  Nije – <code>RUN rm</code> ga je obrisao.
                </>,
                'Jest, ali samo dok se kontejner ne pokrene.',
                'Nije, ako je slika višefazna.',
              ],
              correct: 0,
              explain: (
                <>
                  Slojevi su nepromjenjivi: <code>RUN rm</code> dodaje oznaku brisanja u novi sloj. Bajtovi ostaju u sloju ispod i svatko sa slikom ih može pročitati. Višefazna izgradnja pomaže samo ako je taj <code>COPY</code> bio u prvoj fazi, a ne u
                  konačnoj.
                </>
              ),
            },
            {
              q: (
                <>
                  Poslužitelji A i B pokreću <code>klopa-web:latest</code>, ali se ponašaju različito. Kako najsigurnije provjeriti pokreću li istu sliku?
                </>
              ),
              options: [
                <>
                  Usporediti tagove – oba su <code>latest</code>, dakle ista slika.
                </>,
                'Usporediti datume izgradnje.',
                'Ponovno pokrenuti oba kontejnera.',
                <>
                  Usporediti digeste slika (npr. <code>docker image inspect</code>, polje <code>RepoDigests</code>).
                </>,
              ],
              correct: 3,
              explain: (
                <>
                  Tag je pomični papirić: A je povukao <code>latest</code> prije nego što ga je netko pomaknuo, a B poslije. Digest je sažetak sadržaja – isti digest znači istu sliku.
                </>
              ),
            },
            {
              q: 'Davor u pokrenutom kontejneru ručno popravi konfiguraciju, zatim kontejner obriše i pokrene novi iz iste slike. Što je s popravkom?',
              options: [
                'Sačuvan je u slici.',
                'Izgubljen je – bio je u zapisivom sloju obrisanog kontejnera.',
                'Sačuvan je dok se ne obriše i slika.',
                'Docker ga automatski spremi u volumen.',
              ],
              correct: 1,
              explain: (
                <>
                  Promijenjena datoteka kopirala se u zapisivi sloj kontejnera, a on nestaje s <code>docker rm</code>. Popravak ide u repozitorij, iz njega nova slika, iz slike novi kontejner.
                </>
              ),
            },
            {
              q: 'Iz prošlog predavanja: kontejner klopa-api radi na Linuxovom poslužitelju. Čiju jezgru operacijskog sustava koristi?',
              options: [
                <>
                  Vlastitu, iz bazne slike <code>python:3.13-slim</code>.
                </>,
                'Jezgru hipervizora.',
                'Jezgru domaćina – slika sadrži samo datoteke korisničkog prostora.',
                'Nijednu – kontejner ne treba jezgru.',
              ],
              correct: 2,
              explain: 'Kontejner je proces domaćina s ograničenim pogledom; slika ne nosi jezgru operacijskog sustava. Zato Linuxov kontejner na macOS-u ili Windowsu treba Linuxov virtualni stroj.',
            },
          ]}
        />
      </Section>

      {/* 10 ─ Cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={['Ista slika, bajt po bajt, radi na Ivinom laptopu i na poslužitelju (iste arhitekture procesora, ili uz sliku za više arhitektura).', 'Promjena koda: oko 4 s izgradnje umjesto 44 s; web-slika ima oko 50 MB umjesto 1,7 GB.', 'Tajne ne ulaze u slike, a poslužitelji pokreću sliku po digestu.']}
          paid={[
            <>
              Svaki dio Klope je zaseban kontejner s vlastitim <code>docker run</code> i hrpom zastavica (<code>-p</code>, <code>--name</code>, <code>-e</code>…).
            </>,
            <>
              Kontejneri ne znaju jedan za drugoga: <code>localhost</code> u kontejneru je sam taj kontejner.
            </>,
            <>
              Što je u kontejneru, za nas nestaje s <code>docker rm</code> – i narudžbe u bazi, ako ih ne spremimo u imenovani volumen.
            </>,
          ]}
          next={
            <>
              Slike su gotove. Ali u README-u sada stoji šest naredbi <code>docker run</code> s po tri retka zastavica. Iva ih pokrene krivim redoslijedom, a API traži bazu na <code>localhost:5432</code> i ne nalazi je.
            </>
          }
        />
      </Section>
    </>
  )
}

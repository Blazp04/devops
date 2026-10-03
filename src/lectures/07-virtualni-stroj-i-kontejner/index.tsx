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
  Section,
  StoryMap,
  Tabs,
  Term,
  Terminal,
} from '../../kit'
import { LibConflict } from './sims/LibConflict'
import { ErasStepper } from './sims/ErasStepper'
import { StackMorph } from './sims/StackMorph'
import { ProcessView } from './sims/ProcessView'
import { Lenses } from './sims/Lenses'
import { BeltCpu, BeltMemory } from './sims/Belt'
import { IsolationStepper } from './sims/IsolationStepper'
import { IsolationSpectrum } from './sims/IsolationSpectrum'
import { StackSim } from './sims/StackSim'
import { CloudStepper } from './sims/CloudStepper'
import fromScratch from './code/kontejner-od-nule.sh?raw'
import styles from './styles.module.css'

/** prompts that match the terminal titles */
const P2 = 'davor@posluzitelj-2:~$'
const MAC = 'lana@macbook:~$'

const NAMESPACES: [string, string][] = [
  ['pid', 'brojevi procesa: proces u kontejneru je PID 1'],
  ['net', 'mrežna sučelja, adrese, portovi i pravila vatrozida'],
  ['mnt', 'montirani datotečni sustavi – što je „/” (izvršno okruženje u njemu korijen zamijeni datotekama slike, naredbom pivot_root)'],
  ['uts', 'ime računala (hostname)'],
  ['ipc', 'zajednička memorija i jezgrini redovi poruka između procesa (System V/POSIX – ne RabbitMQ)'],
  ['user', 'brojevi korisnika: root unutra može biti obični korisnik vani'],
  ['cgroup', 'koji dio stabla kontrolnih grupa proces vidi'],
  ['time', 'vlastiti pomak satova koji mjere vrijeme od pokretanja'],
]

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook / incident */}
      <Section id="incident" kicker="priča" title="Kod mene radi, na poslužitelju ne" lead="Ivin prvi dan u timu: API na njezinu laptopu radi, a na poslužitelju-2 ne želi ni krenuti.">
        <IncidentCard
          no={7}
          when="ponedjeljak, 09:40"
          title={
            <>
              <code>klopa-api</code> radi na Ivinu laptopu, a na poslužitelju-2 ne kreće
            </>
          }
          who="iva"
          says={['Kod mene', 'radi…', 'tamo ne!']}
          preset="VM za svaku aplikaciju (12)"
          seed={7}
          metrics={[
            { label: 'API na poslužitelju-2', value: 'ne kreće', tone: 'bad' },
            { label: 'VM-ova stalo na 16 GB', value: '10 / 12', tone: 'bad' },
            { label: 'RAM zauzet', value: '15,2 GB', tone: 'warn' },
          ]}
        >
          Na laptopu Iva ima najnoviji Python i noviju biblioteku <code>libvips</code>, a na poslužitelju je sve staro dvije godine. Davor predlaže jedan poslužitelj od 16 GB sa šest Klopinih aplikacija, svakom u dvije kopije i svakom u
          svojem virtualnom stroju – ali na njega stane tek 10 od 12 VM-ova.
        </IncidentCard>
        <p>
          Klopa danas ima šest vrsta procesa – klopa-web, klopa-api, klopa-worker, Postgres, Redis i RabbitMQ – na tri poslužitelja (Mali, Srednji i Veliki) koje je tim složio ručno, naredbu po naredbu. Iva je prvi dan pokrenula API na
          svojem laptopu i sve je radilo. Na poslužitelju-2 (to je Srednji) API ne kreće.
        </p>
        <p>
          Kod je isti. Razlikuje se <strong>okruženje</strong>: sve što program treba oko sebe – verzija Pythona, sistemske biblioteke, postavke operacijskog sustava. Klopa fotografije jela obrađuje bibliotekom <code>libvips</code>, a nju instalira
          operacijski sustav. klopa-api treba noviju verziju, a potrošač klopa-worker provjeren je i zaključan na staru: s novom fotografije izlaze drukčije. Probajte sami: koju verziju instalirati na poslužitelj-2?
        </p>
        <LibConflict />
        <MarginNote>pahuljica = poslužitelj koji nitko ne zna ponoviti</MarginNote>
        <p>
          A tu je i treći problem: poslužitelj-2 netko je prije godinu dana konfigurirao ručno, pa se razlikuje od poslužitelja-1. Takve poslužitelje zovemo pahuljicama (engl. <em>snowflake servers</em>): svaki je malo drukčiji i nitko ga više ne
          zna složiti ispočetka.
        </p>
        <p>
          <strong>Kako svakoj aplikaciji dati njezino okruženje, a da ne kupimo računalo za svaku?</strong>
        </p>
      </Section>

      {/* 2 ─ Three eras, then the layers under the app */}
      <Section
        id="slojevi"
        kicker="koncept"
        title="Od fizičkog poslužitelja do kontejnera"
        lead="Dokumentacija Kubernetesa tu priču počinje od fizičkih poslužitelja, preko virtualnih strojeva, do kontejnera – a razlika se vidi tek u slojevima ispod aplikacije."
      >
        <p>
          Najjednostavnije rješenje svakoj aplikaciji daje cijelo računalo. Ostala dva jedno računalo dijele – a razlikuju se po tome <em>što</em> dijele. <Term id="virtual-machine">Virtualni stroj</Term> (engl. <em>virtual machine</em>, VM)
          dijeli samo hardver: <Term id="hypervisor">hipervizor</Term> fizičko računalo reže na nekoliko virtualnih, a u svakom radi cijeli operacijski sustav. <Term id="container">Kontejner</Term> dijeli i jezgru operacijskog sustava domaćina, a biblioteke i ostale datoteke nosi svoje.
        </p>
        <ErasStepper />
        <p>Prvi način rješava sukobe, ali je skup. Za druga dva moramo pogledati što je točno ispod aplikacije.</p>
        <p>
          Svaki program stoji na nekoliko slojeva. Najniže je hardver. Iznad njega je <Term id="kernel">jezgra operacijskog sustava</Term> (engl. <em>kernel</em>) – dio OS-a koji upravlja procesima, memorijom i uređajima. Program od jezgre traži
          sve: „otvori datoteku”, „pošalji paket”, „daj mi još memorije”. Takav zahtjev zove se sistemski poziv (engl. <em>system call</em>).
        </p>
        <MarginNote tone="red">jezgra ≠ procesorska jezgra!</MarginNote>
        <p>
          Između jezgre i programa su biblioteke, npr. <code>libvips</code> i sam Python. Upravo tu je Ivin problem: biblioteke dolaze s operacijskim sustavom, a operacijski sustav na poslužitelju je jedan.
        </p>
        <StackMorph />
        <p>
          Kod virtualnog stroja hipervizor glumi hardver: svaki VM misli da je zasebno računalo i u njemu se diže cijeli operacijski sustav, s vlastitom jezgrom. Kod kontejnera nema glumljenog hardvera ni druge jezgre. Kontejner je program koji
          radi izravno na jezgri <Term id="host">domaćina</Term> (engl. <em>host</em>), ali sa svojim datotekama – svojim bibliotekama i svojim Pythonom.
        </p>
        <p>
          <Term id="container-runtime">Izvršno okruženje za kontejnere</Term> (npr. <code>containerd</code> i <code>runc</code>) nije sloj kroz koji prolaze pozivi. Ono kontejner pripremi, pokrene i prati, a aplikacija zatim jezgru zove izravno, kao
          svaki drugi program.
        </p>
        <Analogy
          title="Analogija: kuća i stan"
          breaksDown="zidovi među stanovima su čvrsti, a izolacija kontejnera slabija je od izolacije VM-a: greška u jezgri prolazi kroz sve „stanove” odjednom. Stan ima svoje instalacije – kontejner nema ni svoju jezgru. I u stanu se živi godinama, a kontejner se baca i pokreće novi."
        >
          Virtualni stroj je kuća: vlastiti temelji, vlastite instalacije, vlastiti krov. Kontejner je stan u zgradi: svoja vrata i svoj namještaj, ali temelji i instalacije – jezgra – zajednički su.
        </Analogy>
        <Compare
          left={{
            title: 'Virtualni stroj',
            tone: 'blue',
            points: ['Vlastiti OS i vlastita jezgra.', 'Granica je hipervizor – jaka izolacija.', 'Memorija: i cijeli OS gosta (često 0,5–2 GB i više).', 'Pokretanje kao pravo računalo: sekunde do minute.'],
          }}
          right={{
            title: 'Kontejner',
            tone: 'green',
            points: ['Proces na jezgri domaćina, sa svojim datotekama.', 'Granica su imenski prostori i kontrolne grupe – slabija izolacija.', 'Memorija: samo ono što troši aplikacija.', 'Pokretanje: priprema (djelić sekunde) + sam program – ukupno djelić sekunde do nekoliko sekundi.'],
          }}
        />
      </Section>

      {/* 4 ─ A container is a process */}
      <Section id="proces" kicker="isprobajte" title="Kontejner je samo proces" lead="Ako kontejner nema svoju jezgru, što onda jest? Pogledajmo ga s obje strane.">
        <Predict
          question={
            <>
              Na poslužitelju-2 pokrenemo API u kontejneru, a zatim na samom poslužitelju (domaćinu) naredbom <code>ps</code> ispišemo sve procese. Što ćemo vidjeti?
            </>
          }
          options={[
            'Ništa – kontejner je zasebno računalo, domaćin ne vidi njegove procese.',
            'Jedan proces docker koji u sebi skriva cijeli kontejner.',
            'Procese aplikacije (gunicorn), kao i svaki drugi program – samo s drugim brojevima.',
            'Cijeli operacijski sustav kontejnera: init, sshd i gunicorn.',
          ]}
          correct={2}
          explain="Kontejner je proces domaćina. Domaćin vidi gunicorn kao svaki drugi proces, s PID-om 48213. Iznutra isti taj proces misli da je PID 1 – jer gleda kroz naočale koje mu je stavila jezgra. U kontejneru nema ni inita ni sshd-a: samo ono što ste pokrenuli."
          then="Provjerite u terminalu ispod: prebacite pogled s kontejnera na domaćina."
        />
        <ProcessView />
        <MarginNote>PID 1 iznutra, 48213 izvana – isti proces</MarginNote>
        <p>
          Isti proces, dva pogleda. Iznutra je gunicorn PID 1, ima svoje ime računala i svoj <code>/etc/os-release</code> iz <Term id="container-image">slike kontejnera</Term> (engl. <em>image</em>) – paketa datoteka iz kojeg je pokrenut: noviji
          Ubuntu nego na domaćinu. Izvana je PID 48213, dijete procesa <code>containerd-shim-runc-v2</code>. A{' '}
          <code>uname -r</code> u oba pogleda ispisuje istu jezgru – jer jezgra i jest samo jedna.
        </p>
        <KeyIdea>
          Kontejner nije malo računalo. Kontejner je <strong>običan proces na jezgri domaćina</strong> kojemu je jezgra stavila <strong>naočale</strong> (imenski prostori: što vidi) i <strong>pojas</strong> (kontrolne grupe: koliko smije
          potrošiti).
        </KeyIdea>
      </Section>

      {/* 5 ─ Namespaces and cgroups */}
      <Section id="naocale" kicker="koncept" title="Naočale i pojas" lead="Dva mehanizma jezgre Linuxa pretvaraju običan proces u kontejner.">
        <MarginNote>naočale = što vidi · pojas = koliko troši</MarginNote>
        <p>
          Naočale su <Term id="linux-namespace">imenski prostori</Term> (engl. <em>namespaces</em>). Svaki procesu daje vlastiti pogled na jedan dio sustava: na procese, na mrežu, na datoteke. Stavite procesu gunicorn naočale jedne po jedne:
        </p>
        <Lenses />
        <DeepDive title="Svih osam imenskih prostora">
          <p>Jezgra Linuxa ima osam vrsta imenskih prostora. Docker zadano uključuje pid, net, mnt, uts, ipc i cgroup; korisnički (user) samo ako ga uključite.</p>
          <ul className={styles.nsList}>
            {NAMESPACES.map(([id, what]) => (
              <li key={id}>
                <code>{id}</code> – {what}
              </li>
            ))}
          </ul>
          <p>
            Uz naočale i pojas Docker procesu oduzima i dio ovlasti roota (engl. <em>capabilities</em>) i filtrira sistemske pozive (seccomp) – i to su pravila koja provodi ista jezgra. Ne miješajte imenske prostore s
            Kubernetesovim objektom Namespace: on samo grupira objekte u klasteru i nema veze s ovim naočalama. Imenske prostore možete isprobati i bez Dockera – pogledajte zatvoreni list u odjeljku s kodom.
          </p>
        </DeepDive>
        <p>
          Pojas su <Term id="cgroup">kontrolne grupe</Term> (engl. <em>control groups</em>, cgroups). One ne mijenjaju što proces vidi, nego koliko smije potrošiti: memorije, procesora, čitanja i pisanja na disk (I/O) i broja procesa. Postavljaju se upisom u obične
          datoteke, npr. <code>memory.max</code> i <code>cpu.max</code>.
        </p>
        <p>Pogledajmo najprije memoriju, na poslužitelju Mali (2 GB). Na njemu rade Postgres i klopa-api – a API curi.</p>
        <BeltMemory />
        <p>
          Bez pojasa jezgra ne zna tko je kriv. Kad memorija nestane, <Term id="oom-killer">OOM killer</Term> (engl. <em>out of memory</em>) ubije proces s najviše bodova – a bodovi uglavnom znače „najviše memorije”. Ovdje je to Postgres. S pojasom
          vrijedi drugo pravilo: kad kontrolna grupa dosegne <code>memory.max</code>, jezgra prvo pokuša osloboditi memoriju unutar nje; ako ne uspije, OOM killer žrtvu bira samo unutar te grupe – susjedi ništa ne osjete.
        </p>
        <p>S procesorom je drukčije. Procesor se ne može „potrošiti” kao memorija – na njega se može samo čekati. Zato prekoračenje <code>cpu.max</code> nikoga ne ubija, nego usporava:</p>
        <BeltCpu />
        <Analogy
          title="Analogija: naočale i pojas"
          breaksDown="naočale i pojas ne nosi proces sam – stavlja mu ih jezgra, i proces ih ne može skinuti. A pojas za procesor ne steže do pucanja: samo usporava."
        >
          Imenski prostori su naočale: kroz njih proces vidi samo svoj dio kuhinje. Kontrolne grupe su pojas: koliko god jeo, više od toga ne stane.
        </Analogy>
        <Callout kind="tip" title="Vratit ćemo se ovome">
          U Kubernetesu se ista pravila pišu kao <code>limits</code> (gornja granica): kontejner koji prijeđe memorijsku granicu završi kao OOMKilled, a onaj koji prijeđe procesorsku – samo se uspori. Vidjet ćemo to kod resursa i raspoređivanja.
        </Callout>
        <DeepDive title="Dvije verzije kontrolnih grupa">
          <Callout kind="fact" title="cgroup v1 odlazi">
            Datoteke <code>memory.max</code> i <code>cpu.max</code> pripadaju kontrolnim grupama verzije 2 (cgroup v2). Od Kubernetesa 1.35 <code>kubelet</code> zadano ne kreće na čvoru sa starim cgroup v1; Docker Engine 29 označio je v1
            kao zastarjeli, a Podman 6.0 ga je izbacio. (stanje: listopad 2026.)
          </Callout>
        </DeepDive>
      </Section>

      {/* 6 ─ The price of isolation */}
      <Section id="izolacija" kicker="koncept" title="Cijena izolacije" lead="Kontejner je lagan jer dijeli jezgru. Upravo zato je i slabije izoliran od virtualnog stroja." prop="lock">
        <p>Imenski prostori i kontrolne grupe su pravila – a provodi ih jezgra. Što ako napadač nađe grešku u samoj jezgri?</p>
        <IsolationStepper />
        <p>
          Zato se kontejneri korisnika koji jedni drugima ne vjeruju (npr. različitih kupaca kod pružatelja oblaka) ne stavljaju na istu jezgru bez dodatne zaštite. Između običnog kontejnera i punog VM-a postoji cijeli spektar.
        </p>
        <DeepDive title="Spektar izolacije: od kontejnera do VM-a">
          <IsolationSpectrum />
          <Callout kind="fact" title="Korisnički imenski prostori u Kubernetesu">
            <Term id="user-namespace">Korisnički imenski prostori</Term> za Podove stabilni su (GA) od Kubernetesa 1.36, ali nisu zadani: uključuju se po Podu poljem <code>hostUsers: false</code>. Tada je root u kontejneru na čvoru
            neprivilegirani korisnik. Jezgra je i dalje zajednička, pa napad na nju i dalje prolazi. (stanje: listopad 2026.)
          </Callout>
        </DeepDive>
      </Section>

      {/* 7 ─ Flagship simulation */}
      <Section id="simulacija" kicker="simulacija" title="Slagač stoga" lead="Jedan poslužitelj od 16 GB, Klopinih 12 aplikacija i tri pitanja: koliko stane, koliko brzo kreće i dokle dopire kvar.">
        <Predict
          question="U VM-ovima je na 16 GB stalo samo 10 od 12 Klopinih aplikacija (zauzeto 15,2 GB). Koliko će memorije zauzeti svih 12 aplikacija u kontejnerima?"
          options={['Oko 18 GB – ne stanu ni u kontejnerima.', 'Oko 15 GB – isto kao VM-ovi.', 'Oko 12 GB.', 'Oko 6 GB.']}
          correct={3}
          explain="Svih 12 aplikacija troši 4,7 GB; uz OS domaćina (1 GB) i izvršno okruženje (0,2 GB) to je 5,9 GB. U VM-ovima najviše memorije nisu jele aplikacije, nego OS-ovi gostiju – po 1 GB za svaki VM."
        />
        <p>
          Simulacija počinje ondje gdje je Davor stao: svaka aplikacija u svojem VM-u. Gumbi dodaju aplikacije, a „Pokreni sve” ih pokreće istodobno – to je utrka. Pod „Odabrana aplikacija” uključujete pojas <code>memory.max</code>, puštate curenje
          memorije i napadate jezgru. Prekidač „U oblaku” stavlja kontejnere u dva VM-a – zašto se to radi, vidjet ćemo odmah nakon simulacije.
        </p>
        <StackSim />
        <DeepDive title="Što je u simulaciji stvarno, a što pojednostavljeno">
          <ul>
            <li>
              <strong>Stvarno:</strong> VM rezervira memoriju i za cijeli OS gosta, a kontejner troši samo ono što troši njegov proces. Napad na jezgru prolazi kroz sve kontejnere na istoj jezgri, a VM ga zaustavlja na hipervizoru.
            </li>
            <li>
              <strong>Ilustrativno:</strong> memorija aplikacija i OS-a gosta (≈ 1 GB; stvarno 0,5–2 GB i više) te rasponi pokretanja – VM: firmware 1–3 s, jezgra 1–3 s, init 2–10 s, program 0,3–2,5 s; kontejner: priprema izvršnog okruženja (≈ 0,1–0,5 s, ovdje
              zanemarena) + program. Vremena su nasumična unutar raspona (seed 7). U oblaku se uz to čeka i da pružatelj dodijeli stroj.
            </li>
            <li>
              <strong>Pojednostavljeno:</strong> VM-ovi u simulaciji rezerviraju svu memoriju unaprijed; hipervizori mogu memoriju i prekomjerno dodijeliti (engl. <em>overcommit</em>), uz rizik da je ponestane svima odjednom. OOM killer u simulaciji
              boduje samo memoriju; stvarna jezgra uzima u obzir i postavku <code>oom_score_adj</code>. Dvije kopije Postgresa, Redisa i RabbitMQ-a ovdje služe samo za račun memorije; dvije baze same od sebe nisu
              rezerva jedna drugoj – za to treba replikacija.
            </li>
            <li>
              <strong>Ubrzano vrijeme:</strong> curenje od 20 MB/s na domaćinu s 10 GB slobodne memorije traje oko osam minuta. Gumb „Premotaj” preskače čekanje, a preskočeno vrijeme zapisuje u dnevnik. Primjer „Kontejneri, pun domaćin”
              ima samo 6,5 GB, pa memorija nestane za pola minute.
            </li>
          </ul>
        </DeepDive>
        <Callout kind="tip" title="Što ste upravo vidjeli">
          <ul>
            <li>Memorija: 12 OS-ova gostiju pojede više od samih aplikacija; u kontejnerima istih 12 aplikacija stane u 5,9 GB.</li>
            <li>Pokretanje: VM se diže kao računalo (4–19 s), kontejner pokreće samo program (djelić sekunde do 2–3 s).</li>
            <li>
              Curenje: s pojasom <code>memory.max</code> pada samo krivac; bez njega OOM killer bira po bodovima – na punom domaćinu susjeda (Postgres).
            </li>
            <li>Napad na jezgru: u kontejnerima pogodi sve, u VM-ovima stane na hipervizoru, a u oblaku na granici jednog VM-a.</li>
          </ul>
        </Callout>
      </Section>

      {/* 8 ─ Containers inside VMs */}
      <Section id="oblak" kicker="koncept" title="Kontejneri u VM-ovima" lead="Na pitanje „VM ili kontejner?” praksa najčešće odgovara: oboje.">
        <p>
          Računalo na kojem Kubernetes pokreće kontejnere zove se <Term id="node">čvor</Term> (engl. <em>node</em>) – više o njemu u 10. predavanju. Ovdje nam je važno samo to što čvor u oblaku najčešće jest.
        </p>
        <CloudStepper />
        <p>
          Kad Klopa jednom ode u oblak, njezini kontejneri radit će u VM-ovima koje zakupi – kao u trećem načinu simulacije. VM je granica prema drugim korisnicima istog fizičkog računala, a kontejneri unutra daju gustoću i brzinu.
        </p>
        <p>
          Isto vrijedi i za Lanin Mac: Linux kontejner je Linux proces, pa mu treba jezgra Linuxa. Docker Desktop zato na macOS-u (i na Windowsu) tiho pokreće Linux VM. Zato <code>uname -r</code> u kontejneru na Macu ne ispisuje jezgru macOS-a,
          nego jezgru tog VM-a.
        </p>
        <p>
          Ostaje procesor. Slika kontejnera nosi prevedene programe, a oni su prevedeni za jednu <Term id="cpu-architecture">arhitekturu procesora</Term>: amd64 (Intel, AMD) ili arm64 (Apple silicon, mnogi poslužitelji u oblaku). Na crtežu je slika
          za amd64 na procesoru arm64. Klopi se dogodilo obrnuto: Lana je za probu, napamet, složila sliku na Macu (arm64) i pokrenula je na poslužitelju-2 (amd64):
        </p>
        <div className={styles.termGuard}>
        <Terminal
          title="davor@posluzitelj-2"
          lines={[
            { comment: 'Lanina probna slika, složena na Macu (arm64); poslužitelj-2 ima procesor amd64' },
            { cmd: 'docker run --rm registry.klopa.example/klopa-api:1.3.2-lana', prompt: P2 },
            { out: "WARNING: The requested image's platform (linux/arm64/v8)", tone: 'warn' },
            { out: 'does not match the detected host platform (linux/amd64)', tone: 'warn' },
            { out: 'exec /app/.venv/bin/gunicorn: exec format error', tone: 'bad', note: 'Slika je za arm64, a procesor je amd64.', who: 'davor' },
            { cmd: "docker image inspect --format '{{.Os}}/{{.Architecture}}' registry.klopa.example/klopa-api:1.3.2-lana", prompt: P2 },
            { out: 'linux/arm64' },
          ]}
        />
        </div>
        <p>
          Ista greška ide i u drugom smjeru: slika samo za amd64 na čvoru arm64 bez emulacije ne može se pokrenuti. A Lanina slika mogla je zapeti i ranije: s današnjim zadanim postavkama Docker Desktopa slika se često pošalje kao popis
          inačica – tada Docker na poslužitelju-2 staje već pri povlačenju porukom <code>no matching manifest for linux/amd64</code>; <code>exec format error</code> vidite kad je slika poslana kao jedna jedina inačica.
        </p>
        <p>
          Slika se može izgraditi za više arhitektura odjednom: naredbi <code>docker buildx build</code> dodamo opciju <code>--platform</code> s popisom <code>linux/amd64,linux/arm64</code>. Registar tada pod istim imenom čuva inačicu za svaki procesor, a Docker povuče onu koja odgovara računalu.
        </p>
        <Callout kind="fact" title="Docker Desktop na Macu">
          Docker Desktop na macOS-u kontejnere pokreće u Linux VM-u; zadano koristi Appleov Virtualization framework, a Docker VMM je druga mogućnost. Slike za amd64 na Apple siliconu rade uz emulaciju – sporije, a ponekad i s greškama. (stanje:
          listopad 2026.)
        </Callout>
      </Section>

      {/* 9 ─ Code */}
      <Section id="kod" kicker="terminal" title="Kontejner na domaćinu, naredbu po naredbu" lead="Sve što ste vidjeli u animacijama Davor može provjeriti u terminalu poslužitelja-2.">
        <p>
          Lana je probnu sliku u međuvremenu ponovno složila za obje arhitekture. Pokrenimo API u kontejneru s pojasom: najviše 512 MB memorije i pola procesora. Zatim ga potražimo na domaćinu kao običan proces – i pročitajmo njegov pojas iz datoteka kontrolne grupe.
        </p>
        <div className={styles.termGuard}>
        <Terminal
          title="davor@posluzitelj-2"
          lines={[
            { comment: 'slika ponovno izgrađena za linux/amd64 i linux/arm64; najviše 512 MB memorije i pola procesora' },
            { cmd: 'docker run -d --name klopa-api --memory 512m --cpus 0.5 -p 8000:8000 registry.klopa.example/klopa-api:1.3.2', prompt: P2 },
            { out: '3f9c2a7d1b8e5c0a9d4f6e2b7a1c8d3e5f9a0b2c4d6e8f1a3b5c7d9e0f2a4b6c', tone: 'muted' },
            { comment: 'Na domaćinu je gunicorn običan proces' },
            { cmd: 'ps -o pid,ppid,rss,comm -C gunicorn', prompt: P2 },
            { out: '    PID    PPID   RSS COMMAND\n  48213   48190 41240 gunicorn\n  48240   48213 72312 gunicorn\n  48241   48213 71876 gunicorn', note: 'PID 48213 – a u kontejneru je to PID 1.', who: 'davor' },
            { cmd: 'docker exec klopa-api cat /proc/1/comm', prompt: P2 },
            { out: 'gunicorn' },
            { comment: 'Pojas su obične datoteke kontrolne grupe (cgroup v2)' },
            { cmd: 'cat /sys/fs/cgroup/system.slice/docker-3f9c2a7d1b8e*.scope/memory.max', prompt: P2 },
            { out: '536870912' },
            { cmd: 'cat /sys/fs/cgroup/system.slice/docker-3f9c2a7d1b8e*.scope/cpu.max', prompt: P2 },
            { out: '50000 100000' },
            { comment: '512 MiB = 536 870 912 bajtova; pola procesora = 50 ms u svakih 100 ms' },
          ]}
        />
        </div>
        <p>Druga provjera: koja jezgra radi u kontejneru? Na Linux poslužitelju to je jezgra domaćina, a na Macu jezgra skrivenog Linux VM-a.</p>
        <div className={styles.termGuard}>
        <Tabs
          tabs={[
            {
              label: 'Linux poslužitelj',
              content: (
                <Terminal
                  title="davor@posluzitelj-2"
                  lines={[
                    { cmd: 'uname -r', prompt: P2 },
                    { out: '6.8.0-85-generic' },
                    { cmd: 'docker exec klopa-api uname -r', prompt: P2 },
                    { out: '6.8.0-85-generic', tone: 'ok', note: 'Ista jezgra: kontejner nema svoju.' },
                    { comment: 'A datoteke su različite: OS iz slike nije OS domaćina' },
                    { cmd: 'grep VERSION_ID /etc/os-release', prompt: P2 },
                    { out: 'VERSION_ID="22.04"' },
                    { cmd: 'docker exec klopa-api grep VERSION_ID /etc/os-release', prompt: P2 },
                    { out: 'VERSION_ID="24.04"' },
                  ]}
                />
              ),
            },
            {
              label: 'Lanin Mac',
              content: (
                <Terminal
                  title="lana@macbook"
                  lines={[
                    { cmd: 'uname -sr', prompt: MAC },
                    { out: 'Darwin 25.0.0' },
                    { cmd: 'docker run --rm ubuntu:24.04 uname -sr', prompt: MAC },
                    { out: 'Linux 6.12.5-linuxkit', tone: 'ok', note: 'Jezgra skrivenog Linux VM-a, a ne macOS-a.' },
                  ]}
                />
              ),
            },
          ]}
        />
        </div>
        <p>Za znatiželjne: kontejner možete složiti i bez Dockera – samo naredbom za imenske prostore i datotekama kontrolne grupe. To radi samo na Linuxu (na Macu unutar Linux VM-a).</p>
        <CodeBlock
          title="kontejner-od-nule.sh"
          lang="bash"
          mode="closed"
          code={fromScratch}
          caption="Naočale i pojas ručno: imenski prostori naredbom unshare, kontrolna grupa upisom u datoteke."
          notes={[
            { lines: '10', text: 'nova ljuska u novim imenskim prostorima pid, mnt, uts i net' },
            { lines: '13-15', text: 'unutra: svoje ime računala, PID 1, samo lo' },
            { lines: '19-22', text: 'pojas: memory.max, cpu.max i ljuska ulazi u grupu' },
          ]}
        />
      </Section>

      {/* 10 ─ Misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            { statement: 'Kontejner je lagani virtualni stroj.', fact: false, explain: (
                <>
                  Kontejner je izolirani proces domaćina bez vlastite jezgre: vidi se u ispisu naredbe <code>ps</code> na domaćinu, a <code>uname -r</code> u kontejneru ispisuje jezgru domaćina.
                </>
              ),
            },
            { statement: 'Kontejneri izoliraju jednako kao VM-ovi.', fact: false, explain: 'Kontejneri dijele jezgru domaćina: greška u jezgri prolazi kroz sve, a kod virtualnih strojeva staje na hipervizoru.' },
            { statement: 'Dva kontejnera na istom domaćinu dijele jezgru operacijskog sustava.', fact: true, explain: 'Istina. Zato je kontejner lagan i brz – i zato je njegova izolacija slabija od izolacije VM-a.' },
            { statement: 'Kontejneri su zamijenili VM-ove.', fact: false, explain: 'U oblaku su čvorovi obično virtualni strojevi u kojima rade kontejneri. Koristimo oboje.' },
            { statement: 'Docker na Macu radi nativno.', fact: false, explain: 'Docker Desktop Linux kontejnere pokreće u skrivenom Linux VM-u, jer im treba jezgra Linuxa.' },
            { statement: 'Svaka slika radi svugdje.', fact: false, explain: 'Svaka inačica slike izgrađena je za jedan operacijski sustav (obično Linux) i jednu arhitekturu procesora. Slika s više inačica pokriva više procesora; za ostale treba emulacija.' },
          ]}
        />
      </Section>

      {/* 11 ─ Recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Virtualni stroj glumi cijelo računalo: vlastiti OS i vlastita jezgra na hipervizoru. Izolacija je jaka, ali svaki VM plaća OS gosta u memoriji i diže se kao računalo.',
            'Kontejner je proces na jezgri domaćina sa svojim datotekama: imenski prostori određuju što vidi, a kontrolne grupe koliko smije potrošiti.',
            <>
              Kad kontejner dosegne <code>memory.max</code>, jezgra ubija samo njega (OOMKilled); prekoračenje <code>cpu.max</code> samo usporava. Bez ograničenja žrtvu bira OOM killer domaćina – i to može biti susjed.
            </>,
            'Zajednička jezgra cijena je gustoće i brzine: greška u jezgri prolazi kroz sve kontejnere, a VM je zaustavlja na hipervizoru. U oblaku zato obično imamo oboje.',
            'Linux kontejner treba jezgru Linuxa (na Macu skriveni VM) i sliku za pravu arhitekturu procesora (amd64 ili arm64).',
          ]}
        />
        <p>Klopa na kraju ovog predavanja: isti poslužitelji – Mali, Srednji i Veliki – ali dijelovi aplikacije sada rade u kontejnerima.</p>
        <StoryMap at="07" />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Davor na poslužitelju-2 upiše <code>ps</code> i vidi proces <code>gunicorn</code> s PID-om 48213. Iva u kontejneru klopa-api vidi <code>gunicorn</code> s PID-om 1. Što je istina?
                </>
              ),
              options: [
                'To su dva različita procesa: jedan u kontejneru, drugi na domaćinu.',
                'To je isti proces; imenski prostor PID-ova daje mu iznutra drugi broj.',
                'Kontejner ima vlastitu jezgru, pa zato i vlastito brojanje procesa.',
                'PID 48213 je proces docker koji glumi gunicorn.',
              ],
              correct: 1,
              explain:
                'Kontejner je proces domaćina. Jezgra je jedna, a imenski prostor PID-ova procesu daje vlastito brojanje: iznutra je PID 1, izvana 48213. Da kontejner ima vlastitu jezgru, domaćin ga uopće ne bi vidio kao proces.',
            },
            {
              q: (
                <>
                  Kontejner klopa-worker ima <code>memory.max</code> od 512 MB, a zbog greške troši sve više memorije. Što se dogodi kad dosegne 512 MB?
                </>
              ),
              options: [
                'Jezgra ga uspori, kao kod procesora.',
                'Jezgra ubije proces u tom kontejneru (OOMKilled); susjedi rade dalje.',
                'OOM killer domaćina ubije proces s najviše memorije na poslužitelju.',
                <>
                  Ništa – <code>memory.max</code> je samo preporuka.
                </>,
              ],
              correct: 1,
              explain: (
                <>
                  Memorija se ne može „usporiti”: kad kontrolna grupa dosegne <code>memory.max</code>, jezgra pokuša osloboditi memoriju, a ako ne uspije, ubije proces iz te grupe (izlazni kod 137). Usporava se procesor (<code>cpu.max</code>). Bez pojasa bi odlučivao OOM killer domaćina –
                  i mogao bi pogoditi susjeda.
                </>
              ),
            },
            {
              q: 'Na poslužitelju od 16 GB (OS domaćina 1 GB) želite pokrenuti 6 aplikacija od po 500 MB. Koliko memorije treba ako je svaka u svojem VM-u (OS gosta ≈ 1 GB), a koliko u kontejnerima (izvršno okruženje 0,2 GB)?',
              options: ['VM-ovi ≈ 10 GB, kontejneri ≈ 4,2 GB', 'VM-ovi ≈ 4 GB, kontejneri ≈ 4 GB', 'VM-ovi ≈ 7 GB, kontejneri ≈ 3 GB', 'VM-ovi ≈ 16 GB, kontejneri ≈ 6 GB'],
              correct: 0,
              explain:
                'VM-ovi: 1 GB (domaćin) + 6 × (1 GB OS gosta + 0,5 GB) = 10 GB. Kontejneri: 1 GB + 0,2 GB + 6 × 0,5 GB = 4,2 GB. Razliku čini šest OS-ova gostiju. Brojke su ilustrativne, ali omjer je stvaran.',
            },
            {
              q: 'Klopa bi na isti poslužitelj pustila i studentske projekte kojima ne vjeruje. Što najbolje štiti Klopine podatke ako netko od njih nađe grešku u jezgri?',
              options: [
                'Svaki projekt u svoj kontejner s korisničkim imenskim prostorom.',
                <>
                  Svaki projekt u svoj kontejner s <code>memory.max</code> i <code>cpu.max</code>.
                </>,
                'Svaki projekt u svoj VM (ili mikro-VM) – granica je hipervizor.',
                'Zasebni imenski prostori pid, net i mnt za svaki projekt.',
              ],
              correct: 2,
              explain:
                'Greška u jezgri prolazi kroz sve kontejnere na toj jezgri – imenski prostori i kontrolne grupe pravila su koja provodi upravo ta jezgra. Korisnički imenski prostor smanjuje štetu kod bijega kroz pogrešnu konfiguraciju, ali napad na jezgru ne zaustavlja. Vlastita jezgra po projektu (VM ili mikro-VM) granicu stavlja na hipervizor.',
            },
            {
              q: (
                <>
                  Lana je na Macu s Apple siliconom složila probnu sliku <code>klopa-api:1.3.2-lana</code>. Na poslužitelju-2 (amd64) kontejner odmah završi porukom <code>exec format error</code>. Zašto?
                </>
              ),
              options: ['Slika je za arm64, a poslužitelj ima procesor amd64.', 'Na poslužitelju nije instaliran Docker Desktop.', 'Slika je prevelika za memoriju poslužitelja.', 'Na poslužitelju je drukčija distribucija Linuxa nego u slici.'],
              correct: 0,
              explain:
                'Programi u slici prevedeni su za procesor na kojem je slika izgrađena (arm64), a procesor amd64 te naredbe ne razumije. Docker Desktop na Macu sliku za drugu arhitekturu pokrene uz emulaciju, ali poslužitelj bez emulacije ne može. Distribucija nije problem – slika nosi svoje datoteke.',
            },
            {
              q: 'Podsjetnik iz prošlog predavanja: zašto potrošač klopa-worker mora biti idempotentan?',
              options: ['Jer RabbitMQ poruke uvijek isporučuje redom.', 'Jer red poruka jamči isporuku barem jednom, pa ista poruka može stići dvaput.', 'Jer bi inače red poruka bio prespor.', 'Jer svi potrošači dijele istu memoriju.'],
              correct: 1,
              explain:
                'Uz trajne redove i potvrde red poruka ne gubi poruke, ali ako potrošač padne nakon obrade, a prije potvrde, poruka se isporuči ponovno. Idempotentan potrošač istu narudžbu (s istim ID-jem) obradi samo jednom – inače teta Mira kuha dvaput.',
            },
          ]}
        />
      </Section>

      {/* 12 ─ Cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <p>
          Sad znamo da je kontejner proces s naočalama i pojasom. Ali kako Klopu – kod, Python, Node za izgradnju weba i sistemske biblioteke – zapakirati tako da se na Ivinu laptopu i na poslužitelju pokrene potpuno isto?
        </p>
        <CostNote
          gained={[
            <>
              klopa-api i klopa-worker imaju svaki svoju verziju biblioteke <code>libvips</code> – na istom poslužitelju.
            </>,
            'Svih 12 aplikacija stane na 16 GB, a kontejner kreće za djelić sekunde do nekoliko sekundi.',
            <>
              <code>memory.max</code> i <code>cpu.max</code> drže kvar jedne aplikacije podalje od susjeda.
            </>,
          ]}
          paid={[
            'Kontejneri dijele jezgru: izolacija je slabija nego kod VM-a.',
            'Slika mora odgovarati procesoru – Lanin Mac (arm64) i poslužitelj (amd64) nisu isti.',
            'Lanina probna slika složena je napamet: recept nije zapisan i nitko je ne zna ponoviti.',
          ]}
          next={
            <>
              U četvrtak: Iva je napisala prvi Dockerfile. Nakon promjene jednog retka koda izgradnja traje 44&nbsp;s, slika ima 1,7&nbsp;GB, a Davor je u njoj našao <code>.env</code> s ključem za SMS-gateway. I <code>latest</code> na poslužitelju nije isti{' '}
              <code>latest</code> kao na Ivinu laptopu. Kako se slika zapravo gradi?
            </>
          }
        />
      </Section>
    </>
  )
}

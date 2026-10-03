import { Analogy, Callout, CodeBlock, CostNote, DeepDive, IncidentCard, KeyIdea, MarginNote, MythOrFact, Predict, Quiz, Recap, Section, StoryMap, Tabs, Term, Terminal } from '../../kit'
import { IntegrationStepper } from './sims/IntegrationStepper'
import { CommitFactory } from './sims/CommitFactory'
import { PromoteStepper } from './sims/PromoteStepper'
import { GateSlider } from './sims/GateSlider'
import { WorkflowDiagram } from './sims/WorkflowDiagram'
import { CredentialStepper } from './sims/CredentialStepper'
import { STORY } from './story'
import { FACTORY_PRESET, FACTORY_SEED } from './factory'
import css from './styles.module.css'
import ciYaml from './code/ci.yaml?raw'
import gitlabYaml from './code/gitlab-ci.yml?raw'
import buildxSh from './code/buildx.sh?raw'
import deployPush from './code/deploy-push.yaml?raw'
import trustPolicy from './code/trust-policy.json?raw'

const F = STORY.fix
/** Long inline code may wrap on phones (inline code is nowrap by default). */
const WRAP = { whiteSpace: 'normal', overflowWrap: 'anywhere' } as const
const L = STORY.lead

export default function Lecture() {
  return (
    <>
      {/* 1 ─ Hook: production runs an image nobody can trace */}
      <Section id="incident" kicker="priča" title="Slika s Davorova laptopa" lead="Ispravak PDV-a 2.0.1 je gotov. Problem je ono što trenutačno radi u produkciji – i način na koji je onamo stiglo.">
        <IncidentCard
          no={21}
          when="ponedjeljak, 09:00"
          title={
            <>
              U produkciji je <code>latest</code> s Davorova laptopa – a nitko ne zna koji je to commit
            </>
          }
          who="lana"
          says={['Koji je to', 'commit?!']}
          metrics={[
            { label: 'tag u produkciji', value: <code>{STORY.laptop.tag}</code>, tone: 'bad' },
            { label: 'commit', value: 'nepoznat', tone: 'bad' },
            { label: 'testova', value: '0', tone: 'bad' },
            { label: 'digest (sha256)', value: <code>{STORY.laptop.digest.slice(7, 14)}…</code>, tone: 'neutral' },
          ]}
          preset={FACTORY_PRESET}
          seed={FACTORY_SEED}
        >
          Nakon što je <code>2.0.0</code> vraćena, Davor je sliku izgradio na svom laptopu, s nespremljenim promjenama, označio je kao <code>latest</code> i preskočio testove „jer se žuri”. Sljedeći tjedan odlazi na Erasmus, a
          ispravak PDV-a <code>2.0.1</code> čeka.
        </IncidentCard>
        <p>
          Lana želi poslati ispravak PDV-a (<code>{F.sha}</code>, „{F.message}”) u produkciju. Prvo mora odgovoriti na jednostavno pitanje: što ondje sada radi? Davorova povijest naredbi iz petka
          u 23:40 pokazuje kako je slika stigla onamo.
        </p>
        <div className={css.termFix}>
        <Terminal
          title="Davorov laptop"
          lines={[
            { cmd: 'git status --short', prompt: '$' },
            { out: ' M klopa/cart/vat.py\n?? hotfix_privremeno.py', tone: 'warn' },
            { cmd: 'docker build -t registry.klopa.example/klopa-api:latest .', prompt: '$' },
            { out: ' => => naming to registry.klopa.example/klopa-api:latest', tone: 'muted' },
            { cmd: 'docker push registry.klopa.example/klopa-api:latest', prompt: '$' },
            { out: 'The push refers to repository [registry.klopa.example/klopa-api]', tone: 'muted' },
            { cmd: 'kubectl set image deployment/klopa-api klopa-api=registry.klopa.example/klopa-api:latest -n klopa', prompt: '$' },
            { out: 'deployment.apps/klopa-api image updated', tone: 'ok', note: 'Testove ću poslije, sad se žuri.', who: 'davor' },
          ]}
        />
        </div>
        <Predict
          question="Lana mora upisati u bilješku o izdanju koji commit sada radi u produkciji. Koji je to?"
          options={[
            'Zadnji commit na grani main',
            <>
              Commit koji na Davorovu laptopu pokazuje <code>git log</code>
            </>,
            'To se ne može znati',
          ]}
          correct={2}
          explain={
            <>
              Slika je izgrađena iz Davorove radne mape, s nespremljenim promjenama u <code>vat.py</code> i datotekom koja nije ni u Gitu. Nijedan commit ne sadrži taj kod, a tag <code>latest</code> ne nosi ni verziju ni commit.
              Iz slike se može doznati samo digest.
            </>
          }
        />
        <p>Četiri naredbe, tri problema:</p>
        <ul>
          <li>
            <strong>Nespremljene promjene.</strong> Slika sadrži <code>vat.py</code> kakav postoji samo na Davorovu disku. Nijedan commit u Gitu ne može je ponovno stvoriti.
          </li>
          <li>
            <strong>Tag <code>latest</code>.</strong> Oznaka se pomiče sa svakim novim pushom. Sutra će „latest” biti nešto drugo, a danas se iz nje ne vidi ni verzija ni commit.
          </li>
          <li>
            <strong>Bez testova.</strong> Nitko ne zna radi li ta slika ispravno. Točno je samo jedno: radila je na Davorovu laptopu.
          </li>
        </ul>
        <p>
          A tu je i najveći rizik: postupak postoji samo u Davorovoj glavi i u povijesti njegove ljuske. Za tjedan dana Davora neće biti. Pitanje ovog predavanja zato glasi: <strong>kako svaku promjenu – počevši od ispravka 2.0.1 –
          automatski provjeriti, zapakirati i pripremiti za produkciju, bez ičijeg laptopa?</strong>
        </p>
      </Section>

      {/* 2 ─ Scene 1: integration hell → continuous integration */}
      <Section id="integracija" kicker="koncept" title="Pakao integracije" lead="Prvi dio odgovora nije alat nego navika: spajati malo i često.">
        <p>
          Prije nego što išta automatiziramo, pogledajmo kako tim uopće spaja kod. Ako svatko tjednima radi na svojoj grani, problem se ne vidi sve do dana spajanja. Tada se odjednom sudare tri tjedna promjena.
        </p>
        <IntegrationStepper />
        <MarginNote>Fowler: svi u main barem jednom dnevno</MarginNote>
        <p>
          Takva se navika zove <Term id="continuous-integration">kontinuirana integracija</Term> (engl. <em>continuous integration</em>, CI): svi barem jednom dnevno spajaju male promjene u glavnu granu, a svaku integraciju
          automatski provjerava izgradnja s testovima. Niz automatskih koraka koji se pokreće na svaki commit zove se <Term id="pipeline">pipeline</Term>. Poslužitelj koji izvršava pipeline samo je pomoćnik. Ako
          grane i dalje žive tri tjedna, ni najbolji CI poslužitelj ne pomaže.
        </p>
        <p>
          Važno je i što se događa kad pipeline postane crven: <strong>popravak ima prednost pred novim radom.</strong> Crveni main znači da je svaki sljedeći commit izgrađen na pokvarenom kodu. Najbrži
          popravak obično je vratiti zadnju promjenu (<code>git revert</code>), a zatim je na miru popraviti.
        </p>
        <Analogy
          title="Provjera pravopisa i probni ispis pri svakom spremanju"
          who="lana"
          breaksDown="Usporedba zvuči kao alat koji se jednom uključi. CI je prije svega dogovor tima da integrira male promjene često; alat samo provjerava ono što tim spoji."
        >
          Zamislite da vaš uređivač teksta pri svakom spremanju provjeri pravopis i ispiše probnu stranicu. Pogrešku vidite odmah, dok se još sjećate što ste upravo promijenili, a ne tek na kraju
          semestra kad spajate pet poglavlja od pet autora.
        </Analogy>
      </Section>

      {/* 3 ─ Scene 2: the flagship */}
      <Section id="tvornica" kicker="simulacija" title="Tvornica commitova" lead="Pipeline je pokretna traka: svaka stanica nešto provjeri, a prva koja nađe problem zaustavi traku.">
        <p>Klopin pipeline za <code>klopa-api</code> ima devet stanica. Poredane su tako da najjeftinije i najbrže provjere idu prve, da pipeline padne što ranije (engl. <em>fail fast</em>):</p>
        <ul>
          <li>
            <strong>Lint</strong> (automatska provjera stila i očitih grešaka bez pokretanja koda) i <strong>testovi</strong> (pytest i jedinični testovi weba) hvataju greške u kodu za nekoliko minuta.
          </li>
          <li>
            <strong>Izgradnja slike</strong>, <strong>skeniranje</strong> (poznate ranjivosti bazne slike, tajne u kodu) i slanje u <strong>registar</strong>, gdje slika dobiva digest.
          </li>
          <li>
            <strong>Staging</strong> i <strong>e2e testovi</strong> (engl. <em>end-to-end</em>: cijeli put kroz sustav) provjeravaju istu sliku u okruženju nalik produkciji, od narudžbe do kuhinje.
          </li>
          <li>
            <strong>Ljudska vrata</strong> (netko klikne „Odobri izdanje”) i <strong>produkcija</strong>.
          </li>
        </ul>
        <Predict
          question={`Bez čekanja na ljudskim vratima cijeli put u najboljem slučaju traje ${L.sequential} (lint 30 s, testovi 3 min, izgradnja 4 min, skeniranje 1 min, push 20 s, staging 1 min, e2e 4 min, produkcija 1 min). Što ga više skraćuje?`}
          options={[
            'Paralelni poslovi: lint i testovi istodobno – gotovo upola kraće',
            'Predmemorija ovisnosti: testovi 1 min umjesto 3, izgradnja 40 s umjesto 4 min',
            'Oboje jednako',
            'Nijedno – e2e testovi traju najdulje',
          ]}
          correct={1}
          explain={`Paralelno se s testovima preklapa samo lint (30 s): ${L.sequential} postaje ${L.parallel}. Predmemorija skraćuje dvije duge stanice, testove (3 min → 1 min) i izgradnju (4 min → 40 s): ${L.cache}. S oba prekidača: ${L.both}. Ali pazite: predmemorija uključena tek sada još je prazna, pa je prvi commit nakon toga i dalje spor.`}
        />
        <CommitFactory />
        <Callout kind="info" title="Što ste upravo vidjeli">
          <ul>
            <li>
              <strong>Traka staje na prvoj grešci.</strong> „Pada test” se zaustavi na testovima i ništa se ne postavlja. Main postane crven, pa padaju i commitovi poslani nakon njega, dok netko ne napravi{' '}
              <code>git revert</code>.
            </li>
            <li>
              <strong>Skeniranje je vrata, a ne savjet.</strong> Ranjiva bazna slika i ključ u <code>settings.py</code> zaustave se prije registra. Ključ je ipak već u povijesti Gita, pa ga treba opozvati i
              zamijeniti.
            </li>
            <li>
              <strong>
                <Term id="flaky-test">Nestabilan test</Term>
              </strong>{' '}
              se ponavlja, troši minute i polako ruši povjerenje. Tim koji ne vjeruje crvenom pipelineu počne ga ignorirati.
            </li>
            <li>
              <strong>„Preskoči testove”</strong> ubrza put, ali greške stignu u produkciju: stopa neuspjelih promjena raste, a svaki incident košta minute oporavka.
            </li>
            <li>
              <strong>Ljudska vrata</strong> se računaju u vrijeme do produkcije: dok nitko ne klikne, ispravak čeka.
            </li>
          </ul>
        </Callout>
        <DeepDive title="Za znatiželjne: DORA metrike">
          <p>
            Istraživački program <Term id="dora-metrics">DORA</Term> godinama mjeri kako timovi isporučuju softver. Ispod simulacije su četiri klasične metrike: <strong>učestalost postavljanja</strong>,{' '}
            <strong>vrijeme od commita do produkcije</strong> (engl. <em>lead time for changes</em>), <strong>stopa neuspjelih promjena</strong> i <strong>vrijeme oporavka od neuspjelog postavljanja</strong>{' '}
            (engl. <em>failed deployment recovery time</em>).
          </p>
          <p>
            Od 2024. DORA dodaje i petu, <strong>stopu ponovljenih postavljanja</strong> (engl. <em>deployment rework rate</em>): udio neplaniranih postavljanja zbog incidenta. Učestalost, vrijeme do
            produkcije i oporavak DORA danas svrstava u protok, a stope neuspjelih i ponovljenih postavljanja u nestabilnost (stanje: listopad 2026.). Dobri timovi poboljšavaju oboje istodobno, jer male i
            česte promjene lakše je i provjeriti i vratiti.
          </p>
        </DeepDive>
        <DeepDive title="Što je u simulaciji pojednostavljeno">
          <p>
            Trajanja su ilustrativna (stvarni pipeline ovisi o projektu i strojevima). Postoji samo jedno staging okruženje, pa commitovi čekaju u redu, dok CI strojeva ima neograničeno. Nestabilan test pada u 30 %
            pokušaja, a incident se otkrije 5 minuta nakon lošeg postavljanja. Povratak na prethodnu verziju traje 1 minutu. Vjerodajnica pri curenju pripada jednom poslu, a napadač je pokušava upotrijebiti
            svakih 60 sekundi.
          </p>
        </DeepDive>
      </Section>

      {/* 4 ─ Scene 3: build once, promote the digest */}
      <Section id="artefakt" kicker="slika" title="Izgradite jednom, promovirajte više puta" lead="U produkciju ide točno ona slika koja je prošla testove – a dokaz za to je njezin digest.">
        <p>
          Iz osmog predavanja znate da je <Term id="tag">tag</Term> samo pomična oznaka, a <Term id="digest">digest</Term> sažetak (sha256) sadržaja slike, točnije njezina manifesta. Za pipeline to znači:
          pitanje „je li u produkciji ono što smo testirali?” ima točan odgovor samo ako uspoređujemo digestove.
        </p>
        <PromoteStepper />
        <KeyIdea>
          Pipeline ne isporučuje kod nego <strong>jednu provjerenu sliku</strong>. Izgradite je jednom, zapišite njezin <strong>digest</strong> i baš taj digest promovirajte kroz staging do produkcije.
        </KeyIdea>
        <MarginNote tone="red">:latest u produkciji? Crvena olovka.</MarginNote>
        <p>
          Zato Klopa svaku sliku označava <strong>hashom commita</strong> (<code>klopa-api:{F.sha}</code>), a izdanja i <strong>semantičkom verzijom</strong> (<code>klopa-api:{F.tags[1]}</code>). Oba taga
          pokazuju na isti digest jer nastaju iz iste izgradnje. Tako se iz produkcije uvijek može doći do commita, a od commita do testova koji su prošli. Prelazak iste slike iz okruženja u okruženje
          zove se <Term id="image-promotion">promocija slike</Term>. U <code>ci.yaml</code> tag je puni hash commita (40 znakova); skraćeni je samo kraći zapis istog commita.
        </p>
        <CodeBlock
          title="izgradnja i digest"
          lang="bash"
          code={buildxSh}
          caption="Jedna izgradnja s dva taga; digest se zapiše i dalje se koristi samo on."
          notes={[
            { lines: '3-4', text: 'dva taga, jedna izgradnja, jedan digest' },
            { lines: '8', text: 'digest spremite uz izdanje' },
            { lines: '14', text: 'tag uz digest: vrijedi samo digest' },
          ]}
        />
        <Callout kind="fact" title="Tagovi, digest i imagePullPolicy">
          Ako u Podu ne napišete <code>imagePullPolicy</code>, Kubernetes ga postavi pri stvaranju objekta: za <code>:latest</code> ili sliku bez taga to je <code>Always</code>, a za svaki drugi tag ili
          digest <code>IfNotPresent</code>. Kad su u referenci i tag i digest (<code>klopa-api:2.0.1@sha256:…</code>), koristi se samo digest. Docker Hub, Amazon ECR, Harbor i Google Artifact Registry mogu tagove
          učiniti nepromjenjivima, pa registar odbije pomicanje postojećeg taga.
        </Callout>
      </Section>

      {/* 5 ─ Scene 4: delivery or deployment */}
      <Section id="vrata" kicker="koncept" title="Isporuka ili postavljanje?" lead="Kontinuirana isporuka i kontinuirano postavljanje razlikuju se u jednom koraku: tko pritisne zadnji gumb.">
        <p>Pomaknite vrata. Provjere do registra iste su u sva tri položaja; mijenja se gdje traka stane i tko je ponovno pokreće.</p>
        <GateSlider />
        <p>
          Klopa za sada bira <strong>kontinuiranu isporuku</strong>: svaki zeleni commit spreman je za produkciju, a Petra odlučuje kada će izdanje izaći, recimo ne usred podnevne gužve. Za{' '}
          <strong>kontinuirano postavljanje</strong> trebaju testovi kojima tim potpuno vjeruje i način da se nova mogućnost postavi, a ne uključi odmah (odvajanje postavljanja od izdanja iz 20. predavanja).
        </p>
        <Analogy
          title="Pokretna traka od tvornice do police"
          who="mira"
          breaksDown="Na traci se ništa ne kopira niti ponovno gradi: kroz sve stanice putuje isti digest. Za razliku od robe na polici, prethodna verzija može se brzo vratiti, jer njezin digest i dalje stoji u registru (a često i na čvorovima, pa se ništa ne preuzima)."
        >
          Tvornica pakira jogurte i šalje ih trakom do police. Kod kontinuirane isporuke na kraju trake stoji poslovođa i odlučuje kada otvoriti prolaz do police. Kod kontinuiranog postavljanja prolaz je stalno
          otvoren. U oba slučaja svaki jogurt prije police prolazi istu kontrolu.
        </Analogy>
      </Section>

      {/* 6 ─ Scene 5: pipeline as code */}
      <Section id="kod" kicker="pipeline" title="Pipeline kao kod" lead="Pipeline je datoteka u repozitoriju: verzionira se zajedno s kodom, prolazi pregled i ne ovisi ni o čijem laptopu.">
        <p>
          U GitHub Actionsu pipeline je YAML datoteka u mapi <code>.github/workflows</code>. Pokreću je <strong>događaji</strong> (<code>push</code>, <code>pull_request</code>). Sastoji se od{' '}
          <strong>poslova</strong> (engl. <em>jobs</em>), a posao je niz <strong>koraka</strong>: gotovih akcija ili naredbi ljuske. Svaki posao radi na <strong>runneru</strong>: to je ili svjež virtualni stroj
          koji daje GitHub ili Klopin vlastiti stroj. Poslovi rade <strong>istodobno</strong>, osim ako ih <code>needs</code> ne poreda. GitLab CI pipeline opisuje datotekom <code>.gitlab-ci.yml</code>,{' '}
          ali drukčije: <strong>faze</strong> (engl. <em>stages</em>) idu redom, a poslovi unutar iste faze rade istodobno.
        </p>
        <Tabs
          tabs={[
            {
              label: 'GitHub Actions',
              content: (
                <>
                  <WorkflowDiagram kind="gha" />
                  <CodeBlock
                    title=".github/workflows/ci.yaml"
                    lang="yaml"
                    code={ciYaml}
                    previewLines={12}
                    caption="Lint i testovi istodobno, zatim slika označena hashom commita; OIDC token samo za posao koji šalje u registar."
                    notes={[
                      { lines: '4-7', text: 'događaji: push na main i svaki pull request' },
                      { lines: '21', text: 'akcija prikvačena SHA-om commita, ne tagom' },
                      { lines: '27', text: 'nema needs → radi istodobno s lintom' },
                      { lines: '39', text: 'needs: kreće tek kad lint i test prođu' },
                      { lines: '44', text: 'samo ovaj posao smije tražiti OIDC token' },
                      { lines: '62', text: 'tag = puni hash commita (u tekstu skraćen na 7 znakova), nikad latest' },
                      { lines: '63-64', text: 'predmemorija slojeva između izgradnji' },
                    ]}
                  />
                </>
              ),
            },
            {
              label: 'GitLab CI',
              content: (
                <>
                  <WorkflowDiagram kind="gitlab" />
                  <CodeBlock
                    title=".gitlab-ci.yml"
                    lang="yaml"
                    code={gitlabYaml}
                    previewLines={12}
                    caption="Isti pipeline u fazama: lint i pytest u fazi test, izgradnja tek kad cijela faza prođe."
                    notes={[
                      { lines: '2', text: 'faze idu redom: prvo test, onda build' },
                      { lines: '8,15', text: 'ista faza → lint i pytest istodobno' },
                      { lines: '19-22', text: 'predmemorija vezana uz requirements.txt' },
                      { lines: '37', text: 'lozinka registra vrijedi samo dok posao radi' },
                      { lines: '38', text: 'tag = kratki hash commita' },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
        <Callout kind="fact" title="Verzije u primjerima (stanje: listopad 2026.)">
          Akcije su prikvačene punim SHA-om commita, a komentar uz njih kaže koju verziju taj SHA označava: <code>actions/checkout</code> v7.0.1, <code>actions/setup-python</code> v7.0.0,{' '}
          <code>docker/login-action</code> v4.6.0, <code style={WRAP}>docker/setup-buildx-action</code> v4.4.1, <code style={WRAP}>docker/build-push-action</code> v7.4.0 i <code style={WRAP}>aws-actions/configure-aws-credentials</code> v6.3.0.
          Runner je <code>ubuntu-24.04</code>, a GitLab primjer koristi <code>docker:29</code>. Klopin registar u primjeru za GitHub je Amazon ECR: uz OIDC nema spremljene lozinke, jer <code>login-action</code> od AWS-a dobije privremenu lozinku registra.
        </Callout>
        <DeepDive title="Za znatiželjne: koji digest ispisuje izgradnja?">
          <p>
            Novije izgradnje s BuildKitom (i <code style={WRAP}>build-push-action</code>) uz sliku zadano šalju i atestaciju o podrijetlu (engl. <em>provenance</em>). U registru tada ne nastaje samo manifest slike nego i popis manifesta (indeks) koji pokazuje na nju. Digest indeksa mijenja se svakom
            izgradnjom; digest manifesta slike ostaje isti ako je sadržaj isti (vidi se naredbom <code style={WRAP}>docker buildx imagetools inspect</code>). Za pipeline je važno samo jedno pravilo: dalje se promovira digest
            koji je izgradnja ispisala, bez ponovne izgradnje.
          </p>
        </DeepDive>
      </Section>

      {/* 7 ─ Scene 6: credentials and who pushes into the cluster */}
      <Section id="tajne" kicker="sigurnost" title="Tajne i tko gura u klaster" lead="Pipeline koji postavlja u produkciju mora nekako ući u nju. Čime – i koliko dugo vrijedi taj ključ?">
        <p>
          Davor je u postavke CI-ja spremio <code>PROD_KUBECONFIG</code>, kubeconfig s pravima administratora klastera, i stavio ga u <code>env:</code> na vrhu workflowa. To radi, ali ključ ne istječe, a
          dobiva ga svaki posao (GitHub tajnu inače daje samo poslu koji je izričito zatraži). Ako ga ukrade bilo koji paket u bilo kojem koraku, napadač ga može koristiti dok ga netko ne opozove.
        </p>
        <CredentialStepper />
        <p>
          Bolji put je <Term id="oidc-token">OIDC token</Term> (OIDC = OpenID Connect, standard za potpisane izjave o identitetu). Posao s dopuštenjem <code>id-token: write</code> zatraži od GitHuba potpisanu izjavu o tome tko je (repozitorij, grana, okruženje). Oblak je
          provjeri prema pravilima povjerenja i izda kratkotrajne vjerodajnice za taj posao. Pravilo povjerenja odlučuje tko ih smije dobiti, a prava uloge što se njima smije. Nitko ih ne sprema, ne kopira i ne rotira: istječu same. U AWS-u sesija zadano traje 1 sat, a može se skratiti do 15
          minuta.
        </p>
        <CodeBlock
          title="pravilo povjerenja uloge klopa-ci-push (isječak)"
          lang="json"
          code={trustPolicy}
          mode="preview"
          caption="Oblak vjeruje GitHubovim tokenima, ali samo za repozitorij klopa/klopa-api i granu main."
          notes={[
            { lines: '4', text: 'vjeruj tokenima koje potpiše GitHub' },
            { lines: '10', text: 'samo klopa/klopa-api, grana main' },
          ]}
        />
        <p>
          Ovo pravilo vrijedi za posao koji šalje sliku u registar. Za posao s <code>environment: production</code> GitHub u polje <code>sub</code> upisuje{' '}
          <code style={WRAP}>repo:klopa/klopa-api:environment:production</code>, pa pravilo za takav posao provjerava okruženje, a ne granu.
        </p>
        <Callout kind="warn" title="Tri navike za tajne u pipelineu">
          <ul>
            <li>
              <strong>Nikad ne ispisujte tajne u log</strong> (<code>echo $TOKEN</code>, ispis za otklanjanje grešaka). GitHub prikriva poznate tajne, ali ne i njihove izvedenice, npr. base64.
            </li>
            <li>
              <strong>Akcije prikvačite punim SHA-om commita.</strong> Tag akcije (<code>@v7</code>) njezin autor ili napadač može pomaknuti na drugi kod, a SHA commita ne može se pomaknuti.
            </li>
            <li>
              <strong>Najmanja prava po poslu.</strong> <code>permissions</code> na vrhu daju samo čitanje; tokene dobiva samo posao kojem trebaju.
            </li>
          </ul>
        </Callout>
        <p>
          Ostaje zadnji korak: tko stavlja novi digest u klaster? Najjednostavnije je da pipeline to napravi sam, naredbom <code>kubectl apply</code>. Taj se pristup zove <strong>push model</strong>. Radi i
          često se koristi, ali ima dvije cijene: CI mora imati snažna prava nad klasterom, a ako netko klaster promijeni ručno, nitko to ne primijeti.
        </p>
        <CodeBlock
          title="korak kubectl apply (push model)"
          lang="yaml"
          code={deployPush}
          mode="closed"
          caption="Ovako izgleda push model: radi, ali s trajnim ključem administratora i bez ikoga tko bi uočio ručne promjene. Predavanje 22 pokazuje drugi put."
          notes={[
            { lines: '5', text: 'ljudska vrata: GitHub čeka odobrenje (postavka okruženja)' },
            { lines: '10', text: 'trajni ključ administratora – vrijedi do opoziva' },
            { lines: '19', text: 'promovira se digest, ne nova izgradnja' },
            { lines: '20', text: 'CI gura u klaster; ručne promjene nitko ne vidi' },
          ]}
        />
      </Section>

      {/* 8 ─ Misconceptions */}
      <Section id="zablude" kicker="zablude" title="Što se o CI/CD-u često krivo kaže" lead="Odlučite za svaki papirić je li mit ili istina, pa ga okrenite.">
        <MythOrFact
          items={[
            {
              statement: 'CI/CD je alat.',
              fact: false,
              explain: 'CI/CD je praksa: male promjene, često spojene i automatski provjerene. GitHub Actions ili GitLab CI tu praksu samo automatiziraju.',
            },
            {
              statement: 'CD uvijek znači automatski u produkciju.',
              fact: false,
              explain: 'Kontinuirana isporuka zadržava ljudsku odluku o izdanju; tek kontinuirano postavljanje uklanja tu odluku.',
            },
            {
              statement: (
                <>
                  Tag <code>latest</code> je u redu.
                </>
              ),
              fact: false,
              explain: (
                <>
                  <code>latest</code> se pomiče i ne govori koji je commit u pitanju; uz to zadano postavlja <code>imagePullPolicy</code> na <code>Always</code>. U produkciji: hash commita ili verzija, a u manifestu
                  digest.
                </>
              ),
            },
            {
              statement: 'Trajni ključevi u CI-ju su u redu.',
              fact: false,
              explain:
                'Trajni ključ vrijedi dok ga netko ne opozove. Bolje su kratkotrajne vjerodajnice preko OIDC-a: dobiva ih samo posao iz pravog repozitorija i grane, smiju samo ono što dopušta uloga i istječu same.',
            },
            {
              statement: 'Isti digest u stagingu i u produkciji dokazuje da u produkciji radi testirana slika.',
              fact: true,
              explain:
                'Digest je sažetak sadržaja: isti digest znači isti manifest i iste slojeve, bajt po bajt. Slika je ista; konfiguracija okruženja (ConfigMap, Secret) i dalje se može razlikovati.',
            },
          ]}
        />
      </Section>

      {/* 9 ─ Recap and quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            <>
              <strong>CI je navika:</strong> male promjene barem jednom dnevno u main, svaka automatski izgrađena i testirana. Pipeline staje na prvoj grešci, a crveni main popravlja se prije novog posla.
            </>,
            <>
              <strong>Izgradite jednom, promovirajte digest:</strong> slika s tagom commita (i verzijom za izdanje) kroz staging do produkcije. Ponovna izgradnja je drugi, netestirani artefakt, a <code>latest</code> ne
              pripada produkciji.
            </>,
            <>
              <strong>Isporuka ili postavljanje:</strong> kontinuirana isporuka znači da se može izdati bilo kad, a odluku donosi čovjek. Kontinuirano postavljanje znači da svaka zelena promjena ide sama.
            </>,
            <>
              <strong>OIDC umjesto trajnog ključa:</strong> kratkotrajne vjerodajnice samo za posao koji ih treba. Pravilo povjerenja odlučuje tko ih dobiva, prava uloge što smiju, a istječu same. Trajni ključ
              vrijedi dok ga netko ne opozove.
            </>,
            <>
              <strong>Push model radi, ali:</strong> CI drži ključ klastera, a ručne promjene u klasteru nitko ne vidi.
            </>,
          ]}
        />
        <StoryMap at="21" caption="Klopa sada ima CI i registar: kod ide iz Gita kroz pipeline do provjerene slike." />
        <Quiz
          questions={[
            {
              q: 'Dijagnoza: tijekom dana netko je uključio „Preskoči testove”. Pipeline je brži, a u produkciji se pojavila greška u obračunu PDV-a. Koja se DORA metrika sigurno pogoršala?',
              options: ['Učestalost postavljanja', 'Stopa neuspjelih promjena', 'Vrijeme od commita do produkcije', 'Nijedna – pipeline je zelen'],
              correct: 1,
              explain:
                'Bez testova je put kraći, pa vrijeme do produkcije pada, a postavljanja može biti i više. Ali loši commitovi stižu u produkciju, pa raste udio neuspjelih postavljanja. U simulaciji svaki takav incident košta najmanje 6 minuta oporavka (5 min dok se ne otkrije + 1 min povratka).',
            },
            {
              q: (
                <>
                  Staging je testirao <code style={WRAP}>{F.digest}</code>, a produkcija s istim tagom <code>{F.tags[1]}</code> pokreće <code style={WRAP}>{F.rebuiltDigest}</code>. Što se dogodilo?
                </>
              ),
              options: ['Registar je oštetio sliku', 'Netko je sliku za produkciju izgradio ponovno – to je drugi, netestirani artefakt', 'Kubernetes pri svakom pokretanju mijenja digest', 'Digest ovisi o okruženju u kojem slika radi'],
              correct: 1,
              explain: 'Isti commit izgrađen ponovno daje druge vremenske oznake slojeva (ili noviju baznu sliku iza istog taga), dakle drugi digest. Tag je samo oznaka i pomaknuo se na novu sliku.',
            },
            {
              q: 'Svaki zeleni commit stigne do stanja „spremno za produkciju”, a Petra klikne „Odobri izdanje” kad procijeni da je trenutak dobar. Kako se to zove?',
              options: ['Kontinuirana integracija', 'Kontinuirana isporuka', 'Kontinuirano postavljanje', 'Ručno postavljanje'],
              correct: 1,
              explain: 'Kontinuirana isporuka: softver je uvijek spreman za izdanje, a izdanje je poslovna odluka. Kod kontinuiranog postavljanja nema klika.',
            },
            {
              q: 'Iz CI posla procurio je OIDC token. Što ograničava štetu?',
              options: [
                'Token je šifriran, pa ga napadač ne može pročitati',
                'Vrijedi kratko i smije samo ono što dopuštaju prava uloge (npr. samo push u registar)',
                'GitHub ga opozove čim posao završi',
                'Token radi samo na GitHubovim strojevima',
              ],
              correct: 1,
              explain: (
                <>
                  Pravilo povjerenja odlučuje tko uopće smije dobiti vjerodajnice (samo <code>klopa/klopa-api</code>, grana <code>main</code>). Ukradene vjerodajnice napadač može upotrijebiti s bilo kojeg računala,
                  ali samo do isteka (u AWS-u zadano 1 h, najkraće 15 min) i samo za ono što smije uloga. Ne opozivaju se kad posao završi – zato ih treba držati kratkima i uskima.
                </>
              ),
            },
            {
              q: (
                <>
                  Zašto u <code>ci.yaml</code> piše <code style={WRAP}>actions/checkout@3d3c42e…</code> umjesto <code style={WRAP}>actions/checkout@v7</code>?
                </>
              ),
              options: ['Brže se preuzima', 'Tag akcije može se pomaknuti na drugi kod, a SHA commita ne može', 'GitHub više ne podržava tagove akcija', 'Zbog predmemorije ovisnosti'],
              correct: 1,
              explain: (
                <>
                  Tag je pomična oznaka, kao <code>latest</code> kod slika. Puni SHA commita točno određuje kod koji će se izvršiti, s tajnama u blizini.
                </>
              ),
            },
            {
              q: (
                <>
                  Iz osmog predavanja: s uključenom predmemorijom CI nakon promjene koda gradi sliku za 40 s umjesto 4 min. Zašto se sloj <code>pip install</code> uzima iz predmemorije, a <code>COPY . .</code> ne?
                </>
              ),
              options: [
                <>
                  <code>pip install</code> je brži od kopiranja
                </>,
                <>
                  Ključ sloja ovisi o naredbi, njezinim ulazima i prethodnim slojevima; <code>requirements.txt</code> se nije promijenio, a kod jest
                </>,
                <>
                  BuildKit uvijek preskače naredbe <code>RUN</code>
                </>,
                <>
                  <code>COPY</code> se nikad ne sprema u predmemoriju
                </>,
              ],
              correct: 1,
              explain: (
                <>
                  <code>COPY requirements.txt</code> i <code>pip install</code> stoje prije <code>COPY . .</code>, pa im se ulazi nisu promijenili i uzimaju se iz predmemorije. <code>COPY . .</code> kopira
                  promijenjeni kod, pa se taj sloj i svi slojevi nakon njega (naredbe ispod njega u Dockerfileu) grade ponovno.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* 10 ─ Cost of the solution */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Svaki commit prolazi iste provjere, a crveni main zaustavi traku prije produkcije.',
            'U produkciji je točno testirani digest: zna se commit, verzija i tko je odobrio izdanje.',
            'Postavljanje više ne ovisi o Davorovu laptopu ni o tome je li Davor tu.',
          ]}
          paid={[
            'CI u push modelu drži ključ administratora klastera – ako procuri, napadač ima sve.',
            'Ručne promjene u klasteru nitko ne vidi: Git i produkcija se tiho razilaze.',
            'Pipeline treba održavati: nestabilne testove, predmemoriju i prikvačene verzije akcija.',
          ]}
          next={
            <>
              Pipeline gradi i provjerava svaku promjenu, ali na kraju sam izvodi <code>kubectl apply</code> s ključem administratora klastera. U 02:00 netko je još i ručno pokrenuo <code>kubectl edit</code> – i
              više nitko ne zna što stvarno radi u produkciji.
            </>
          }
        />
      </Section>
    </>
  )
}

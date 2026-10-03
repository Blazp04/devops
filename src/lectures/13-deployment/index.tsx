import {
  Analogy,
  Callout,
  CodeBlock,
  Compare,
  CostNote,
  DeepDive,
  DoodleIcon,
  Figure,
  IncidentCard,
  K8sGlyph,
  KeyIdea,
  Mark,
  MarginNote,
  Myth,
  MythOrFact,
  Predict,
  Quiz,
  Recap,
  Section,
  StickyNote,
  StoryMap,
  Term,
} from '../../kit'
import { DavorPlan } from './sims/DavorPlan'
import { OwnershipLab } from './sims/OwnershipLab'
import { HashLab } from './sims/HashLab'
import { RolloutStepper } from './sims/RolloutStepper'
import { FenceCalc } from './sims/FenceCalc'
import { RolloutLanes } from './sims/RolloutLanes'
import { RolloutBoard } from './sims/RolloutBoard'
import { StallFigure, StallTerminal, UndoTerminal } from './sims/Stall'
import { ControllerGallery } from './sims/Gallery'
import deploymentYaml from './code/deployment.yaml?raw'
import rolloutSh from './code/rollout.sh?raw'
import scaleSh from './code/scale-set-image.sh?raw'
import jobYaml from './code/job.yaml?raw'
import cronjobYaml from './code/cronjob.yaml?raw'
import styles from './styles.module.css'

export default function Lecture() {
  return (
    <>
      {/* 1 · incident */}
      <Section id="incident" kicker="priča" title="Noć bez povratka" lead="Goli Pod nestao je s čvorom i nitko ga nije vratio. A u 11:00 izlazi nova verzija – dok studenti naručuju.">
        <IncidentCard
          no={13}
          when="utorak, 10:20"
          title="Generalna proba: zamjena svih Podova značila bi 218 propalih narudžbi"
          who="davor"
          says={['11 sekundi', 'bez API-ja?!']}
          preset="„Incident 13: Davorov plan” (Recreate, 1.3.2 → 1.4.0 nakon 5 s, 30 s)"
          seed={42}
          metrics={[
            { label: 'zahtjeva/s', value: '20' },
            { label: 'nijedan Pod ne odgovara', value: '11,2 s', tone: 'bad' },
            { label: 'neuspjelih narudžbi', value: '218', tone: 'bad' },
          ]}
        >
          Noćas je čvor node-2 bio nedostupan dulje od pet minuta. Kubernetes je s njega izbacio goli Pod s API-jem, a novi nitko nije stvorio. Ujutro je Davor ručno vratio API, a zatim na probnom klasteru, s umjetnim prometom od 20 zahtjeva u sekundi, isprobao plan za 11:00: ugasiti sve stare Podove, pa pokrenuti nove s verzijom <code>1.4.0</code>.
        </IncidentCard>
        <p>
          Petra ne popušta: vegetarijanski meni mora biti vani u 11:00, a stranica ne smije stati ni na trenutak. Davorova proba pokazuje zašto je to teško. Kad se stari Podovi ugase, a novi se tek pokreću, 11 sekundi nijedan Pod ne prima narudžbe. Pri 20 narudžbi u sekundi to je dvjestotinjak propalih narudžbi – i to u 11:00, usred naručivanja. Pokrenite Davorovu probu i pogledajte sami:
        </p>
        <DavorPlan />
        <p>Klopi zapravo trebaju dvije stvari odjednom:</p>
        <ul>
          <li>
            <strong>četiri replike API-ja koje se same obnavljaju</strong> – Pod koji nestane netko mora zamijeniti, i to ne Davor u tri ujutro;
          </li>
          <li>
            <strong>zamjena svih Podova novom verzijom</strong> tako da u svakom trenutku dovoljno Podova prima narudžbe.
          </li>
        </ul>
        <p>
          Oba posla radi isti Kubernetesov objekt: <Term id="deployment">Deployment</Term>. Pitanje ovog predavanja je kako zamijeniti sve Podove novom verzijom, a da nijedna narudžba ne propadne – i što se događa kad nova verzija ne valja.
        </p>
      </Section>

      {/* 2 · ownership chain */}
      <Section id="lanac" kicker="koncept" title="Deployment, ReplicaSet i Podovi" lead="Tri riječi koje zvuče slično i lanac od tri objekta koji drži replike na životu." prop="helm">
        <Callout kind="info" title="Tri riječi">
          <p>Prije svega – tri riječi koje se u razgovoru stalno miješaju, a znače različite stvari:</p>
          <div className={styles.words}>
            <StickyNote c="yellow" rotate={-1} className={styles.word}>
              <div className={styles.wordHead}>
                <svg viewBox="0 0 46 34" className={styles.wordIcon} aria-hidden="true">
                  <K8sGlyph kind="deploy" x={3} y={3} w={40} h={28} />
                </svg>{' '}
                Deployment
              </div>
              <div className={styles.wordEn}>objekt u klasteru</div>
              <p className={styles.wordText}>Zapis željenog stanja: predložak Poda, broj replika i način zamjene. Uvijek s velikim D.</p>
            </StickyNote>
            <StickyNote c="pink" rotate={0.8} className={styles.word}>
              <div className={styles.wordHead}>
                <DoodleIcon kind="pipeline" className={styles.wordIcon} /> <Term id="deploy">postavljanje</Term>
              </div>
              <div className={styles.wordEn}>engl. deploy – radnja</div>
              <p className={styles.wordText}>Nova verzija počinje raditi u nekom okruženju. Postavljanje može obaviti Deployment, ali i skripta ili Argo CD.</p>
            </StickyNote>
            <StickyNote c="green" rotate={-0.6} className={styles.word}>
              <div className={styles.wordHead}>
                <DoodleIcon kind="flag" className={styles.wordIcon} /> <Term id="release">izdanje</Term>
              </div>
              <div className={styles.wordEn}>engl. release</div>
              <p className={styles.wordText}>Trenutak kad korisnici dobiju novu mogućnost. Može doći i nakon postavljanja – o tome u 20. predavanju.</p>
            </StickyNote>
          </div>
        </Callout>
        <p>
          U datoteci opisujemo <Term id="desired-state">željeno stanje</Term>: „četiri Poda prema ovom predlošku”. Deployment ih ipak ne stvara sam. On stvori <Term id="replicaset">ReplicaSet</Term>, a ReplicaSet stvara Podove. Podovi i ReplicaSetovi imaju zapisanog vlasnika (
          <Term id="owner-reference">ownerReferences</Term>): Pod pokazuje na ReplicaSet, ReplicaSet na Deployment.
        </p>
        <MarginNote>ReplicaSet broji, ne pamti imena</MarginNote>
        <p>
          Iza ReplicaSeta radi obična <Term id="reconciliation-loop">petlja usklađivanja</Term> (kontroler ReplicaSeta). Podove ReplicaSeta prepoznaje po <Term id="label">oznakama</Term> – selektoru <code>app=klopa-api</code> i sažetku predloška, o kojem više u sljedećem odjeljku – i stalno uspoređuje: koliko ih ima, a koliko bi trebalo biti? Ako je jedan nestao, stvori novi. Novi Pod dobije novo ime i novu adresu, jer je ReplicaSetu važan broj, a ne pojedini Pod.
        </p>
        <OwnershipLab />
        <Callout kind="tip" title="Što ste upravo vidjeli">
          <ul>
            <li>Obrisani Pod ostavi prazno mjesto (crvenu iscrtkanu kućicu), a ReplicaSet ga popuni novim Podom s novim imenom.</li>
            <li>
              Pod kojem promijenite oznaku više ne odgovara selektoru: ReplicaSet ga pusti (ostaje raditi, „bez vlasnika”) i stvori zamjenu. Tako se pokvareni Pod može izdvojiti za istraživanje.
            </li>
            <li>
              Deset replika na tri čvora s mjestom za devet: deseti Pod ostaje <Term id="pending">Pending</Term>. Replike su Podovi, a ne računala.
            </li>
          </ul>
        </Callout>
        <Analogy
          title="Ugovor o smjeni"
          breaksDown="Ugovor ne navodi imena konobara: svaki Pod mora biti zamjenjiv. Pod koji čuva vlastite podatke (baza) ne smije se samo tako zamijeniti – za to postoji StatefulSet (19. predavanje)."
        >
          Ugovor menze kaže: na pultu uvijek stoje četiri konobara; tko god ode, odmah se zove zamjena; kad stignu nove uniforme, mijenja se jedan po jedan, da pult nikad ne ostane prazan. Ugovor je Deployment, voditeljica smjene koja broji konobare je
          ReplicaSet, a konobari su Podovi.
        </Analogy>
      </Section>

      {/* 3 · what creates a new ReplicaSet */}
      <Section id="novi-replicaset" kicker="predvidite" title="Što stvara novi ReplicaSet?" lead="Neke promjene samo mijenjaju broj Podova, a neke pokreću uvođenje nove verzije.">
        <p>
          Deployment ima dva dijela. Jedan opisuje <em>koliko</em> i <em>kako</em> (replicas, strategija), a drugi – predložak Poda (<code>spec.template</code>) – opisuje <em>kakav</em> je svaki Pod: slika, varijable okoline, provjere, resursi.
        </p>
        <Predict
          question={
            <>
              Lana u datoteci <code>deployment.yaml</code> promijeni samo <code>replicas: 4</code> u <code>replicas: 6</code> i primijeni je. Što će Kubernetes napraviti?
            </>
          }
          options={['Stvoriti novi ReplicaSet i postupno zamijeniti svih šest Podova.', 'Postojećem ReplicaSetu povećati broj na 6: dva nova Poda, četiri stara ostaju.', 'Ugasiti sva četiri Poda i pokrenuti šest novih.']}
          correct={1}
          explain="Broj replika nije dio predloška Poda. Isti ReplicaSet dobije novi broj i stvori dva Poda, a postojeći rade dalje. Novi ReplicaSet nastaje tek kad se promijeni predložak."
          then={
            <>
              Isprobajte ovu i još tri promjene ispod: prvo pogodite, pa pogledajte <code>kubectl get rs</code>.
            </>
          }
        />
        <HashLab />
        <p>
          Pravilo je jednostavno: <Mark c="yellow">svaka promjena predloška Poda stvara novi ReplicaSet</Mark>, a time i novu reviziju. Deployment iz predloška izračuna sažetak (<Term id="pod-template-hash">pod-template-hash</Term>), doda ga u ime ReplicaSeta, u njegov selektor i kao oznaku svakom njegovu Podu. Zato se dva ReplicaSeta istog Deploymenta nikad ne svađaju oko istih Podova.
        </p>
        <DeepDive title="A kubectl rollout restart?">
          <p>
            Naredba <code>kubectl rollout restart</code> ne mijenja sliku, nego u predložak upiše anotaciju s trenutačnim vremenom (<code>kubectl.kubernetes.io/restartedAt</code>). Predložak je drukčiji, pa nastaje novi ReplicaSet i svi Podovi se zamijene po istim pravilima kao pri novoj verziji. Tako se, recimo, Podovi
            ponovno pokreću da bi pročitali promijenjeni Secret (16. predavanje).
          </p>
        </DeepDive>
      </Section>

      {/* 4 · rolling update, step by step */}
      <Section id="uvodenje" kicker="korak po korak" title="Dva ReplicaSeta u suprotnim smjerovima" lead="Postupno ažuriranje nije čarolija: jedan ReplicaSet raste, drugi se smanjuje, a dvije ograde paze da ne pretjeraju.">
        <p>
          Lana primijeni sliku 1.4.0. Nastaje novi ReplicaSet s nula Podova, a stari ih ima četiri. <Term id="rolling-update">Postupno ažuriranje</Term> (engl. <em>rolling update</em>) sada malo-pomalo povećava novi i smanjuje stari. Pogledajmo svaki korak – svaki prikaz je stanje simulacije u tom trenutku.
        </p>
        <p>
          Dvije ograde paze na uvođenje: <Term id="max-surge"><code>maxSurge</code></Term> kaže koliko Podova smije biti iznad četiri, a <code>maxUnavailable</code> koliko ih smije nedostajati među dostupnima (dostupan Pod je ovdje isto što i spreman). Kako se računaju, vidjet ćemo u sljedećem odjeljku.
        </p>
        <RolloutStepper />
        <KeyIdea>
          Uvođenje nove verzije su <strong>dva ReplicaSeta koja se skaliraju u suprotnim smjerovima</strong> unutar dviju ograda. <strong>Provjera spremnosti je vratar</strong>: stari se smanjuje samo onoliko koliko novih postane spremno, uz dopušteni <code>maxUnavailable</code>. A povratak na staru verziju samo je <strong>ponovno povećanje starog ReplicaSeta</strong> – koje netko mora zatražiti.
        </KeyIdea>
        <Callout kind="warn" title="Neko vrijeme rade obje verzije">
          Od 12. do 23. sekunde narudžbe primaju i 1.3.2 i 1.4.0. Ako 1.4.0 promijeni oblik odgovora ili stupac u bazi koji 1.3.2 još čita, dio studenata dobit će greške iako je uvođenje „uspjelo”. Postupno ažuriranje bez prekida traži verzije koje mogu raditi istodobno – kako se mijenja baza da to vrijedi, vidjet ćemo u 20. predavanju.
        </Callout>
      </Section>

      {/* 5 · fences */}
      <Section id="ograde" kicker="izračunajte" title="Ograde: maxSurge i maxUnavailable" lead="Dva broja određuju koliko je uvođenje brzo, koliko dodatnog mjesta treba i koliko kapaciteta smije pasti.">
        <MarginNote tone="red">surge naviše, unavailable naniže</MarginNote>
        <p>
          <code>maxSurge</code> kaže koliko Podova smije biti <em>iznad</em> zadanog broja replika, a <code>maxUnavailable</code> koliko ih smije <em>nedostajati</em> među dostupnima. Mogu biti broj ili postotak. Postotak od <code>maxSurge</code> zaokružuje se naviše – da uvođenje uvijek može dodati barem jedan Pod – a od <code>maxUnavailable</code> naniže – da kapacitet ne padne više nego što ste dopustili. Oba ne smiju biti 0: tada se ništa ne bi smjelo ni dodati ni ukloniti.
        </p>
        <FenceCalc />
        <p>
          Zadano je 25 % i 25 %. Pogledajte tablicu: s jednom replikom to je <code>1/0</code>, pa se i jedan jedini Pod zamjenjuje bez prekida – novi postane spreman prije nego što se stari ugasi. Isto uvođenje (N = 4) s četiri različita para ograda izgleda ovako:
        </p>
        <Figure caption="Svaka traka je jedno uvođenje 1.3.2 → 1.4.0 u simulaciji: koliko je Podova svake vrste u svakom trenutku. Okomita crta je kraj uvođenja.">
          <RolloutLanes />
        </Figure>
        <Compare
          left={{
            title: (
              <>
                <code>maxSurge: 1</code> · <code>maxUnavailable: 0</code>
              </>
            ),
            tone: 'green',
            points: ['Nikad manje od 4 dostupna Poda – kapacitet ne pada.', 'Treba mjesta za jedan Pod više (5; s Podom u gašenju na trenutak 6).', 'Sporije: 51 s, jer svaki novi mora biti spreman prije nego što stari ode.'],
          }}
          right={{
            title: (
              <>
                <code>maxSurge: 0</code> · <code>maxUnavailable: 1</code>
              </>
            ),
            tone: 'amber',
            points: ['Ograda: nikad više od 4 Poda; peti je samo onaj koji se još gasi.', 'Kapacitet padne na 3 od 4 (75 %).', '46 s; dobro kad je klaster pun, loše u podne.'],
          }}
        />
        <p>
          A <code>100%</code> / <code>0</code> sve nove Podove pokrene odjednom: gotovo za 17 s, ali na trenutak treba mjesta za osam Podova. Ograde su kompromis između brzine, dodatnog mjesta i punog kapaciteta – sve troje odjednom ne možete imati.
        </p>
        <DeepDive title="Zašto se Podovi u gašenju ne broje">
          <p>
            Ograda „ukupno ≤ N + maxSurge” broji <code>spec.replicas</code> svih ReplicaSetova. Pod u gašenju više nije u tom broju, iako još nekoliko sekundi dovršava započete zahtjeve i zauzima mjesto na čvoru. Zato je pri 25 %/25 % na crtežu ponekad 7 kutija za ručak, a ograda kaže 5. Kubernetes ih odnedavno
            prikazuje u polju <code>.status.terminatingReplicas</code>, ali ih u računanju ograda i dalje ne broji.
          </p>
          <Callout kind="fact" title="Stanje: listopad 2026.">
            Polje <code>.status.terminatingReplicas</code> Deploymenta i ReplicaSeta beta je od Kubernetesa 1.35 i uključeno je zadano (trenutačna verzija je 1.37).
          </Callout>
        </DeepDive>
        <DeepDive title="minReadySeconds">
          <Myth myth="minReadySeconds odgađa promet prema novom Podu.">
            Ne odgađa. Promet ide Podu čim je <em>spreman</em> (Ready). <code>minReadySeconds</code> samo odgađa trenutak kad se Pod broji kao <em>dostupan</em> (Available) – pa usporava uvođenje i hvata Podove koji se sruše odmah nakon pokretanja, ali ne štiti ih od prometa.
          </Myth>
        </DeepDive>
      </Section>

      {/* 6 · broken version */}
      <Section id="pokvarena" kicker="koncept" title="Pokvarena verzija zastaje, a ne vraća se" lead="Kubernetes vidi da uvođenje ne napreduje. Što s tim napraviti, odlučujete vi.">
        <p>
          Prije 11:00 Lana na probnom klasteru, nakon <code>1.4.0</code>, isproba i sljedeću verziju, <code>1.5.0</code> – a ta se ruši dvije sekunde nakon pokretanja. Novi ReplicaSet dobije dva Poda (ograda: ukupno 5), stari padne na tri (ograda: dostupno 3). Novi Podovi nikad ne postanu spremni, pa se stari ne smiju dalje smanjivati, a novi ne smiju rasti. Uvođenje stoji. S deset replika i zadanim ogradama (+3 / −2) zastoj bi bio na 8 starih i 5 novih Podova.
        </p>
        <StallFigure />
        <p>
          Nakon <code>progressDeadlineSeconds</code> (zadano 600 s; u simulaciji 60) Deployment dobije uvjet <code>Progressing=False</code> s razlogom <Term id="progress-deadline">ProgressDeadlineExceeded</Term>. To je samo oznaka. <Mark c="pink">Deployment se ne vraća sam na staru verziju</Mark> – tri stara Poda nose promet i čekaju da netko odluči.
        </p>
        <StallTerminal />
        <p>
          <Term id="rollback">Povratak na prethodnu verziju</Term> je <code>kubectl rollout undo</code>. Naredba u Deployment vrati predložak prethodne revizije – a taj predložak već ima svoj ReplicaSet s tri spremna Poda. Uvođenje zato ide po istim pravilima, samo unatrag: stari ReplicaSet naraste na 4, onaj s 1.5.0 padne na 0. Kubernetes čuva do 10 starih ReplicaSetova (<code>revisionHistoryLimit</code>), pa se možete vratiti i na točno određenu reviziju (<code>--to-revision</code>).
        </p>
        <UndoTerminal />
        <Callout kind="warn" title="rollout undo mijenja klaster, a ne vašu datoteku">
          U datoteci <code>deployment.yaml</code> i dalje piše 1.5.0. Sljedeći <code>kubectl apply</code> vratit će pokvarenu verziju. Popravite i datoteku – a kad klaster vodi Git (GitOps, 22. predavanje), povratak je <code>git revert</code>, a ne <code>rollout undo</code>.
        </Callout>
        <Compare
          left={{
            title: 'RollingUpdate (zadano)',
            tone: 'blue',
            points: ['Stari i novi Podovi rade istodobno.', 'Ograde čuvaju kapacitet; spremnost čuva korisnike.', 'Pokvarena verzija zastane uz stare Podove.'],
          }}
          right={{
            title: 'Recreate',
            tone: 'rose',
            points: ['Prvo ugasi sve stare, pa tek onda pokreće nove.', 'Prekid: u Klopinoj probi 11 s u kojima nijedan Pod ne odgovara (Incident 13).', 'Ima smisla samo kad dvije verzije nikako ne smiju raditi zajedno.'],
          }}
        />
        <DeepDive title="Ne postoji li automatski povratak?">
          <p>
            U samom Deploymentu ne postoji. Deployment zna samo dvije strategije, RollingUpdate i Recreate. Plavo-zeleno postavljanje (engl. <em>blue-green</em>) i canary izdanje s automatskom analizom grešaka rade dodatni alati poput Argo Rollouts ili Flaggera, ili ih slažemo od dva Deploymenta i Gatewaya. To je tema 20.
            predavanja.
          </p>
        </DeepDive>
      </Section>

      {/* 7 · flagship */}
      <Section id="simulacija" kicker="simulacija" title="Kontrolna ploča uvođenja" lead="Sada vi vodite uvođenje: mijenjate datoteku, primjenjujete je i gledate 20 narudžbi u sekundi.">
        <p>
          Lijevo je recept (Deployment), u sredini ReplicaSetovi s Podovima, a s desne strane dolaze narudžbe. Pladnjevi idu spremnim Podovima – a kad nijedan nije spreman, onima koji se još gase. Promijenite polja u datoteci <code>deployment.yaml</code> i pritisnite „Primijeni” – to je <code>kubectl apply</code>. Gumb „Incident 13” ponavlja Davorovu probu s početka (seed 42).
        </p>
        <RolloutBoard />
        <Callout kind="tip" title="Što ste upravo vidjeli">
          <ul>
            <li>Sa zadanim ogradama i provjerom spremnosti 1.4.0 izađe bez ijedne neuspjele narudžbe, a traka odgovora neko vrijeme ima obje boje.</li>
            <li>Bez provjere spremnosti promet ide Podovima čim se kontejner pokrene – dok se aplikacija pokreće i zagrijava, narudžbe dobivaju odbijene veze i 503.</li>
            <li>Recreate prvo ugasi sve, pa tek onda pokrene nove: 11 sekundi nitko ne odgovara.</li>
            <li>
              1.5.0 (ruši se) zastane kao u prošlom odjeljku, a <code>rollout undo</code> ponovno poveća stari ReplicaSet.
            </li>
            <li>„Obriši Deployment”: brisanje vlasnika kaskadno briše ReplicaSetove i Podove – Klopa je bez API-ja dok ponovno ne primijenite datoteku.</li>
          </ul>
        </Callout>
      </Section>

      {/* 8 · code */}
      <Section id="kod" kicker="kod" title="deployment.yaml i kubectl" lead="Sve što ste vidjeli na ploči stoji u četrdesetak redaka YAML-a i nekoliko naredbi.">
        <CodeBlock
          title="deployment.yaml"
          lang="yaml"
          code={deploymentYaml}
          highlight="16-17"
          caption="Deployment klopa-api iz simulacije. Dvije vrijednosti skraćene su za učionicu i to piše u komentaru."
          notes={[
            { lines: '7', text: 'CHANGE-CAUSE u povijesti revizija' },
            { lines: '9', text: 'broj replika: skalira isti ReplicaSet' },
            { lines: '10-12', text: 'koje Podove ReplicaSet broji kao svoje' },
            { lines: '16-17', text: 'ograde: +1 iznad, −1 dostupan ispod' },
            { lines: '18', text: 'istek roka = zastoj, ne povratak' },
            { lines: '20', text: 'sve ispod = predložak → novi ReplicaSet' },
            { lines: '27', text: 'nova slika = nova revizija; nikad :latest' },
            { lines: '30-34', text: 'vratar: bez nje promet ide hladnim Podovima' },
          ]}
        />
        <CodeBlock title="rollout.sh" lang="bash" code={rolloutSh} caption="Praćenje uvođenja, povijest i povratak." />
        <Callout kind="warn" title="Brze naredbe mijenjaju klaster, a ne datoteku">
          <code>kubectl scale</code> i <code>kubectl set image</code> zgodni su za probu, ali promjena ne završi u datoteci. U GitOpsu (22. predavanje) iste promjene radite u Gitu – inače ih Argo CD vrati na ono što piše ondje.
        </Callout>
        <CodeBlock title="scale-set-image.sh" lang="bash" code={scaleSh} mode="closed" />
        <Callout kind="fact" title="Stanje: listopad 2026.">
          Zastavica <code>kubectl --record</code>, koja je nekad punila stupac CHANGE-CAUSE, zastarjela je. Razlog promjene upišite u anotaciju <code>kubernetes.io/change-cause</code> (u datoteci ili naredbom <code>kubectl annotate</code>); Deployment je prepiše u ReplicaSet te revizije.
        </Callout>
        <DeepDive title="Galerija kontrolera: tko još stvara Podove">
          <p>Deployment je za aplikacije bez stanja koje stalno rade. Za druge poslove Kubernetes ima druge kontrolere – svi rade po istom načelu petlje usklađivanja:</p>
          <ControllerGallery />
          <CodeBlock title="job.yaml" lang="yaml" code={jobYaml} mode="closed" caption="Job: migracija baze prije uvođenja 1.4.0." />
          <CodeBlock title="cronjob.yaml" lang="yaml" code={cronjobYaml} mode="closed" caption="CronJob: izvještaj kuhinji radnim danom u 6:30." />
        </DeepDive>
      </Section>

      {/* 9 · misconceptions */}
      <Section id="zablude" kicker="zablude" title="Mit ili istina?">
        <MythOrFact
          items={[
            {
              statement: 'Deployment i postavljanje su isto.',
              fact: false,
              explain: 'Deployment je objekt u klasteru – zapis željenog stanja. Postavljanje je radnja kojom verzija počinje raditi; može je obaviti Deployment, ali i Helm, skripta ili Argo CD.',
            },
            {
              statement: 'Više replika znači više računala.',
              fact: false,
              explain: 'Replike su Podovi. Više Podova dijeli isti čvor, a kad su čvorovi puni, višak ostaje Pending.',
            },
            {
              statement: 'Postupno ažuriranje je uvijek bez prekida.',
              fact: false,
              explain: 'Samo uz provjeru spremnosti, verzije koje mogu raditi istodobno i aplikaciju koja nakon SIGTERM-a dovrši započete zahtjeve (14. predavanje). Bez provjere spremnosti promet ide Podovima koji se još zagrijavaju.',
            },
            {
              statement: 'Deployment se sam vraća na staru verziju kad nova ne radi.',
              fact: false,
              explain: (
                <>
                  Uvođenje zastane i dobije <code>ProgressDeadlineExceeded</code>. Povratak je <code>kubectl rollout undo</code>, <code>git revert</code> ili poseban alat.
                </>
              ),
            },
            {
              statement: 'Deployment izravno upravlja Podovima.',
              fact: false,
              explain: 'Upravlja ReplicaSetovima, a oni Podovima. Stari ReplicaSetovi s 0 Podova upravo su povijest revizija.',
            },
            {
              statement: 'S jednom replikom i zadanim 25 %/25 % uvođenje može proći bez prekida.',
              fact: true,
              explain: 'Za N = 1 maxSurge je ⌈0,25⌉ = 1, a maxUnavailable ⌊0,25⌋ = 0: novi Pod postane spreman prije nego što se stari ugasi.',
            },
            {
              statement: 'Plavo-zeleno postavljanje i canary izdanje ugrađeni su u Deployment.',
              fact: false,
              explain: 'Deployment zna samo RollingUpdate i Recreate. Ostalo slažemo od više Deploymenata, Gatewaya ili alata (20. predavanje).',
            },
          ]}
        />
      </Section>

      {/* 10 · recap + quiz */}
      <Section id="sazetak" kicker="sažetak" title="Što smo naučili">
        <Recap
          points={[
            'Deployment → ReplicaSet → Podovi. ReplicaSet broji Podove po selektoru i nadoknadi svaki koji nestane – zato se replike same obnavljaju.',
            'Promjena broja replika skalira isti ReplicaSet. Promjena predloška Poda (slika, varijable, provjere) stvara novi ReplicaSet i novu reviziju.',
            'Postupno ažuriranje: novi ReplicaSet raste, stari pada; ukupno ≤ N + maxSurge (naviše), dostupno ≥ N − maxUnavailable (naniže). Provjera spremnosti je vratar.',
            <>
              Pokvarena verzija zastaje uz stare Podove (<code>ProgressDeadlineExceeded</code>) i ne vraća se sama. <code>kubectl rollout undo</code> ponovno poveća stari ReplicaSet.
            </>,
            'Deployment je objekt, postavljanje je radnja, a izdanje trenutak kad korisnici dobiju novu mogućnost.',
          ]}
        />
        <StoryMap at="13" caption="Deployment i ReplicaSet drže četiri replike API-ja; 1.4.0 je bez prekida zamijenila 1.3.2." />
        <Quiz
          questions={[
            {
              q: (
                <>
                  Probni klaster, utorak 10:52. Lana je u 10:40 primijenila <code>1.5.0</code>. <code>kubectl get rs</code>: stari ReplicaSet ima 3 od 3 spremna Poda, novi 2 Poda u <code>CrashLoopBackOff</code>; Deployment ima <code>Progressing=False</code> (<code>ProgressDeadlineExceeded</code>). Narudžbe prolaze. Što se događa i što napraviti?
                </>
              ),
              options: [
                'Kubernetes će uskoro sam vratiti staru verziju – treba pričekati.',
                <>
                  Uvođenje je zastalo uz stare Podove; treba pokrenuti <code>kubectl rollout undo</code> (ili popraviti sliku).
                </>,
                'Klaster nema kapaciteta; treba dodati čvor.',
                'Selektor ReplicaSeta je pogrešan; treba ga promijeniti.',
              ],
              correct: 1,
              explain: (
                <>
                  <code>ProgressDeadlineExceeded</code> je samo oznaka – povratka nema dok ga netko ne zatraži. Tri stara Poda nose promet (75 % kapaciteta), a undo stari ReplicaSet vrati na 4.
                </>
              ),
            },
            {
              q: (
                <>
                  Deployment ima <code>replicas: 10</code>, <code>maxSurge: 25%</code> i <code>maxUnavailable: 25%</code>. Koliko je najviše Podova (bez onih u gašenju) i koliko najmanje dostupnih tijekom uvođenja?
                </>
              ),
              options: ['13 i 8', '12 i 7', '13 i 7', '12 i 8'],
              correct: 0,
              explain: 'surge = ⌈2,5⌉ = 3, pa ukupno ≤ 13; unavailable = ⌊2,5⌋ = 2, pa dostupno ≥ 8. maxSurge se zaokružuje naviše, maxUnavailable naniže.',
            },
            {
              q: (
                <>
                  Koja promjena u datoteci <code>deployment.yaml</code> stvara novi ReplicaSet?
                </>
              ),
              options: [
                <>
                  <code>replicas</code>: 4 → 8
                </>,
                <>
                  <code>maxSurge</code>: <code>25%</code> → <code>50%</code>
                </>,
                <>
                  nova varijabla okoline <code>LOG_LEVEL=debug</code> u kontejneru
                </>,
                <>
                  <code>progressDeadlineSeconds</code>: 600 → 300
                </>,
              ],
              correct: 2,
              explain: 'Varijabla okoline dio je predloška Poda, pa se mijenja pod-template-hash. Ostalo su polja samog Deploymenta.',
            },
            {
              q: 'Lana isključi provjeru spremnosti i uvede 1.4.0 sa zadanim ogradama. Što će studenti vidjeti?',
              options: [
                'Ništa – postupno ažuriranje je uvijek bez prekida.',
                'Greške dok se novi Podovi zagrijavaju: promet im ide čim se kontejner pokrene.',
                'Uvođenje neće ni krenuti dok se provjera ne uključi.',
                'Sve narudžbe idu samo starim Podovima do kraja uvođenja.',
              ],
              correct: 1,
              explain: 'Bez provjere spremnosti Pod je „spreman” čim se kontejner pokrene. Aplikacija se još pokreće i zagrijava, pa odbija veze i vraća 503 – a stari Podovi se gase jer se novi broje kao dostupni.',
            },
            {
              q: 'Zamislite da Lana uvede 1.4.0 već u 10:30, a vegetarijanski meni u njoj ostane skriven dok ga Petra u 11:00 ne uključi. Što je ovdje Deployment, što postavljanje, a što izdanje?',
              options: [
                'Sve troje je isto – to je samo engleska riječ „deploy”.',
                'Deployment je objekt koji je zamijenio Podove; postavljanje je radnja u 10:30, kad je 1.4.0 počela raditi; izdanje je 11:00, kad studenti dobiju meni.',
                'Izdanje je u 10:30, a postavljanje u 11:00, kad Petra uključi meni.',
                'Deployment je radnja u 10:30, a postavljanje objekt u klasteru.',
              ],
              correct: 1,
              explain: 'Deployment je objekt u klasteru – zapis željenog stanja koji je obavio uvođenje. Postavljanje je radnja: nova verzija radi u okruženju. Izdanje je trenutak kad korisnici dobiju novu mogućnost – može doći i nakon postavljanja (20. predavanje).',
            },
            {
              q: 'Iz prošlog predavanja: zašto se goli Pod s API-jem nije vratio kad je čvor node-2 pao?',
              options: [
                'Zato što kubelet ponovno pokreće samo Podove s provjerom živosti.',
                'Zato što ga nijedan kontroler nije posjedovao – nadoknađuje ga tek ReplicaSet (preko Deploymenta).',
                'Zato što je Pod imao premalo memorije.',
                'Zato što je čvor node-2 bio cordoniran.',
              ],
              correct: 1,
              explain: 'Kubelet ponovno pokreće kontejnere na istom čvoru. Kad čvor nestane, novi Pod drugdje stvara samo kontroler koji ga posjeduje – za goli Pod takvog nema.',
            },
          ]}
        />
      </Section>

      {/* 11 · cost */}
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
        <CostNote
          gained={[
            'Četiri replike API-ja same se obnavljaju: Pod koji nestane ReplicaSet odmah nadoknadi.',
            <>
              Verzija <code>1.4.0</code> izašla je u 11:00 bez ijedne neuspjele narudžbe.
            </>,
            'Pokvarena verzija zastane uz stare Podove, a povratak traje sekunde.',
          ]}
          paid={[
            'Tijekom uvođenja rade obje verzije – moraju biti kompatibilne.',
            'Svaki novi Pod ima novo ime i novu IP adresu.',
            'Povratak netko mora zatražiti: Deployment se ne vraća sam.',
          ]}
          next="Vegetarijanski meni je vani. Ali novi Podovi imaju nove IP adrese, a klopa-web je imao upisanu adresu jednog API Poda – i sada vraća greške. Kako drugi pronalaze Podove koji stalno mijenjaju adresu?"
        />
      </Section>
    </>
  )
}

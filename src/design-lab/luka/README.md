# Luka — smjer dizajna

**Koncept.** Tečaj je izometrijska kontejnerska luka u kojoj živi menza Klopa: poslužitelji su dokovi, zahtjevi su kamioni, kontejneri su doslovno kontejneri, a Kubernetes je lučka kontrola koja ih slaže, prati i ponovno pokreće. Svaka ilustracija gradi se od istog malog skupa izometrijskih primitiva (kutija, kontejner, cesta, kamion, dizalica, toranj) u istom mjerilu, pa student iz predavanja u predavanje čita isti vizualni jezik. Stranica je lučka signalizacija — šablonska slova, žuto-crne zaštitne trake, teretni listovi, carinski pečati i ploče s rasporedom — danju na suncem obasjanom betonu, noću pod narančastim natrijevim svjetlima.

Prototip: `http://localhost:5173/dizajn/luka`

Datoteke: `index.tsx` (stranica, zaglavlje, podnožje), `iso-math.ts` + `iso.tsx` + `iso.module.css` (izometrijski primitivi), `HeroPort.tsx` (diorama; na mobitelu dva kadra), `sim-model.ts` + `LoadBalancerSim.tsx` + `yard.tsx` + `yard-geo.ts` (simulacija i zajednički „terminal”), `StepThrough.tsx` (korak po korak na istom terminalu), `ClusterView.tsx` (noćni prikaz klastera), `CodeSamples.tsx` + `yaml-tokens.ts`, `Quiz.tsx`, `Blocks.tsx` (raspored, zaglavlje predavanja, ključna ideja, usporedba, mit), `Grammar.tsx` (tehnički list „Abeceda luke”), `Skyline.tsx`, `useLoop.ts` (sat animacije, reduced motion, media query).

## Kompozicija stranice

- **Dvije mjere i ništa između:** stupac za čitanje (760 px: prosa, ključna ideja, mit, kviz) i puna pozornica (1176 px: sve što ima crtež). Klaster probija obje kao **noćni prijelom** preko cijele širine.
- **Svaki tip objekta ima svoju „ambalažu”:** raspored = ploča odlazaka (split-flap), zaglavlje predavanja = bok kontejnera + teretni list na klipsi, ključna ideja = sigurnosni znak, usporedba = tlocrt na stolu (dvostruki rub, naslovni blok), mit = carinski obrazac s kopijom ispod, kod = šperploča sanduka sa šablonom i kutnim okovima, terminal = konzola tornja, kviz = carinska karta s odrezkom, abeceda = tehnički list sa zonama, podnožje = ploča odlazaka.
- **Žuto-crna traka s „hazard” kvadratom samo za strojeve:** simulacija i korak-po-korak. Tvrda sjena (offset) samo za fizičke predmete (gumbi, CTA, znak, strojevi).

## Paleta (tokeni na `.root`, `luka.module.css`)

| Token | Dnevna smjena (light) | Noćna smjena (dark) | Uloga |
| --- | --- | --- | --- |
| `--ground` | `#e6e1d5` beton | `#0d1823` noćni asfalt | pozadina (+ izometrijska mreža i šum) |
| `--paper` | `#f4f0e6` | `#132331` | teretni listovi, ploče |
| `--ink` / `--ink-2` / `--ink-3` | `#14212e` / `#3b4855` / `#56626d` | `#efe7d4` / `#c4c6c0` / `#9aa3a7` | tekst |
| `--navy` | `#13283b` | `#060e16` | zaglavlje, trake strojeva, podnožje |
| `--yellow` | `#f2b200` | `#ffc23d` | sigurnosna žuta: zahtjev, dizalice (jezgre), oznake |
| `--amber` | `#ffb347` | `#ffb347` | LED, čekanje (puno dvorište, kamion pred vratima), aktivna ruta |
| `--orange` | `#dc520c` | `#ff7a2f` | signalna narančasta: naglasak, v2, zauzeti CPU |
| `--teal` / `--rust` / `--mustard` / `--blue` | `#22807b` / `#a8432c` / `#c8942a` / `#2f5d8a` | `#2b918b` / `#b4513a` / `#d6a647` / `#3d6d9c` | boje kontejnera (v1 = teal, ostalo teret) |
| `--sig-green` | `#2a9654` | `#4fd07f` | uspjeh, Running, Ready, odgovor 200 |
| `--sig-red` | `#d3302a` | `#ff4d40` | **samo kvar**: greška 503, PAD, CrashLoopBackOff |
| `--concrete` / `--dock` / `--asphalt` | `#cfc8b8` / `#8e979e` / `#3a434c` | `#22303d` / `#3a4855` / `#343f4a` | tlo, dokovi, ceste |
| `--water` | `#1f4a66` | `#071522` | more (registar) |
| `--sodium` | (nevidljivo) | `#ffae45` | noćna rasvjeta: lokve svjetla s jarbola izvan kadra, farovi, prozori |
| sjenčanje ploha | `--top-tint #fff 12 %`, `--l-amt 12 %`, `--r-amt 30 %` | `--top-tint #ffb347 16 %`, `--l-amt 38 %`, `--r-amt 56 %` | svaka iso kutija dobiva samo jednu baznu boju (`--c`); plohe se računaju u CSS-u (`color-mix`), pa se svaki objekt sam „prebaci” u noćnu smjenu |

Noćna smjena nije invertirana dnevna: beton postaje tamni asfalt, gornje plohe dobivaju natrijev odsjaj, prozori i farovi svijetle, svjetla dobivaju halo. Isti tokeni mogu se prisiliti na dio stranice (`data-theme="dark"` na sekciji) — tako je klaster uvijek „noćni prijelom”, i danju.

## Tipografija

| Uloga | Font | Gdje |
| --- | --- | --- |
| Natpisi / šablona | **Saira Stencil One** | naslov, H2, naslov predavanja, natpisi oslikani na kontejnerima, sanducima i dokovima |
| Lučka signalizacija | **Big Shoulders Display Variable** (800–900, verzal, razmak 0,06–0,2 em) | oznake vezova, gumbi, nazivi dokova, ploče, statusi |
| Tekst | **Archivo Variable** (wdth 86–100 %) | prosa 17–18 px, opisi i legende 15–16 px, rečenice u alatima |
| Brojke i kod | **Martian Mono Variable** (wdth 78–82 % za kod) | samo brojke, jedinice, ID-jevi, YAML, kubectl, LED ploče |

Svi fontovi imaju latin-ext (č ć đ š ž). Mono se ne koristi za rečenice.

## Ilustracijska gramatika

Projekcija: 2:1 dimetrija (`iso(x, y, z)` u `iso-math.ts`), os x ide dolje-desno, y dolje-lijevo, z gore; 1 m = 20 SVG jedinica. Dubina = `x + y` (veće je bliže). Svaki objekt = 1 bazna boja + tamni rub `--edge` 1 px (non-scaling). Nazivi su HTML pločice (tamnoplava ploča sa žutim lijevim rubom) na tankoj crti-vodilici s točkom; brojevi uz crtež su žuti kvadrati koji odgovaraju numeriranom popisu ispod.

| Entitet | Kako se crta | Stanja / boje |
| --- | --- | --- |
| Korisnik / student | mala figura: hlače + jakna (kutija) + glava, svijetli mobitel; skupina na trgu ispred menze Klopa | boja jakne ne znači ništa |
| Zahtjev u letu | **kamion** (kabina + teret) koji vozi stalnom brzinom desnom trakom | teret **žut** |
| Uspjeh | isti kamion vraća se suprotnom trakom | teret **zelen** (200) |
| Greška | kamion se vraća s **crvenim** teretom, crvenom rotirkom na kabini i bijelom pločom **503 na krovu** (krov se uvijek vidi, i u gužvi) | 503, odbijeno, pao poslužitelj |
| Timeout | kamion stoji pred spuštenom rampom, teret siv, sat iznad; nakon roka blijedi | siva = „nitko nije odgovorio” |
| Poslužitelj | **dok** (niska čelična platforma). **Dizalice-portali = jezgre (CPU)**, **iscrtana mjesta u dvorištu = RAM** (1 mjesto = memorija jednog zahtjeva). Ploča s imenom i specifikacijom | zauzeta dizalica: žuta lampa + narančasta traka napretka; pao: tamna platforma, ploča **PAD**, crvena rotirka, barijera |
| CPU / RAM opterećenje | na dioramu: kontejneri pod dizalicama i u dvorištu; na pločama: segmentirane trake (1 segment = 1 jezgra / 1 mjesto) | narančasto = jezgra radi, žuto = u RAM-u, jantarno = čeka |
| Red (queue) | kontejneri na mjestima u dvorištu (zauzeto mjesto svijetli jantarno) i najviše 2 **kamiona pred vratima** doka sa **žmigavcima** | kad je dvorište puno: **žuta rotirka** na stupu doka i jantarni rub doka; tko nađe i vrata puna, okreće se kao 503 |
| Load balancer | **rampa (portal) preko ceste** s natpisom LOAD BALANCER i **LED pločom** (algoritam, aktivne veze po doku, ▸ sljedeći izbor); na svakom izlazu signal s rampicom | izlazno svjetlo: zeleno = u rotaciji, bljesak = upravo poslan zahtjev; crveno + spuštena rampica = izbačen; „van” na ploči |
| Provjera zdravlja | prsten koji se širi oko svjetla na doku svakih 0,5 s; kvadratići neuspjeha na ploči poslužitelja | zeleni prsten = OK, crveni = neuspjeh; izbacivanje tek nakon 4 neuspjeha (≈ 2 s sim, stvarno npr. 30 s) |
| Dnevnik odluka | tamna LED traka „Dnevnik rampe”: `#id → dok`, za „najmanje veza” i brojevi veza u trenutku odluke (izabrani istaknut) | ishod: vozi · obrada · dvorište · pred vratima · 200 · 503 |
| Baza podataka | **silos** s mjeračem razine sprijeda | razina = popunjenost |
| Kontejner | brodski kontejner s rebrima, vratima i šablonskim natpisom, lampa na krovu | boja = aplikacija/verzija (v1 teal, v2 narančasta, ostalo plava) |
| Slojevi slike | **ploče naslagane jedna na drugu** (OS → runtime → app) s natpisom na boku | dijeljeni sloj = ista boja ploče u više slika |
| Registar | **brod** pun gotovih kontejnera, privezan uz obalu | povlačenje slike = dizalica skida kontejner |
| Pod | kontejner na **tamnoj paleti**, žuta pločica = oznaka (label), lampa na krovu; **duljina = zatraženi CPU** | Running = zelena lampa; **Pending** = stoji u iscrtkanoj čekaonici izvan čvora, žuta trepćuća lampa; ContainerCreating = na čvoru, žuta lampa; CrashLoopBackOff = zaštitna traka, crvena rotirka, trzaj, brojač restarta |
| Čvor (node) | velika čelična platforma s oslikanim mjestima; **ćelije CPU-a na prednjem rubu** i ploča „Čvor N · CPU x/4” | narančaste ćelije = zatraženi CPU; odabrano mjesto za novi Pod pulsira jantarno |
| Klaster / control plane | **kontrolni toranj** (API server + scheduler) s **pločom željenog i stvarnog stanja** („želi 3 · spremno 2 → 3 · čeka 1 → 0”) i **arhiva etcd** (ormar s ladicama) spojena kabelskim kanalom; odluka schedulera = jantarni puls od tornja do mjesta, zatim **portalna dizalica** prenosi Pod | aviacijsko svjetlo tornja: jantarno, sporo „disanje” (crveno pulsira samo kvar) |
| Service | **otpremni kiosk** sa žutim krovom; zeleni točkasti lukovi samo prema Podovima s oznakom koji su Ready | Pod bez oznake (redis) ili ne-Ready nema luk |
| Git commit | **plombirani vagon na kolosijeku**: kolosijek = grana, vagon = commit s kratkim hashem, skretnica = grananje | HEAD = vagon sa zelenom lampom |
| Faza pipelinea | **pokretna traka kroz inspekcijske portale** (build → test → sken), lampa na svakom portalu | zeleno prolaz, crveno zaustavlja traku |
| Secret | **zapečaćena kasica s lokotom**, crtkana veza do Poda; vrijednost se nikad ne ispisuje | slomljen pečat = izloženo (crveno) |
| Argo CD / GitOps petlja | **pilot-vozilo** kruži prstenastom cestom između teretnog lista (Git) i doka (klaster) | drift = kontejner iscrtkanog obrisa sa žutom lampom; sync = pilot ga vrati (puni kontejner, zelena lampa) |

### Primitivi (`iso.tsx`)

`Box`, `Quad`, `Container`, `PodBox`, `Truck` (`beacon`, `placard`, `hazard`, `lights`), `Person`, `Road`, `Area`, `Paint`, `Water`, `Gantry`, `Tower` (aviacijsko svjetlo), `Archive`, `LampPost`, `LampDot`, `RotBeacon` (jantarna / crvena), `Barrier`, `SignBoard`, `HazardBand`, `Silo`, `Lockbox`, `Rails`, `Wagon`, `FaceText` (tekst projiciran na plohu; `fit` ga stisne točno na širinu ploče). Pomoćne funkcije u `iso-math.ts`: `iso`, `pts`, `segs`, `faceMatrix`, `makePath`/`along` (put stalnom brzinom), `vbOf`, `pct`.

**Abeceda luke** (`Grammar.tsx`) je jedan tehnički list: retci = obitelji (A promet, B poslužitelji, C Kubernetes, D isporuka), stupci 1–5, naslovni blok dolje desno. Svaka ćelija ima **isti prozor 176 × 108 jedinica** (samo centriran na crtež), pa su veličine usporedive. Na mobitelu list postaje popis dijelova (crtež lijevo, opis desno).

## Pravila pokreta

1. **Sve što putuje, putuje stalnom brzinom** (linearno, trajanje ∝ udaljenosti) — kamioni, kontejneri na doku, pulsevi, dizalice. Kamion staje samo iza drugog kamiona ili pred vratima doka.
2. **Pomiče se samo ono što mijenja stanje:** bljesak na signalu = odluka o usmjeravanju, rotirka = puno ili kvar, dizalica = raspoređivanje, traka napretka = rad jezgre, prsten = provjera zdravlja, brojka na ploči „otkucava” kad se stanje promijeni.
3. **Treptanje je alarm:** crveno ≈ 1 Hz samo za kvar, žuto/jantarno sporije za čekanje. Toranj „diše” jantarno, ne trepće crveno.
4. **Fokus u objašnjenjima:** u koraku se sve što nije aktivno zatamni na ~30 %, aktivna dionica iscrta se kao debela jantarna (tamo) ili zelena (natrag) isprekidana ruta s brojem koji odgovara kartici koraka.
5. **Ambijent je tih:** valovi na moru, svjetlo tornja; sve staje uz `prefers-reduced-motion` (simulacija tada kreće pauzirana s gumbom „Pokreni”, ilustracije pokazuju reprezentativan kadar).
6. **Izvedba:** simulacije rade u jednoj `requestAnimationFrame` petlji sa stanjem u refovima (model u `sim-model.ts`, bez Reacta), crtaju obične SVG elemente i staju kad nisu na ekranu.

## Model simulacije (`sim-model.ts`)

Zahtjev drži 1 jezgru 2 s (sim) i 0,5 GB RAM-a dok je na poslužitelju; Mali 1 vCPU/2 GB (4 mjesta), Srednji 2/4 (8), Veliki 4/8 (16). Kad je dvorište puno, najviše 2 kamiona čekaju pred vratima; sljedeći dobiva 503. Kružno raspoređivanje dijeli redom (pri 2,25 zahtjeva/s Mali se zaguši: ≈ 0,25 greške/s, p95 ≈ 11 s; „najmanje veza” 0 grešaka, p95 ≈ 5 s). „Najmanje aktivnih veza” bira poslužitelj s najmanje zahtjeva poslanih, a još neodgovorenih (povratna vožnja usporena je radi vidljivosti pa se ne broji). Provjera zdravlja svakih 0,5 s, 4 neuspjeha → izbacivanje (≈ 2 s sim; stvarno npr. 30 s), 2 uspjeha → povratak. Do izbacivanja rampa i dalje šalje zahtjeve srušenom poslužitelju i oni se vraćaju kao 503.

## Priča klastera (`ClusterView.tsx`)

Deployment `klopa-api` želi 3 spremna Poda. Čvor 1: dva v1 Running + jedan v1 u CrashLoopBackOff (3/4 CPU). Čvor 2: redis (bez oznake `app=klopa`, 1/4 CPU). Novi Pod v2 (2 CPU) pojavi se u čekaonici (Pending), scheduler bira jedini čvor s 2 slobodna CPU-a (čvor 2), dizalica ga prenese (ContainerCreating), postane Ready i Service mu počne slati promet — ploča na tornju otkuca „spremno 3 · čeka 0”. Isto stanje prikazuje i `kubectl get pods` u terminalu.

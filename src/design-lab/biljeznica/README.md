# Bilježnica — smjer dizajna

**Koncept.** Tečaj je bilježnica jednog vrijednog studenta: crteži olovkom, markeri, ljepljivi papirići, isječci zalijepljeni selotejpom i bilješke na margini (u duhu Julia Evans „Wizard Zines” i sketchnotesa). Svaki pojam iz raspodijeljenih sustava pretvara se u priču iz menze (Klopa, Lana, Davor, teta Mira), a apstraktne stvari postaju predmeti koje svi poznaju: zahtjev je pladanj, load balancer je redar na ulazu, Pod je kutija za ručak. Svijetla tema je papir na stolu, a tamna je školska ploča na zidu (kreda, magneti umjesto selotejpa, drveni okvir), pa je to ista bilježnica u drugom materijalu, a ne invertirane boje.

Prototip: `/dizajn/biljeznica` · kod: `src/design-lab/biljeznica/`

## Paleta (tokeni na `.root`, tamna tema na `.root[data-theme='dark']`)

Boje imaju značenje kao pribor u pernici: **grafit** je tekst, **plava kemijska** su veze i interakcija, **crvena olovka** je greška ili ispravak, **zelena** je uspjeh, a **markeri** označavaju ono što treba zapamtiti.

| Token | Papir (svijetla) | Ploča (tamna) | Uloga |
|---|---|---|---|
| `--desk` | `#c9b38c` kraft | `#141a17` zid | pozadina iza lista |
| `--paper` | `#fbf6ea` | `#2f4138` ploča (svijetli škriljevac) | list / ploča |
| `--paper-2` | `#f4ecda` | `#36493f` | umetci (milimetarski papir) |
| `--ink` | `#26231d` grafit | `#f2f1e9` kreda | tekst, linije crteža |
| `--ink-2` | `#4b4538` | `#d7ddd4` | sekundarni tekst |
| `--ink-3` | `#6f6551` | `#aab6ac` | pomoćne linije, oznake |
| `--pen` | `#2148b0` kemijska | `#a8d0f7` plava kreda | poveznice, odabrano, health check |
| `--red` | `#c92e26` crvena olovka | `#ff9b87` | greške, mitovi, ✗ |
| `--green` | `#1b7a44` | `#a8e9b2` | uspjeh, ✓, Running |
| `--hl-yellow/pink/green/blue/orange` | prozirni markeri (α 0,4–0,6), potez preko riječi | **gotovo neprozirna obojena kreda** (α 0,8), bočni šrafirani potez *ispod* riječi | isticanje teksta i koda (isti `Mark`) |
| `--hl-*-ink` | `#e4b400` `#e2588a` `#2ea866` `#3b79de` `#ee8722` | pastelne krede | šrafura u crtežima (majice, kutije) |
| `--tray` / `--food` | `#f3a43c` / `#d9662f` | `#f0b25e` / `#f08a5a` | pladanj (zahtjev) / hrana na tanjuru (RAM u upotrebi) |
| `--note-*` | `#fde89c` `#fbd0dd` `#d2efdb` `#d5e5fa` | prigušeni papirići `#e4d48d`… | ljepljivi papirići (uvijek tamni tekst `#2a251a`) |
| `--term-bg` | `#1e1d1a` | `#0f1613` | ekran Lanina laptopa |
| `--note-orange/lilac` | `#fcd6ad` / `#e4d8f6` | `#ebc9a3` / `#d3c7e6` | indeksne kartice modula 5 i 6 |
| `--coffee` | smeđi trag šalice | blijeda mrlja krede | rubni crtež |

Kontrast: tekst `--ink` i `--ink-2` ≥ 7:1 u obje teme, `--ink-3` ≥ 4,5:1, `--red`/`--green`/`--pen` ≥ 5:1 na podlozi.

**Ploča (tamna tema) je materijal, ne inverzija:** škriljevac `#2f4138` s velikim mekim tragovima spužve (`--eraser`, SVG potezi s blurom), sloj „krede” (`--chalk-grain`: sitne rupice boje ploče u svakoj liniji i slovu), krupni naslovi imaju masku zrnatosti (`--chalk-mask`), a pune linije iz `Rough` dobivaju sitne prekide (`stroke-dasharray`) kao kreda koja preskače.

**Pravilo slojeva na ploči:** sve što je *nacrtano kredom* (crteži, okviri, ispitni list) leži *ispod* sloja prašine; sve što je *pričvršćeno na ploču* (papirići, kartica s koracima, list s kodom, ekran laptopa, objašnjenje u kvizu) leži *iznad* njega (`z-index: 5`) i ostaje čisto, s magnetom umjesto selotejpa. Ispitni list na ploči nije prozirni papir nego list nacrtan kredom: obris + presavijeni kut.

## Tipografija

| Uloga | Font | Zašto |
|---|---|---|
| Naslovi, nazivi u crtežima | **Bricolage Grotesque** (800, `font-stretch` 78–90 %) | stisnuti, debeli „zine” naslovi s karakterom |
| Tekst predavanja | **Newsreader** (opsz, 19,5 px / 1,62; kurziv za podnaslove) | topao, knjiški, vrlo čitljiv |
| Gumbi, nazivi kartica, naslovi u papirićima | **Bricolage Grotesque** (600–800) | tiskani glas sučelja |
| Bilješke na margini, oznake u crtežima, kickeri | **Caveat** (≥ 17 px) | brzi rukopis autora bilježnice |
| **Ono što likovi govore** (oblačići, „Davor: …”, „Lana: …”, „Teta Mira: …”) | **Kalam** (≥ 18 px) | drugi glas: kad netko *govori*, piše uredno i ravno — Caveat i Kalam se nikad ne miješaju u istoj ulozi |
| Kod, terminal, metrike, specifikacije | **IBM Plex Mono** | ispis s pisaćeg stroja / printera |

Rukopis se nikad ne koristi za dulji tekst (više od 2 retka) osim u oblačiću ili papiriću lika. Svi fontovi imaju latin-ext (č ć đ š ž).

**Pravilo čitljivosti crteža:** svaki SVG ima više rasporeda (široki / srednji za tablete / uski za mobitel) koji se biraju prema *širini spremnika*, a ne prema širini prozora. Veličine slova u crtežu odabrane su tako da na najužoj širini svakog rasporeda budu ≥ 12 px na ekranu (mjereno skriptom koja prolazi kroz sve `<text>` elemente). Uski raspored nikad ne raste preko ~460 px (`max-width`), pa se mobilni crtež ne „napuše” na tabletu. Strip od tri sličice ispod 1200 px postaje vodoravna traka koja se povlači prstom (`scroll-snap`, sljedeća sličica viri, bilješka „povucite →”).

## Gramatika ilustracije

Sve crta isti „pribor”: `roughjs` (`Sketch.tsx` → `Rough`, `Boil`, `RoughBox`, `Arrow`, `Cross`, `Check`), debljina olovke 1,2–2 px, `roughness` ≈ 1,1, šrafura pod −41°. Boje dolaze isključivo iz tokena.

| Entitet | Kako se crta |
|---|---|
| Korisnik / student | Okrugla glava (elipsa), točkice za oči, tijelo-trapez šrafirano markerom, mobitel u ruci, noge kad stoji u redu. Studenti su anonimni (frizure i boje se izmjenjuju). |
| Likovi priče | Tri **različite siluete** koje se prepoznaju i kao sićušni crteži: **Lana** (developerica) — vitka, rep i naočale, laptop `</>`; **Davor** (dežurni „čovjek za poslužitelje”) — hoodie s podignutom kapuljačom i džepom, raščupani šiški, **pager** koji zuji crveno kad stižu greške; **teta Mira** (kuharica u menzi) — široka, pregača s džepom, rumeni obrazi, kuharska kapa, kutlača. Likovi **govore** u ključnim trenucima (oblačić, Kalam): Davor u priči („Dodao sam još dva poslužitelja… i opet pada!”) i u simulaciji („502! 502!” dok redar još šalje na srušeni poslužitelj, pa „Izbačen. Uf.” kad ga health check izbaci), Mira u analogiji i kad je odgovor točan, Lana uz `replicas: 3` u kodu. |
| Oblačić | Elipsa koja raste prema tekstu + **kratak, zakrivljen klin** usmjeren prema ustima (najviše ~18 jedinica dug); oblačić je uvijek uz glavu i u praznom dijelu sličice, nikad preko drugog crteža. |
| Promet (λ) | **Red studenata pred menzom**: broj ljudi u redu raste s klizačem (2 osobe pri 2/s, 12 zbijenih pri 30+/s); kad je promet velik, nestrpljivo tapkaju nogom. Brojka uvijek i rukopisom („22 narudžbi u sekundi”). |
| Zahtjev u letu | Narančasti **pladanj** s tanjurom i čašom (`<symbol>` + `<use>`), najveći pokretni predmet na crtežu (≈ 36 px u simulaciji). Putuje ravno i stalnom brzinom po olovkom nacrtanoj „cesti” (1,5 px, siva). |
| Uspjeh | Zelena kvačica ✓ (rukom) **na margini** desno od kartice poslužitelja, diže se i blijedi (najviše dvije po poslužitelju odjednom — nikad preko mjerača); status `200 OK` zelenom olovkom; u koracima povratni put je zelena iscrtkana linija. |
| Greška | Pladanj pada i okreće se **na ulazu poslužitelja** (ispred reda, nikad preko kartice), crveni nažvrljani ✗ ostane ~0,9 s. Ruta koju je health check izbacio: crvena iscrtkana linija s velikim ✗. |
| Timeout | Pladanj stoji u redu, a uz njega crveni sat (kružić s kazaljkama) koji se „puni”; nakon isteka ✗ s oznakom `504`. |
| Poslužitelj (CPU/RAM) | Kartica s **licem u okruglom „okancu”** (≈ 44 px, gore desno, čita se izdaleka): mirno → ravna usta i obrve → panika (izbuljene oči, otvorena usta, kapi znoja, drhtanje) → X oči. **Mozak** = jedan nacrtani mozak po jezgri, šrafira se odozdo koliko je jezgra zauzeta. **Tanjuri** = RAM: tanjur s rubom po mjestu za istodobni zahtjev, hrana na tanjuru = zahtjev u obradi. Ispod: `CPU 64 % · RAM 1,5/2 GB`. Gore desno plavom kemijskom broj veza („3 veze”). |
| Srušen poslužitelj | Mjerači se „izbrišu” na 20 %, rijetka crvena šrafura, X oči ostaju na vrhu, a pečat **SRUŠEN** ima papirnatu podlogu da se uvijek može pročitati. |
| Load balancer | **Redar** u reflektirajućem prsluku `LB`, stoji u vratima menze („ULAZ · MENZA”). Ruka s lizalicom pokazuje kamo je otišao zadnji pladanj (u objašnjenjima se polako okreće prema cilju). **Kapi znoja** (0–3) rastu s punoćom najpunijeg reda. Uz njega **podložak** s health checkom: ✓ zdrav, ✗ 2/4, prekriženo „izbačen”, „kuc-kuc!” pri svakoj provjeri. |
| Red čekanja | Iscrtkani prazni pretinci iznad kartice (natpis „red”); pladnjevi u njima čekaju. Pun red = sljedeći pladanj pada pred vratima. |
| Baza podataka | Rukom nacrtan valjak (elipsa + tijelo), npr. `etcd`. |
| Kontejner | Kutijica s hranom unutar Poda, šrafirana bojom verzije. |
| Slojevi slike | Naslagani pladnjevi/kutije jedna na drugoj, svaka s oznakom sloja (`FROM`, `COPY`, …); donji su zajednički (isti seed), gornji nova boja. |
| Pod (stanja) | **Kutija za ručak** s ručkom, imenom (`klopa-api`) i trakom verzije. **Running**: puna linija, lice se smiješi, zeleni status i ✓ „spreman”. **Pending**: iscrtkana, blijeda, pospano lice, „čeka čvor…”, a scheduler prema njoj vuče plavu iscrtkanu strelicu „traži mjesto…”. **CrashLoopBackOff**: crvena linija i crvena šrafura, X oči, `↻ 4 · pauza pa ponovo`, povremeno veliki ✗. |
| Verzije v1 / v2 | Komadić selotejpa u kutu: v1 plavi, v2 zeleni; šrafura im ide u suprotnim smjerovima (−41° / +41°), pa se razlikuju i bez boje. |
| Čvor (node) | Veliki grubi pravokutnik `čvor 1 (worker · 4 vCPU · 8 GB)`, dvije „trake goriva” (CPU, RAM) popunjene markerom prema rezerviranim resursima; prazno mjesto je iscrtkani okvir „slobodno”. Na mobitelu zaglavlje drugog čvora ide na dno, da žice ne prelaze preko natpisa. |
| Klaster / control plane | Dvostruka plava linija (kemijska), kormilo nacrtano rukom, pretinci `API server`, `scheduler`, valjak `etcd`. Odluka schedulera = crvena strelica „② ovdje ima mjesta!”. |
| Priča u crtežu | Numerirana bilješka (① ② ③, Caveat, boja koraka: plava → crvena → zelena) stoji **uz ono što se u tom koraku mijenja**, sa strelicom; ispod crteža su „Korak N / 3”, točkice i Natrag / Dalje / Ponovi — priča se sama odvrti jednom, ali čitatelj može ići svojim tempom. |
| Service | **Privjesak / etiketa** s rupicom: `Service klopa-api` + `selector: app=klopa-api`. Studenti s lijeva šalju pladnjeve *u* etiketu; iz nje izlaze zelene strelice koje završavaju na **priključku** (zelena točkica na rubu kutije za ručak) svakog spremnog Poda — nikad na rubu čvora — a prema nespremnima siva iscrtkana linija s ✗ i prazan, iscrtkan priključak. |
| „Rječnik menze” (Rosetta) | Uz svaki prvi susret s Kubernetes pojmom crta se redar koji drži etiketu i bilješka `redar = Service`, `pult / poslužitelj = Pod`, `zgrada menze = čvor`. Analogija i stvarni pojam uvijek stoje jedan uz drugi. |
| Git commit | Kružić-pečat na „uzici” (vremenska crta olovkom), kratki hash rukopisom; grana = linija druge boje markera. |
| Faza pipelinea | Ladice/kartice spojene strelicama (build → test → push); prolaz = zelena kvačica, pad = crveni ✗ i precrtano; trenutna faza zaokružena crvenom olovkom. Na karti tečaja: tri kućice i kvačica. |
| Tajna (Secret) | Zatvorena omotnica s voštanim pečatom (crvena elipsa); sadržaj se prikazuje kao `••••` i nikad kao tekst. |
| Argo CD / GitOps petlja | Dvije plave polukružne strelice (petlja) između bilježnice (Git = izvor istine) i klastera; mali „ravnatelj” s povećalom uspoređuje crtež i stvarnost: razlika = narančasti marker „OutOfSync”, poravnato = zelena kvačica „Synced”. |
| Terminal | **Lanin laptop**: ekran s grubim okvirom, kamerica, naljepnica „Klopa”, tipkovnica i touchpad olovkom. Na mobitelu se izlaz preslaže u retke (`ime`, pa `READY · STATUS`), da poanta (npr. `CrashLoopBackOff`) nikad ne bude odrezana. Uz važnu liniju zalijepljen papirić s komentarom lika i strelicom. |
| Kod | Stranica milimetarskog papira zalijepljena selotejpom, grubi okvir, brojevi redaka **olovkom** (Caveat), naziv datoteke na žutom papiriću, „Kopiraj” je gumb nacrtan olovkom. Isticanje u kodu koristi **isti marker** kao tekst (`Mark`): počinje na tokenu, ne na margini. Bilješke na margini plavom kemijskom. |
| Provjera (kviz) | Ispitni list s crvenom marginom, linijama i presavijenim kutom (na ploči: list nacrtan kredom); polja „Ime: Lana K.” i „Bodovi: _ / 1”. Odabrani odgovor zaokružen plavom kemijskom; netočan precrtan crvenom; ocjena „✓ Točno!” / „✗ Ne baš…”, bodovi zaokruženi crvenim. Objašnjenje je papirić s likom koji reagira (teta Mira kad je točno, Davor kad nije) **odmah ispod odabranog odgovora**, s kratkom strelicom gore prema njemu (zelena / crvena) — strelica nikad ne pokazuje na drugi odgovor. Učitava se **neodgovoren**. |
| Mit → činjenica | Mit je zgužvani ružičasti papirić, **najprije čitljiv i čist**; ~0,7 s nakon što uđe u vidno polje svaki redak precrta *jedna* valovita crvena linija (tekst ostaje čitljiv ispod nje), zatim iskoči „NE!” i krivudava strelica prema činjenici. |
| Pojmovnik | Zadnja stranica bilježnice: pojam (Bricolage) + „= slika iz menze” (Caveat, crveno) + jedna rečenica, a uz svaki pojam njegov **mali crtež iz gramatike** (pladanj sa strelicama = load balancer, podložak s ✓/✗ = health check, histogram s crvenom crtom = p95, pladanj na podu s ✗ = 502/503, kutija za ručak = Pod, etiketa = Service, zgrada s pretincima = čvor, crvena kutija sa strelicom ↻ = CrashLoopBackOff, povećalo nad praznim mjestom = scheduler). |
| Navigacija tečaja | **Karta tečaja**: šest stanica (poslužitelj, kutija, kormilo, kućice pipelinea, GitOps petlja, zastavica) na točkastoj olovnoj stazi; Lana hoda do trenutne stanice, koja je zaokružena crvenom. **Kazalo**: rukom pisani sadržaj s točkicama do broja stranice, kvadratići za kvačice, pečat ZAVRŠENO i crvena **vrpca-straničnik** na predavanju koje čitate; moduli su obojene indeksne kartice koje vire iz desnog ruba bilježnice. |

### Naslovi odjeljaka: jedan sustav

Svaki odjeljak ima **isti kostur**: crveni rukom pisani kicker „**N** · oznaka” uvijek na istom mjestu iznad tiskanog naslova (Bricolage 800). Mijenja se samo mali **rekvizit** nacrtan uz naslov (96 × 72, ista olovka): sat u 12:00 (priča), munja (isprobajte · pokvarite), kormilo (Kubernetes), flip-book od tri sličice (korak po korak), tri kutije za ručak ×3 (kod), zaokruženi „?” (provjera), kazalo A–Ž s jezičcima (pojmovnik). Na mobitelu rekvizit se smanji i stane desno od kickera. Moduli su obojeni papirnati jezičci-razdjelnici: na širokom ekranu vire iz desnog ruba bilježnice, a na užem stoje na gornjem rubu sadržaja (isti papir, ne „pilule”); na mobitelu samo otvoreni jezičac ima ime.

## Pravila pokreta

1. **Stvari se miču samo kad se mijenjaju podaci ili stanje.** Pladanj leti jer zahtjev putuje; lice se mijenja jer se mijenja opterećenje; ruka redara se okreće jer je odabrao poslužitelj.
2. **Zahtjevi idu ravno i stalnom brzinom** (linearno, bez easinga) — brzina je jednaka za sve rute, pa duža ruta znači dulji put. Simulacije: model u refu/stanju, `requestAnimationFrame`, obični SVG elementi (ne Motion komponenta po zahtjevu).
3. **„Crtanje”**: obrisi i podcrtavanja se iscrtaju (`pathLength` 0 → 1, 0,4–0,9 s) kad uđu u vidno polje, samo jednom. Markeri se „povuku” s lijeva na desno (`background-size`).
4. **„Boil”**: likovi i ključni crteži imaju tri verzije istog crteža (različit seed) koje se izmjenjuju ~4 puta u sekundi (sporo: ~2,5×). Nikad na tekstu ni na simulaciji (da ostane mirno i čitljivo).
5. **Stanje se vidi na licu i tijelu**: lice poslužitelja, kapi znoja redara (prema punoći reda), duljina reda studenata (prema prometu), tapkanje nogom kad je gužva. Sve to se mijenja samo kad se promijeni model.
6. **Objašnjenja korak po korak**: u svakom koraku prvo se nacrta ruta (maska `pathLength`, 0,7 s), tek onda po njoj krene pladanj; prethodni koraci ostaju kao blijeda olovka, a ruka redara se polako okrene prema cilju.
7. **Greške su glasne, uspjesi tihi**: ✗ ostaje ~0,9 s i pladanj pada; ✓ samo kratko iskoči.
8. **Bilješke na margini reagiraju na stanje** (npr. „Veliki je pao prije 1,2 s, a redar mu i dalje šalje!”) — pojavljuju se i nestaju fadeom od 0,25 s. Na širokom rasporedu metrike stoje u praznom gornjem lijevom kutu crteža (≥ 24 px od redova), a cijela simulacija s kontrolama stane u prozor od 900 px.
11. **Likovi reagiraju na događaje, ne na sat**: Davorov pager zuji samo dok redar šalje na srušeni poslužitelj; oblačić se mijenja kad health check izbaci ili vrati poslužitelj.
9. **Smanjeno kretanje** (`prefers-reduced-motion`): nema boila ni letenja, simulacija kreće pauzirana (gumb „pokreni”), stripovi, karta i klaster prikazuju konačno stanje, markeri su odmah povučeni.
10. Simulacija radi samo dok je vidljiva (IntersectionObserver) i dok je kartica aktivna.

## Datoteke

- `index.tsx` — stranica, fontovi, tema (`useTheme` iz školjke: poštuje sustav i `localStorage['k8s-lekcije:theme']`)
- `useSize.ts` — mjerenje elemenata (RoughBox, RoughButton, RoughAround), uži raspored crteža, vidljivost
- `Sketch.tsx`, `roughGen.ts` — rukom crtani primitivi (roughjs generator, keš putanja, boil, `RoughButton`, `RoughAround` = elipsa olovkom mjerena prema tekstu, `Scribble`)
- `Doodles.tsx` — likovi, student u redu, redar (sa znojem), lica poslužitelja u okancu, pladanj, oblačić, kormilo, Davor koji viri, trag šalice
- `Bits.tsx` — marker, selotejp, `SecHead` + rekviziti naslova (`PropClock`, `PropBolt`, `PropHelm`, `PropFlip`, `PropBoxes`, `PropQuestion`, `PropIndex`), definicija pojma (tooltip), rubni crteži
- `LbSim.tsx`, `lbModel.ts`, `simGeometry.ts` — simulacija load balancera (model: CPU dijeljen među zahtjevima, RAM = broj mjesta, red 6, health check svakih 0,5 s / 4 neuspjeha zaredom → izbacivanje 1,5–2 s nakon pada); tri rasporeda: široki (≥ 840 px), srednji za tablete (580–840 px, poslužitelji jedan do drugoga), uski za mobitel (< 580 px, najviše 460 px širok)
- `Lesson.tsx` — kurikulum, zaglavlje predavanja, priča (mit s odgođenim precrtavanjem), **pojmovnik** (`#pojmovnik`, na njega vodi poveznica u zaglavlju) i podnožje
- `Cluster.tsx` — klaster u tri rasporeda (široki ≥ 890 px, srednji 560–890 px, uski s 2 mjesta po čvoru), priča u tri koraka s kontrolama
- `Stepper.tsx`, `CodeQuiz.tsx`, `Hero.tsx`, `Header.tsx` — ostali dijelovi

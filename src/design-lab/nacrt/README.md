# Nacrt — smjer dizajna (rev. D)

**Koncept.** Tečaj je inženjerski projekt, a svaka stranica je komplet tehničkih listova: okvir sa zonama koje na svakom listu kreću od A, sastavnica (title block) umjesto zaglavlja predavanja, revizije umjesto „changeloga”, pečat umjesto kvačice i popis pojmova kao sastavnica dijelova. Sustavi se crtaju kao instalacije: zahtjevi teku cijevima stalnom brzinom, load balancer je razdjelnik u presjeku (kućište s provrtima i brojačem otvorenih veza na svakom izlazu), Service je razdjelnik sa zasunima, poslužitelji su izmjereni kotama i šrafirani prema opterećenju, a očitanja su instrumenti (pisač na traci, manometar, crtice na margini). Precizna linija je sustav; ruka provjeravatelja (crvena olovka, rukopis, revizijski oblak, pokazna linija do dijela) su kvarovi, ispravci, mitovi i ograde, a **upravljački elementi su dijelovi crteža** (ravnalo, preklopnik, jezičci na kućištu), nikad ploča obrazaca ispod njega.

Prototip: `/dizajn/nacrt` · datoteke u ovoj mapi.

## Paleta

Svjetla tema je paus papir (velum) s grafitom, plavom olovkom i crvenom olovkom za ispravke. Tamna tema je cijanotipija: tamnoplavi pruski papir s neravnomjernom ekspozicijom i tamnijim rubovima, cijan-bijela linija (čisto bijela samo za naglasak), žuta kreda za izmjene, koraljna za ispravke. Uloge su iste, mijenja se samo materijal.

| Token | Uloga | Svjetlo (paus) | Tamno (cijanotip) |
|---|---|---|---|
| `--paper` | papir | `#f2eee3` | `#0f3463` |
| `--print-bg` | papir pisača, prozorčići brojača, traka zapisnika | `#fbfaf5` | `#0d305c` |
| `--grid-1` / `--grid-2` | mreža 16 px / 80 px | `rgba(40,74,128,.07/.13)` | `rgba(170,212,255,.07/.145)` |
| `--ink` | tekst | `#1c1f24` | `#f5f9ff` |
| `--ink-2` | sekundarni tekst | `#4a4f58` (7,1:1) | `#c0d6ec` |
| `--ink-3` | najtiši tekst | `#5d636c` (5,2:1) | `#8fb3d6` |
| `--line` | linija crteža, šrafura | `#262a31` | `#dcecfd` (cijan-bijela) |
| `--line-2` | **samo** konstrukcijske linije, zidovi u presjeku, prazna mjesta (nikad tekst) | `#8f97a2` | `#79a7d8` |
| `--pencil` | olovka izmjena: novo, odabrano, zdravo, odgovor, v2, sljedeći izbor | `#1c56a5` | `#ffd966` |
| `--red` | crvena olovka: kvar, greška, preopterećenje, mit, ograda | `#bf3227` (4,9:1) | `#ff8b72` |
| `--sepia` | brojevi u kodu | `#8a5414` | `#9fdcff` |

Tekstura: zrno papira (feTurbulence 0,9) + mrlja (0,003); u tamnoj temi još velike mrlje ekspozicije (0,0013, ±5 %) i vinjeta vidnog polja (rubovi tamniji, kao nacrt pod lampom). Nema gradijenata u bojama, staklenih ploča, mekih sjena ni markera. Tekst preko šrafure stoji na pločici boje papira (`PlateText`).

## Tipografija

| Uloga | Font | Zašto |
|---|---|---|
| Naslovi, imena dijelova, brojevi | **Barlow Condensed** 500/600/700 | uska inženjerska slova poput DIN natpisa |
| Tekst | **IBM Plex Sans** 400/500/600, 17–18 px | čitljiv, tehnički, puna latinica (č ć đ š ž) |
| Kote, oznake, sastavnica, kod, instrumenti | **IBM Plex Mono** 400–600 | šablonska slova za kote |
| Ruka provjeravatelja | **Caveat** (samo crveno, ≥ 20 px) | napomene, „ne”, „Gdje analogija ne vrijedi”, „LB još ne zna…” |

Najmanji tekst na ekranu je 11 px. Veliki crteži imaju dva rasporeda: **široki** (fiksni viewBox, od 860 px širine crteža) i **uski**, crtan **1 jedinica = 1 px** za stvarnu širinu. `MJ 1:1`, `LIST 04` i slične oznake nikad se ne lome (nerazdvojni razmak).

## Konvencije linija (jedna legenda za sve detalje)

| Linija | Značenje |
|---|---|
| puna | postoji i radi (u rotaciji, Ready) |
| crtkana (skrivena) | još ne postoji: Pending, ContainerCreating; **onemogućena kontrola** |
| lančana (crta-točka) | postoji, ali ne prima promet: izlaz izvan rotacije, Running · nije Ready, Pod u CrashLoopBackOff |
| točkasta | povratna traka (odgovori) |
| signalna (tanka, s oznakama //) | upravljanje, nikad korisnički promet: api-server ↔ kubelet, kasnije Argo CD ↔ klaster |
| crvena olovka (roughjs) | kvar, greška, ispravak, mit, ograda analogije |
| olovka izmjena (plava / žuta) | novo, odabrano, zdravo, odgovor, sljedeći izbor |
| deblja linija iste boje | odabrano (nikad ispuna) |

**Kontrole** su ćelije sastavnice: vanjski obrub + tanka unutarnja linija (dvostruki okvir). Hover oboji unutarnju liniju olovkom, pritisak je podebljava; onemogućena kontrola je crtkana. Crveno ima samo jezičac poslužitelja dok ciljate na njega ili dok je poslužitelj stvarno pao. Glavni CTA je tamna traka sastavnice s unutarnjom svijetlom linijom; strelica se na hover produlji kao kota.

## Gramatika ilustracije

| Entitet | Kako se crta | Gdje u prototipu |
|---|---|---|
| Korisnik / student | arhitektonska figura u mjerilu (glava, ramena, pločica mobitela); u tlocrtu elipsa ramena + glava; gomila ima kotu „≈ 400 studenata” | `Person`, hero, detalj A, tlocrt |
| Zahtjev u letu | puna točka s križićem (nišan), boja tinte, ortogonalne cijevi, **jedna stalna brzina** za cijeli crtež | `#…-req` u `Defs` |
| Uspjeh / odgovor | otvoreni ševron „‹” olovkom, okrenut u smjeru kretanja, na točkastoj povratnoj traci **22 jedinice** ispod ulazne cijevi; brojač „✓ N odgovora” kod izvora. Šuplji krug je rezerviran za slobodno mjesto u redu | `#…-res` / `-resL` / `-resU` |
| Greška (502/503) | crveni križić olovkom na mjestu kvara (ulaz mrtvog poslužitelja, kraj punog reda, LB), blijedi 0,9 s; zbraja se crticama na margini (prazna „vrata” su unaprijed povučena konstrukcijskom linijom); na poslužitelju „503 × N” | `#…-err`, `ErrorTally` |
| Timeout (504) | točka stane i postane crtkani prsten; crvena kota duž cijevi od slanja do odustajanja („5 s”) i natpis 504 | pravilo |
| Poslužitelj | kućište s natpisom i kotama; **jezgre** = kvadratići (1 = 1 vCPU) šrafirani do zauzetosti (crveno križno > 92 %); **RAM** = traka u mjerilu (20 jed./GB) od mjesta po 256 MB, točkice = sustav, plava šrafura = čeka bazu; u zaglavlju grafitni jezičac „⊗ Sruši” | `ServerWide`, `ServerTall` |
| Pao poslužitelj | crveni obrub, križ olovkom preko tijela (ne preko natpisa), pečat PAO; jezičac postaje crveni „Popravi”; dok se diže, obrub je lančan i piše „pokreće se…” | detalj A |
| Load balancer | **razdjelnik u presjeku**: kućište sa šrafiranim zidovima, provrt od ulaza do okretnog birača (krug s kazaljkom), od birača jednako dugi provrti do izlaza; na svakom izlazu prozorčić brojača s **otvorenim vezama**; trokut olovkom ▸ = sljedeći izbor (kružno: na redu; najmanje veza: najmanji brojač); provrt kojim je upravo prošao zahtjev zasvijetli olovkom. U shematskim crtežima (hero, slijed) samo okretni birač | `Housing`, `Rotary` |
| Algoritam | preklopnik s dva položaja (poluga se okrene), uz ulaz u razdjelnik; na uskom crtežu pločica u gornjem desnom kutu | `AlgoSwitch` |
| Zasun i provjera zdravlja | na svakom izlazu leptir-zasun: otvoren = u rotaciji, zatvoren crveni = isključen (cijev postaje lančana, brojač crtkan s „—”); uz zasun „HC ✓ / HC ✗ 1/2” (ono što LB **misli**), puls oko zasuna pri svakoj provjeri; provjeravatelj zaokruži očitanje i dopiše objašnjenje | `Branch`, `Valve`, `NoteRing` |
| Red čekanja | perle na izlaznoj cijevi ispred poslužitelja; prazno mjesto = šuplji krug (jedino značenje šupljeg kruga) | detalj A |
| Promet (λ) | ravnalo 0–40, pokazivač olovkom, crvena kota kapaciteta; pravi `<input type="range">` leži točno na njemu | `RateRuler` |
| Baza podataka | cilindar (posuda iz P&ID shema) | `Cylinder` (etcd) |
| Jezgre vs. RAM | ključne riječi dobivaju **kotnu zagradu olovkom** s oznakom presjeka koji ih objašnjava; **presjek A–A**: otvor s onoliko prolaza koliko jezgri; **presjek B–B**: spremnik u presjeku (šrafirani zidovi i dno), zahtjevi leže na dnu red po red, iznad njih razina ▽ i crtkana linija „max N”; kad je pun, razina i ▽ postanu crveni i tek tada se na ulazu pojavi ✕ | `KeyIdea` |
| Kontejner | pravokutnik unutar Poda; v2 šrafiran olovkom | `Pod` |
| Slojevi slike | presjek (strati): slojevi naslagani, svaki svojom šrafurom i pozicijskom oznakom, kota ukupne veličine; dijeljeni sloj ima istu šrafuru | pravilo |
| Pod | šesterokut. Running · Ready: puna linija + unutarnji obrub; Running · nije Ready: lančana; ContainerCreating: crtkana; Pending: crtkana bez kontejnera, s „?”; CrashLoopBackOff: crvena olovka, križ, strelica ponovnog pokretanja i „×N” (isti Pod, isti broj: ×4 u heroju, klasteru i legendi); Terminating: točkasta. **v1** tinta, **v2** olovka + revizijski trokut „2”. Ogranak do Poda: pun s otvorenim zasunom samo za Ready, inače lančan sa zatvorenim crvenim zasunom | `Pod`, `Legend`, hero rev. C, detalj B |
| Čvor | kućište „ČVOR-n · 4 vCPU · 8 GB”, trake zauzetosti (ćelija = 1 vCPU / 1 GB; šrafura = zahtjevi Podova, točkice = sustav i drugi); u njemu blok **kubelet** | `Node` |
| Klaster / control plane | dvostruki okvir; kube-scheduler → **kube-apiserver** ← controller-manager, etcd na apiserveru; od apiservera **signalna linija** (//) do kubeleta na svakom čvoru, natpis u kurzivu „upravljanje: …”; odluka schedulera putuje njome kao romb olovkom | `ControlPlane`, `Cluster`, `SignalLine` |
| Service | isti razdjelnik kao load balancer + sabirnica ispod čvorova; na usponu prema svakom Podu zasun: otvoren za Ready, zatvoren crveni za ostale; točke teku samo kroz otvorene | detalj B |
| Git commit | geodetska točka (krug s križem) na osnovnoj liniji, kratki hash kao kota; grana = paralelna odmaknuta linija, merge = spojna linija sa strelicom | pravilo |
| Faza pipelinea | blok procesnog dijagrama sa strelicama toka; prošla = pečat „Odobreno”; pala = crveni revizijski oblak + trokut; u tijeku = obris koji se iscrtava | pravilo |
| Tajna (Secret) | zapečaćena kutija: puni križni presjek (ništa se ne vidi unutra), krug pečata, vrijednost uvijek „••••”; veza do nje je signalna linija | pravilo |
| Argo CD / GitOps | regulacijski krug: Git = zadana vrijednost → usporednik (krug s +/−) → klaster → povratna veza signalnom linijom; odstupanje = crveni oblak na koti razlike; sinkronizacija = strelica koja se iscrta | pravilo |
| Promjena stanja | ne mijenja se oblik nego **konvencija linije**; promjena dobiva red u tablici revizija (trokut sa slovom, vrijeme, opis) | tablica revizija, događaji klastera |
| Završeno / odobreno | pečat s dvostrukim rubom i istrošenom bojom | `Stamp`, popis listova, podnožje |
| Mit / ispravak | tvrdnja u veličini teksta unutar revizijskog oblaka koji je provjeravatelj nacrtao rukom (lukovi nejednake duljine i ispupčenja), precrtana 1,5 px **iznad** visine malih slova pa ostaje čitljiva; ispravak nosi težinu: trokut „Ispravak” + rečenica u naslovnom pismu | `Story` (`Myth`, `handCloud`) |
| Ograda analogije | rukopis crvenom olovkom bez okvira, s pokaznom linijom koja kroz slobodan prolaz u tlocrtu dolazi do dijela o kojem govori (osoba na ulazu, balon 2) | `Story` (`Analogy`) |
| Provjera znanja | kontrolni list: uvjeti u tablici, odgovori na linijama; provjeravatelj zaokružuje olovkom (plavo + pečat TOČNO, crveno + precrtano + „ne”); obrazloženje je **revizijska bilješka** pričvršćena ispod odgovora: kratka pokazna linija od zaokruženog slova do trokuta s istim slovom | `Quiz` |
| Pojmovnik | točkasto podcrtan pojam + pozicijski balon s brojem; definicija kao napomena s pokaznom linijom (pomiče se bočno da nikad ne izađe iz ekrana); isti brojevi u **popisu pojmova** (sastavnici) na dnu lista, s vezom na list gdje se pojam prvi put javlja | `Term`, `glossary.ts`, `PartsList` |
| Kod | list K-01: izvadak samo s recima koji nose napomene, izostavljeni retci kao lomna linija („7 redaka”), baloni na margini s izlomljenim pokaznim linijama | `CodeSheet` |
| Ispis terminala | traka pisača s rupicama; na mobitelu skraćena imena (`…-2xkqp`) | `Printout` |
| Slijed (korak po korak) | tri detalja iste sklopke jedan uz drugi; trenutni u punom okviru i punoj liniji, ostali u crtkanom okviru i blijedoj konstrukcijskoj liniji; tekst je uvijek pune tinte | `Stepper` |
| Odjeljak / list | oznaka presjeka (broj / list n/6); bočne trake okvira sa zonama koje na svakom listu kreću od A | `SectionMark`, `Part` |

## Model simulacije (detalj A)

- Poslužitelj: radnički bazen koji određuje RAM (W = (RAM − 512 MB) / 256 MB → 6 / 14 / 30); **svaka jezgra radi na jednom zahtjevu odjednom** (kao otvor u presjeku A–A), zahtjev treba 140–260 ms procesora, pa 100 ms čeka bazu; red od 8 mjesta, zatim 503. Kapacitet 5 / 10 / 20 zaht./s.
- Load balancer broji **veze koje je sam otvorio, a nije dobio odgovor** (na putu + u redu + u obradi). Svi izlazi razdjelnika jednako su dugi (≈ 0,2 s), pa put ne daje prednost nijednom poslužitelju.
- Provjera zdravlja svake 1 s; 2 neuspjele → isključen (≈ 2 s sim, stvarno npr. 30 s); 2 uspješne → vraćen. Srušen poslužitelj odbija veze (502); pod „najmanje veza” izgleda prazno pa do otkrivanja privlači još više prometa.
- p95 = vrijeme na poslužitelju (red + obrada) zadnjih 5 s, samo za zahtjeve poslane trenutnim algoritmom (nema miješanja nakon prebacivanja). Cilj na manometru: **p95 ≤ 1,5 s**.
- Provjereno bez sučelja (5 sjemena, 30 s): kod 22 zaht./s **kružno** daje p95 ≈ 2,8–2,9 s i ~2 greške/s (Mali ne stiže, red 8/8); **najmanje veza** daje p95 ≈ 0,8–1,2 s, 0 grešaka, udjele ≈ 21 / 36 / 43 %. Najmanje veza ne zna kapacitet (Mali i dalje dobiva više od 14 %), ali izbjegava zauzete poslužitelje. Nakon prebacivanja s kružnog nove greške prestaju unutar 0,1 s (prozor od 5 s zatim se isprazni), a p95 se mjeri ispočetka.

## Očitanja kao instrumenti

- **Zapisnik (pisač na traci)**: papir se odmata ulijevo, pero tinte = obrađeno/s, crveno pero = greške/s, crtkano pero olovkom = λ; uvijek 30 s povijesti (simulacija se „zagrije” 31 s prije prvog prikaza).
- **p95**: manometar 0–4 s; zona iznad cilja 1,5 s crveno križno šrafirana s crvenom crticom cilja; kazaljka postaje crvena tek iznad cilja.
- **Greške**: crtice crvenom olovkom (četiri i peta preko) u unaprijed povučena prazna „vrata”, zadnjih 5 s.
- **Udio prometa**: kote sa strelicama (udio prometa) iznad tanke konstrukcijske linije (udio kapaciteta); kota postaje crvena („ne stiže”) samo kad taj poslužitelj stvarno odbija zahtjeve ili mu je red napola pun.
- **Brojači na razdjelniku**: otvorene veze po izlazu, i za kružno (pa se vidi da ih kružno ignorira) i za najmanje veza.

## Pravila kretanja

1. **Linija se crta sama**: novi dijelovi ulaze s `pathLength` 0 → 1, linearno, ~0,9 s, s pomakom 70 ms; natpisi nakon linije. Nema odskakivanja.
2. **Kreće se samo ono što se stvarno kreće**: točke idu ortogonalnim cijevima jednom stalnom brzinom; unutar kućišta razdjelnika su skrivene (presjek se ne animira); studenti u tlocrtu hodaju nacrtanim rutama; u presjecima točke prolaze otvorom brzinom koju određuju jezgre.
3. **Odluka = kratki zakret i bljesak provrta**: kazaljka birača (90 ms), provrt kojim je zahtjev prošao 260 ms u olovci, poluga preklopnika (180 ms).
4. **Stanje mijenja liniju, ne oblik**: pad = crvena olovka, isključenje = zatvoren zasun, lančana cijev i crtkan brojač, oporavak = povratak na punu liniju; svaka promjena dobiva red revizije s vremenom.
5. **Ruka provjeravatelja je spora i sigurna**: zaokruživanje, precrtavanje i pokazne linije crtaju se 0,35–1,1 s; pečat padne (1,35 → 1, zakret −16° → −7°).
6. **Vrijeme je označeno**: „t = 32,4 s (sim)”, uz stvarnu vrijednost gdje se razlikuje („otkrivanje ≈ 2 s (sim) · stvarno npr. 30 s”).
7. **Petlje miruju izvan ekrana**; `requestAnimationFrame` sa stanjem u `ref`ovima, točke su obični SVG elementi.
8. **Smanjeno kretanje**: bez automatskih revizija (hero odmah na rev. C); crteži prikazuju „zagrijano” reprezentativno stanje; simulacija čeka „Pokreni”.

## Datoteke

`Draw.tsx` (Defs, Dim, Leader, RevTri, Valve, Person, Pod, Rotary, Cylinder, SectionMark, Stamp), `geom.ts` (rute, roughjs olovka, oblak rukom, šesterokut), `lbModel.ts` + `simLayout.ts` + `LbSim.tsx` + `Instruments.tsx` (detalj A), `Legend.tsx`, `Cluster.tsx` (detalj B), `KeyIdea.tsx` (presjeci A–A / B–B), `Stepper.tsx`, `Spec.tsx`, `Quiz.tsx`, `Story.tsx` (priča, analogija, mit, `Term`), `glossary.ts`, `Lecture.tsx`, `Hero.tsx`, `Chrome.tsx` (zaglavlje, okvir, sastavnica pojmova, podnožje). Zaglavlje nosi i globalnu klasu `shell-header` samo zato da ga `scripts/shot.mjs --section` može odlijepiti.

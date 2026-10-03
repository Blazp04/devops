# Kubernetes predavanja

Interaktivna online predavanja (na hrvatskom) o raspodijeljenim sustavima, kontejnerima, Kubernetesu, CI/CD-u i GitOpsu. Svaki pojam gradi se na prethodnom, uz animacije i simulacije koje studenti pokreću, mijenjaju i namjerno kvare.

Interactive Croatian-language lectures for CS/IT students who can program but have never run servers, Docker or Kubernetes.

## Pokretanje

```bash
npm install
npm run dev          # http://localhost:5173
```

| Naredba | Što radi |
|---|---|
| `npm run dev` | razvojni poslužitelj (Vite) |
| `npm run build` | provjera tipova + produkcijski build u `dist/` |
| `npm run typecheck` | samo provjera tipova |
| `npm run lint` | ESLint |
| `npm test` | testovi šest simulacijskih motora (`src/engines`) |
| `npm run smoke` | otvara sve stranice u svijetloj i tamnoj temi (1440 i 390 px) i javlja greške u konzoli i prelijevanje (dev poslužitelj mora raditi) |
| `npm run shot -- /predavanje/<slug> --section <id> --scale 0.5 --out /tmp/x.png` | snimka zaslona (koristi lokalni Google Chrome) |

## Struktura

```
src/
  curriculum/   metapodatci tečaja (moduli, predavanja, pojmovnik), napredak studenta
  kit/          stil „Bilježnica”: olovka (sketch), crteži i likovi (doodles), tekst, interakcija, dijagrami, Klopa karta
  engines/      šest simulacijskih motora (promet, red poruka, klaster, izgradnja, tko vidi tajnu, GitOps) s testovima
  lectures/     24 predavanja; jedno predavanje = jedna mapa <id>-<slug>/ (automatski se otkriva)
  pages/        početna (kazalo), predavanje, pojmovnik, /kit i /kit/crtezi (pregled komponenti i crteža)
  design-lab/   prototipovi četiri vizualna smjera (/dizajn/…); izabrana je „Bilježnica”
docs/
  AUTHORING.md  vodič za pisanje predavanja (stil, točnost, komponente, provjera)
  CURRICULUM.md pregled kurikuluma; curriculum.json je puna specifikacija
  briefs/       sažeta specifikacija svakog predavanja + priča i stilski vodič (_course.md)
  research/     istraživanje: činjenice (stanje 2026.), modeli simulacija, terminologija, pedagogija
scripts/
  shot.mjs      snimke zaslona i provjera grešaka u konzoli
  gen-curriculum.mjs  generira src/curriculum/data.ts i docs/CURRICULUM.md iz curriculum.json
```

Novo predavanje: dodajte ga u `docs/curriculum.json`, pokrenite `node scripts/gen-curriculum.mjs` i napravite mapu `src/lectures/<id>-<slug>/` prema [docs/AUTHORING.md](docs/AUTHORING.md). Pregled svih komponenti: http://localhost:5173/kit.

## Tehnologija

React 19, TypeScript, Vite, [Motion](https://motion.dev) za animacije, [roughjs](https://roughjs.com) za rukom crtane linije, Shiki za isticanje koda. Sve simulacije rade u pregledniku, bez poslužitelja, na determinističkim (seeded) motorima.

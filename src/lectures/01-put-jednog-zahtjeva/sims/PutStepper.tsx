/**
 * "Put zahtjeva korak po korak": Petra opens https://klopa.example (VPS in Frankfurt behind Caddy).
 * URL → DNS → TCP (1 RTT) → TLS 1.3 (1 RTT) → HTTP through the proxy to 127.0.0.1:8000 → 200 OK.
 * The proxy ends Petra's connection and opens a new one to the app (new header); the waterfall grows step by step.
 */
import { Mark, Stepper, Term } from '../../../kit'
import { DNS_MS, NO_FAULTS, PLACES, SERVER_MS, fmtMs, traceRequest } from '../model'
import { TracePlayer } from './TracePlayer'
import styles from '../styles.module.css'

// behind the proxy the app listens only on 127.0.0.1:8000 (the recommended setup)
const TRACE = traceRequest({ scenario: 'proxy', client: 'petra', place: 'frankfurt', faults: { ...NO_FAULTS, loopbackOnly: true }, dnsCached: false, seed: 3 })

/** segment ranges per step, found by kind so the stepper follows the model */
function ranges(): [number, number][] {
  const s = TRACE.segs
  const first = (k: string) => s.findIndex((x) => x.kind === k)
  const app = s.findIndex((x) => x.kind === 'app')
  return [
    [0, 0],
    [first('dns'), first('tcp')],
    [first('tcp'), first('tls')],
    [first('tls'), first('http')],
    [first('http'), app + 1],
    [app + 1, s.length],
  ]
}
const RANGES = ranges()
const RTT = PLACES.frankfurt.rtt

/** which part of the URL each step is about: 0 = protocol/port, 1 = name, 2 = path */
const FOCUS: number[][] = [[0, 1, 2], [1], [0], [0], [2], [2]]
const PARTS = [
  { text: 'https://', note: 'protokol → port 443' },
  { text: 'klopa.example', note: 'ime → DNS' },
  { text: '/', note: 'putanja' },
]

const STEPS = [
  {
    title: 'Adresa ima tri dijela',
    body: (
      <>
        Petra upiše <code>https://klopa.example</code>. Preglednik iz toga čita protokol (<code>https</code> znači šifrirano i port 443), ime poslužitelja i putanju (<code>/</code>). Ime je za ljude – paketima treba{' '}
        <Term id="ip-address">IP adresa</Term>.
      </>
    ),
  },
  {
    title: 'DNS: ime → IP adresa',
    body: (
      <>
        Mobitel pita <Term id="dns-resolver">DNS razrješivač</Term> (engl. <em>resolver</em>): koja je adresa imena <code>klopa.example</code>? Odgovor je zapis tipa A (ime → IPv4 adresa): <code>203.0.113.10</code>, uz{' '}
        <Term id="ttl">TTL</Term> od 300 s – toliko se odgovor smije pamtiti, pa sljedeći put DNS ne treba pitati. Port DNS ne zna; on je u adresi. U primjeru DNS traje {fmtMs(DNS_MS)}. Da ime ne postoji, razrješivač bi nakon istog povratnog putovanja odgovorio <Term id="nxdomain">NXDOMAIN</Term> i put bi tu završio – bez ijednog paketa prema poslužitelju. (Ako ime postoji, ali nema zapis A, odgovor stiže bez adrese – preglednik javlja istu grešku.)
      </>
    ),
  },
  {
    title: 'TCP: rukovanje, 1 povratno putovanje',
    body: (
      <>
        Mobitel otvara <Term id="tcp">TCP vezu</Term> prema <code>203.0.113.10:443</code>: šalje SYN („mogu li se spojiti?”), poslužitelj odgovara SYN-ACK („može”). To je jedno povratno putovanje (<Term id="rtt">RTT</Term>) – do Frankfurta najmanje{' '}
        {fmtMs(RTT)}. Da na portu nitko ne sluša, operacijski sustav poslužitelja odmah bi vratio RST („ne”). Ispod crteža je zaglavlje paketa: od koje adrese i porta, do koje adrese i porta.
      </>
    ),
  },
  {
    title: 'TLS 1.3: šifrirani kanal, još 1 RTT',
    body: (
      <>
        Na portu 443 ne sluša aplikacija, nego Caddy, <Term id="reverse-proxy">posrednički poslužitelj</Term> (engl. <em>reverse proxy</em>, kraće proxy). On pokaže certifikat za <code>klopa.example</code> i s mobitelom dogovori ključeve. <Term id="tls">TLS</Term> 1.3 za
        to treba još jedno povratno putovanje.
      </>
    ),
  },
  {
    title: 'HTTP: zahtjev stiže do aplikacije',
    body: (
      <>
        Tek sada ide pravi zahtjev: <code>GET /</code>. Caddy ga prima i otvara novu, zasebnu vezu prema aplikaciji na istom stroju, na <code>127.0.0.1:8000</code> – zato paket ispod crteža sada ima druge adrese i portove.{' '}
        <code>gunicorn</code> obrađuje zahtjev {SERVER_MS} ms.
      </>
    ),
  },
  {
    title: 'Odgovor 200 OK',
    body: (
      <>
        Prvi bajt odgovora stiže nakon {fmtMs(TRACE.total)}: {fmtMs(DNS_MS)} DNS + 3 × {fmtMs(RTT)} + {SERVER_MS} ms obrade. Broj na početku odgovora je <Term id="http-status">statusni kod</Term>:
        <ul className={styles.codes}>
          <li>
            <b>2xx</b> uspjeh (200 OK)
          </li>
          <li>
            <b>3xx</b> preusmjeravanje (301)
          </li>
          <li>
            <b>4xx</b> greška klijenta (404)
          </li>
          <li>
            <b>5xx</b> greška poslužitelja: 502 vidjet ćemo već u ovom predavanju, a 503 i 504 u sljedećima
          </li>
        </ul>
      </>
    ),
  },
]

function Anatomy({ step }: { step: number }) {
  return (
    <div className={styles.anatomy} aria-hidden="true">
      {PARTS.map((p, i) => {
        const on = FOCUS[step].includes(i)
        return (
          <span key={i} className={styles.part}>
            <span>{on && step > 0 ? <Mark c="yellow">{p.text}</Mark> : p.text}</span>
            <span className={styles.partNote} style={{ visibility: on ? 'visible' : 'hidden' }}>
              {p.note}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export function PutStepper() {
  return (
    <Stepper title="Put zahtjeva https://klopa.example" steps={STEPS} autoPlay={0} caption="Poslužitelj je u Frankfurtu; vremena su donje granice zbog udaljenosti. Crtež nije u mjerilu – vrijeme pokazuje vremenski dijagram ispod njega (vodopad): jedna traka za svaki korak puta.">
      {(step) => <TracePlayer key={step} trace={TRACE} from={RANGES[step][0]} to={RANGES[step][1]} idPrefix={`l01put${step}`} who="Petra" above={<Anatomy step={step} />} waterfall />}
    </Stepper>
  )
}

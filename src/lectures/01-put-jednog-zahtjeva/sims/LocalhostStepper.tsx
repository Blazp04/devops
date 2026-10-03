/**
 * "Zašto Petra ne vidi localhost": three requests on the same drawing (Klopa on Lana's laptop, Petra on mobile data).
 * ① Lana opens localhost:8000 → the request never leaves her laptop → 200 OK.
 * ② Petra opens localhost:8000 → the packet U-turns into her own phone → nothing listens there → refused at once.
 * ③ Petra opens 192.168.1.23:8000 → a private address behind NAT → lost on the internet → timeout.
 */
import { Stepper } from '../../../kit'
import { NO_FAULTS, traceRequest, type ClientId } from '../model'
import { TracePlayer } from './TracePlayer'

// Lana started gunicorn without --bind, so it listens on 127.0.0.1:8000 (the default) — it changes nothing for Petra
const make = (client: ClientId) => traceRequest({ scenario: 'laptop', client, place: 'zagreb', faults: { ...NO_FAULTS, loopbackOnly: true }, dnsCached: false, seed: 1 })

const TRACES = [make('lana-local'), make('petra-localhost'), make('petra')]
const WHO = ['Lana (laptop)', 'Petra', 'Petra']

const STEPS = [
  {
    title: 'Kod Lane: localhost je njezin laptop',
    body: (
      <>
        Lana upiše <code>http://localhost:8000</code>. Ime <code>localhost</code> uvijek znači „ovo računalo” (adresa <code>127.0.0.1</code>), pa zahtjev uopće ne izlazi iz laptopa. Odmah stiže do gunicorna, koji bez dodatnih opcija sluša upravo na <code>127.0.0.1:8000</code>: 200 OK za 20 ms.
      </>
    ),
  },
  {
    title: 'Kod Petre: localhost je Petrin mobitel',
    body: (
      <>
        Petra upiše istu adresu. Za njezin mobitel <code>localhost</code> je – njezin mobitel. Paket se okrene i vrati u isti uređaj, a ondje na portu 8000 nitko ne sluša. Operacijski sustav zato vezu odmah odbije paketom RST („ovdje nitko ne sluša”).
      </>
    ),
  },
  {
    title: 'Adresa laptopa ne pomaže',
    body: (
      <>
        Lana pošalje adresu laptopa, <code>192.168.1.23:8000</code>. To je privatna adresa: vrijedi samo u njezinu stanu, iza kućnog usmjerivača. Na internetu nitko ne zna put do nje, pa paket nestane, a Petrin mobitel čeka
        dok ne odustane – kako god gunicorn slušao.
      </>
    ),
  },
]

export function LocalhostStepper() {
  return (
    <Stepper title="Tri pokušaja iste večeri" steps={STEPS} autoPlay={0} caption="Crtež nije u mjerilu. Pladanj je jedan zahtjev: narančast dok putuje, zelen kad nosi odgovor, crven kad nosi grešku.">
      {(step) => <TracePlayer key={step} trace={TRACES[step]} from={0} to={TRACES[step].segs.length} idPrefix={`l01loc${step}`} who={WHO[step]} />}
    </Stepper>
  )
}

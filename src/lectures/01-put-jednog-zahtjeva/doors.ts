/**
 * "Tko sluša na kojim vratima": one machine, two addresses (rows of doors), processes behind the doors.
 *   inside  (curl http://localhost:8000)     → the 127.0.0.1 row; gunicorn is there with either bind → 200
 *   outside (Petra over the internet)        → VPS: firewall, then the public row; laptop: private address → lost
 *   wifi    (Petra in the same flat)         → the laptop's 192.168.1.23 row (behind the laptop's firewall)
 * 127.0.0.1 = only the lo row · 0.0.0.0 = every row of this machine. Nothing behind a door → RST (refused, fast);
 * a firewall that drops, or an address nobody can route to → silence (timeout). A second process on the same
 * address and port fails to start: "Address already in use".
 */
import { IP } from './model'

export type DoorHost = 'vps' | 'laptop'
export type Sender = 'inside' | 'outside' | 'wifi'
export type Bind = '127.0.0.1' | '0.0.0.0'

export interface DoorsParams {
  host: DoorHost
  sender: Sender
  bind: Bind
  fwOpen: boolean
}

export type DoorsOutcome = 'ok' | 'refused' | 'timeout'

export interface Knock {
  outcome: DoorsOutcome
  /** the row the packet arrives at (null when it never reaches the machine) */
  row: 'pub' | 'lo' | null
  /** where it stops: at the door (ok / refused), at the firewall, or lost on the internet */
  stop: 'door' | 'fence' | 'lost'
  url: string
  head: string
  text: string
}

export function senderValid(host: DoorHost, sender: Sender): boolean {
  return host === 'laptop' || sender !== 'wifi'
}

export function knock(p: DoorsParams): Knock {
  const pubIp = p.host === 'vps' ? IP.vps : IP.laptop
  if (p.sender === 'inside') {
    return {
      outcome: 'ok',
      row: 'lo',
      stop: 'door',
      url: 'http://localhost:8000',
      head: '200 OK',
      text: `Iznutra radi u oba slučaja: i 127.0.0.1 i 0.0.0.0 uključuju adresu 127.0.0.1. Zato „kod mene radi” ništa ne govori o tome mogu li drugi.`,
    }
  }
  const url = `http://${pubIp}:8000`
  if (p.host === 'laptop' && p.sender === 'outside') {
    return {
      outcome: 'timeout',
      row: null,
      stop: 'lost',
      url,
      head: 'istek vremena',
      text: `${IP.laptop} je privatna adresa: vrijedi samo u Laninu stanu. Na internetu nitko ne zna put do nje, pa paket nestane – kako god gunicorn slušao. Treba računalo s javnom adresom.`,
    }
  }
  if (!p.fwOpen) {
    return {
      outcome: 'timeout',
      row: 'pub',
      stop: 'fence',
      url,
      head: 'istek vremena',
      text: `Vatrozid ne propušta port 8000 i paket tiho odbacuje (DROP). Petra ne dobije nikakav odgovor i čeka dok ne odustane.`,
    }
  }
  if (p.bind === '127.0.0.1') {
    return {
      outcome: 'refused',
      row: 'pub',
      stop: 'door',
      url,
      head: 'odbijena veza',
      text: `Paket je stigao na ${pubIp}:8000, ali gunicorn sluša samo na 127.0.0.1 – iza tih vrata nema nikoga, pa operacijski sustav odmah vrati RST.`,
    }
  }
  return {
    outcome: 'ok',
    row: 'pub',
    stop: 'door',
    url,
    head: '200 OK',
    text:
      p.host === 'vps'
        ? `gunicorn sluša na 0.0.0.0, dakle i na javnoj adresi ${IP.vps}, a vatrozid propušta port 8000. Petrin zahtjev je prošao.`
        : `Petra je na istoj Wi-Fi mreži, pa privatna adresa ${IP.laptop} za nju vrijedi. S 0.0.0.0 gunicorn sluša i na njoj.`,
  }
}

/**
 * „Gdje živi košarica”: E1 preset l05-sessions-local (20 users, težinsko kružno, 10 zahtjeva/s, seed 42) with the
 * session store as a control: in the server's memory, the same plus an LB cookie (sticky), or Redis.
 */
import { SCENARIOS, addServer, configure, createTraffic, mergeConfigInput, powerOff, powerOn, stepTraffic, type TrafficState } from '../../../engines/traffic'
import { sessionsInput, type SessionMode } from './flagship'

export interface CartState {
  s: TrafficState
  /** sim ms of each user's latest logout (for the red ✗ above the head) */
  lostAt: number[]
  lostSeen: number[]
  /** S3 was switched off while carts lived in Redis, and when (sim ms) */
  redisCrashAt: number | null
  redisCrashLost: number
  /** scale-out with sticky sessions: when S4 was added */
  stickyAddAt: number | null
  /** carts that were on a switched-off server (drawn struck out on its card until it is back up) */
  ghosts: { server: string; users: number[] } | null
}

export function createCarts(mode: SessionMode): CartState {
  const cfg = mergeConfigInput(SCENARIOS['l05-sessions-local'].config, { sessions: sessionsInput(mode) })
  const s = createTraffic(cfg)
  return { s, lostAt: s.clients.map(() => -1e9), lostSeen: s.clients.map(() => 0), redisCrashAt: null, redisCrashLost: 0, stickyAddAt: null, ghosts: null }
}

export function stepCarts(st: CartState, dt: number, mode: SessionMode) {
  configure(st.s, { sessions: sessionsInput(mode) })
  stepTraffic(st.s, dt)
  if (st.ghosts && st.s.servers.find((v) => v.id === st.ghosts?.server)?.proc === 'up') st.ghosts = null
  st.s.clients.forEach((c, i) => {
    if (c.session.lost > st.lostSeen[i]) {
      st.lostSeen[i] = c.session.lost
      st.lostAt[i] = st.s.t
    }
  })
}

export function addFourth(st: CartState, mode: SessionMode): boolean {
  const id = addServer(st.s, { id: 's4', name: 'S4', label: 'novi', vcpu: 2, ramGB: 4, weight: 2 })
  if (id && mode === 'cookie') st.stickyAddAt = st.s.t
  return id !== null
}

/**
 * Switch S3's machine off; remember whose carts were on it. (The cart store is per machine – e.g. a Redis on that server
 * shared by its radnici – so it is the machine going away, not a single process, that takes the carts with it.)
 */
export function offS3(st: CartState, mode: SessionMode) {
  const users = st.s.clients.filter((c) => c.session.home === 's3').map((c) => c.id)
  if (!powerOff(st.s, 's3')) return
  st.ghosts = { server: 's3', users }
  if (mode === 'redis' && st.s.redisUp) {
    st.redisCrashAt = st.s.t
    st.redisCrashLost = st.s.totals.sessionLost
  }
}

/** Switch S3 back on (boot, then warm-up). */
export function onS3(st: CartState) {
  powerOn(st.s, 's3')
}

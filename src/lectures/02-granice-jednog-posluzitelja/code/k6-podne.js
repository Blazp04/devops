// k6-podne.js – ponedjeljak u 12:00: 4 zahtjeva/s, pa nalet ×3 tijekom 30 s
import http from 'k6/http'
import { check } from 'k6'

// kopija Klope za testiranje, nikad ona na kojoj studenti naručuju ručak
const BASE_URL = __ENV.BASE_URL || 'https://test.klopa.example'

export const options = {
  scenarios: {
    podne: {
      executor: 'ramping-arrival-rate', // novi zahtjevi stižu bez obzira na odgovore
      startRate: 4,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200, // spori odgovori trebaju više istodobnih korisnika
      stages: [
        { target: 4, duration: '20s' }, // 11:59:40 – 12:00
        { target: 12, duration: '1s' }, // 12:00 – cijeli kampus
        { target: 12, duration: '30s' },
        { target: 4, duration: '1s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // manje od 1 % grešaka
    'http_req_duration{expected_response:true}': ['p(95)<2000'], // p95 uspješnih < 2 s
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/api/jelovnik/`)
  check(res, { 'status 200': (r) => r.status === 200 })
}

// Dostupnost (A) = udio vremena u kojem sustav radi, od 0 do 1.

/** A = MTBF / (MTBF + MTTR) */
export const fromMtbf = (mtbfH: number, mttrH: number) => mtbfH / (mtbfH + mttrH)

/** U nizu: moraju raditi svi dijelovi. */
export const series = (...parts: number[]) => parts.reduce((a, x) => a * x, 1)

/** Paralelno: dovoljan je jedan. Vrijedi samo ako kvarovi nisu povezani! */
export const parallel = (...parts: number[]) => 1 - parts.reduce((a, x) => a * (1 - x), 1)

/** Sati nedostupnosti u godini (8760 h). */
export const downtimeH = (a: number) => (1 - a) * 8760

// Klopa: ulaz × dva poslužitelja aplikacije × jedna baza
const klopa = series(0.9999, parallel(0.99, 0.99), 0.999)
console.log(`${(klopa * 100).toFixed(2)} %, ${downtimeH(klopa).toFixed(1)} h/god.`) // 99.88 %, 10.5 h/god.

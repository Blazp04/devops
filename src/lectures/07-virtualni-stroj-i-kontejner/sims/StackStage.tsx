/**
 * The stage of „Slagač stoga”: one 16 GB host drawn as a stack (apps → VMs or containers → hypervisor or the
 * shared host kernel → hardware with its RAM bar). Two layouts picked by the stage's width: 6 columns × 2 rows
 * (g6, viewBox 600) and 4 columns × 3 rows for phones (g4, viewBox 380, never wider than 460 px).
 * The drawing is a pure function of the model state.
 */
import { useId } from 'react'
import { Burst, Check, Rough, plural, type Pt } from '../../../kit'
import { CATALOG, GUEST_OS_MB, HOST_OS_MB, NODE_VMS, alive, bootStage, bootTotal, gb, hostGb, mbLabel, nodeUsage, nodeVmMb, stagesFor, usage, type App, type StackState } from '../model'
import { Band, BeltStrap, ContainerBox, Crack, Face, Hatches, ProgramCard, VmFrame } from './parts'

interface Geo {
  W: number
  H: number
  cols: number
  slotW: number
  slotH: number
  gapX: number
  gapY: number
  x0: number
  rowsTop: number
  /** cloud: the two node frames */
  frame: (n: number) => { x: number; y: number; w: number; h: number }
  cloudTop: number
  nodeKernel: { y: number; h: number }
  band: { y: number; h: number }
  cloudHyper: { y: number; h: number }
  hw: { y: number; h: number }
  mono: number
  /** smallest mono / label size in this layout (≥ 12 px on screen at the layout's smallest width) */
  small: number
  hand: number
}

const G6: Geo = {
  W: 600,
  H: 548,
  cols: 6,
  slotW: 86,
  slotH: 140,
  gapX: 8,
  gapY: 12,
  x0: 22,
  rowsTop: 46,
  frame: (n) => ({ x: n === 0 ? 8 : 304, y: 36, w: 288, h: 368 }),
  cloudTop: 70,
  nodeKernel: { y: 366, h: 30 },
  band: { y: 354, h: 46 },
  cloudHyper: { y: 414, h: 32 },
  hw: { y: 458, h: 84 },
  mono: 14,
  small: 13.5,
  hand: 20,
}

const G4: Geo = {
  W: 380,
  H: 716,
  cols: 4,
  slotW: 84,
  slotH: 140,
  gapX: 6,
  gapY: 12,
  x0: 13,
  rowsTop: 46,
  frame: (n) => ({ x: n === 0 ? 2 : 192, y: 36, w: 186, h: 520 }),
  cloudTop: 70,
  nodeKernel: { y: 518, h: 30 },
  band: { y: 506, h: 46 },
  cloudHyper: { y: 566, h: 32 },
  hw: { y: 610, h: 100 },
  mono: 14.5,
  small: 14.5,
  hand: 20.5,
}

/** top-left of app i's slot */
function slotPos(g: Geo, s: StackState, i: number): Pt {
  const cloud = s.mode === 'ct' && s.cloud
  if (!cloud) {
    const c = i % g.cols
    const r = Math.floor(i / g.cols)
    return [g.x0 + c * (g.slotW + g.gapX), g.rowsTop + r * (g.slotH + g.gapY)]
  }
  const node = i % NODE_VMS
  const k = Math.floor(i / NODE_VMS)
  const per = g.cols / NODE_VMS
  const c = k % per
  const r = Math.floor(k / per)
  const f = g.frame(node)
  const inner = per * g.slotW + (per - 1) * g.gapX
  return [f.x + (f.w - inner) / 2 + c * (g.slotW + g.gapX), g.cloudTop + r * (g.slotH + g.gapY)]
}

const TINT: Record<string, string> = {
  api: 'var(--hl-blue-ink)',
  worker: 'var(--hl-green-ink)',
  web: 'var(--hl-orange-ink)',
  postgres: 'var(--hl-lilac-ink)',
  redis: 'var(--hl-pink-ink)',
  rabbitmq: 'var(--hl-yellow-ink)',
}

function Slot({ a, s, g, x, y, ids, selected }: { a: App; s: StackState; g: Geo; x: number; y: number; ids: string; selected: boolean }) {
  const w = g.slotW
  const vm = s.mode === 'vm'
  const info = CATALOG[a.kind]
  const seed = 9000 + a.id * 37
  const box = { x: x + 5, y: y + 12, w: w - 10, h: 46 }
  if (a.status === 'nofit') {
    return (
      <g>
        <VmFrame x={x} y={y} w={w} h={g.slotH} label="VM" size={g.small} seed={seed} stroke="var(--red)" dashed />
        <text x={x + w / 2} y={y + 52} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600, fill: 'var(--ink-2)' }}>
          {info.short}
        </text>
        <text x={x + w / 2} y={y + 82} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
          <tspan x={x + w / 2}>nema</tspan>
          <tspan x={x + w / 2} dy={g.hand * 0.95}>
            mjesta
          </tspan>
        </text>
        <text x={x + w / 2} y={y + 128} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.small, fill: 'var(--red)' }}>
          {mbLabel(GUEST_OS_MB + info.mem)}
        </text>
      </g>
    )
  }
  const dead = a.status === 'oom'
  const booting = a.status === 'booting'
  const leakBase = info.mem
  const leakSpan = vm ? 300 : a.limitOn ? info.limit - leakBase : 2000
  const leakF = alive(a) && a.mem > leakBase ? Math.min(1, (a.mem - leakBase) / leakSpan) : 0
  const mood = dead ? 'dead' : a.pwned ? 'panic' : booting ? 'busy' : a.status === 'stopped' ? 'busy' : s.pressure || a.leaking ? 'panic' : 'calm'
  const recent = dead && s.time - a.killedAt < 1.4
  // status line
  let status: string
  let statusTone = 'var(--ink-2)'
  if (dead) {
    status = 'OOMKilled'
    statusTone = 'var(--red)'
  } else if (a.pwned) {
    status = a.id === s.attacker ? 'napadač' : 'napadnut'
    statusTone = 'var(--red)'
  } else if (booting) {
    // the stage in progress („jezgra…” = the guest kernel is booting); the exact sampled seconds are never shown
    status = `${stagesFor(s)[bootStage(a).i]?.label ?? ''}…`
  } else if (a.status === 'running') {
    status = a.leaking ? 'curi!' : '✓ radi'
    statusTone = a.leaking ? 'var(--red)' : 'var(--green)'
  } else status = 'stoji'
  const memText = dead ? '0 MB' : !alive(a) ? '–' : a.limitOn && !vm ? `${Math.round(a.mem)}/${info.limit}${g === G4 ? '' : ' MB'}` : mbLabel(a.mem)
  const stages = stagesFor(s)
  const total = booting ? bootTotal(a) : 1
  return (
    <g>
      {selected && <Rough shape={{ k: 'rect', x: x - 4, y: y - 4, w: w + 8, h: (vm || booting ? g.slotH : 110) + 8 }} seed={seed + 30} stroke="var(--pen)" strokeWidth={1.8} dash="5 4" roughness={0.6} />}
      {vm && <VmFrame x={x} y={y} w={w} h={g.slotH} label="" seed={seed} stroke={a.pwned ? 'var(--red)' : 'var(--ink)'} />}
      {recent && <Burst cx={box.x + box.w / 2} cy={box.y + box.h / 2} r={34} seed={seed + 5} />}
      {vm ? (
        <ProgramCard x={box.x} y={box.y + 4} w={box.w} h={box.h - 6} name={info.short} size={g.small} seed={seed + 1} stroke={dead ? 'var(--ink-3)' : a.pwned ? 'var(--red)' : 'var(--ink)'} dashed={dead || a.status === 'stopped'} />
      ) : (
        <ContainerBox
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          name={info.short}
          size={g.small}
          seed={seed + 1}
          tint={dead ? 'var(--ink-4)' : a.pwned ? 'var(--red)' : TINT[a.kind]}
          angle={a.pwned ? 41 : -41}
          stroke={dead || a.pwned ? (dead ? 'var(--ink-3)' : 'var(--red)') : 'var(--ink)'}
          dashed={dead || a.status === 'stopped'}
        />
      )}
      {/* the leak fills the box from the bottom with red hatching; the name is written again on top so it stays legible */}
      {leakF > 0 && (
        <g>
          <rect x={box.x + 3} y={box.y + box.h - 3 - (box.h - 14) * leakF} width={box.w - 6} height={(box.h - 14) * leakF} fill={`url(#${ids}-red)`} />
          <text x={box.x + box.w / 2} y={vm ? box.y + 4 + (box.h - 6) / 2 + g.small * 0.2 : box.y + 11 + (box.h - 11) / 2 + g.small * 0.36} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: g.small, fontWeight: 600 }}>
            {info.short}
          </text>
        </g>
      )}
      {/* the belt sits on the box's bottom edge, under the name */}
      {a.limitOn && !vm && <BeltStrap x={box.x} y={box.y + box.h - 2} w={box.w} seed={seed + 8} />}
      <Face cx={box.x + box.w - 2} cy={box.y + 1} r={8.5} mood={mood} seed={seed + 12} />
      <text x={x + w / 2} y={y + 80} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: a.leaking ? 'var(--red)' : 'var(--ink-2)', fontWeight: a.leaking ? 600 : 400 }}>
        {memText}
      </text>
      <text x={x + w / 2} y={y + 100} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: statusTone, fontWeight: 600 }}>
        {status}
      </text>
      {/* user namespace: the attacker STARTED as an unprivileged user on the host — whoever owns the kernel owns everything */}
      {s.kernelPwned && s.userns && a.id === s.attacker && (
        <text x={x + w / 2} y={y + 128} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.small, fill: 'var(--pen)', fontWeight: 600 }}>
          <tspan x={x + w / 2}>krenuo</tspan>
          <tspan x={x + w / 2} dy={g.small * 1.1}>
            bez roota
          </tspan>
        </text>
      )}
      {/* boot progress: one segment per stage, proportional to its duration */}
      {booting && (
        <g>
          {(() => {
            let acc = 0
            const bw = w - 18
            return a.boot.map((d, i) => {
              const sx = x + 9 + (acc / total) * bw
              const sw = (d / total) * bw
              const done = Math.max(0, Math.min(1, (a.bootT - acc) / d))
              acc += d
              return (
                <g key={i}>
                  <rect x={sx} y={y + 106} width={Math.max(0, sw - 1.5)} height={6} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1 }} />
                  {done > 0 && <rect x={sx} y={y + 106} width={Math.max(0, (sw - 1.5) * done)} height={6} fill={`url(#${ids}-${i === stages.length - 1 ? 'green' : 'pen'})`} />}
                </g>
              )
            })
          })()}
        </g>
      )}
      {vm && (
        <Band x={x + 6} y={y + 115} w={w - 12} h={20} label="jezgra" size={g.small + 0.5} hatch={a.pwned ? 'var(--red)' : 'var(--hl-blue-ink)'} stroke={a.pwned ? 'var(--red)' : 'var(--ink)'} seed={seed + 20} ink={a.pwned ? 'var(--red)' : 'var(--ink)'} />
      )}
    </g>
  )
}

function RamBar({ s, g, ids }: { s: StackState; g: Geo; ids: string }) {
  const u = usage(s)
  const host = s.hostMb
  const hostLabel = hostGb(s)
  const cloud = s.mode === 'ct' && s.cloud
  const narrow = g === G4
  const hw = { x: narrow ? 6 : 8, y: g.hw.y, w: g.W - (narrow ? 12 : 16), h: g.hw.h }
  const bar = narrow ? { x: hw.x + 10, y: hw.y + 34, w: hw.w - 20, h: 26 } : { x: hw.x + 112, y: hw.y + 14, w: hw.w - 124, h: 28 }
  const segs: { v: number; fill: string }[] = [
    { v: u.hostOs, fill: `url(#${ids}-ink)` },
    { v: u.guestOs, fill: `url(#${ids}-pen)` },
    { v: u.runtime, fill: `url(#${ids}-green)` },
    { v: u.apps, fill: `url(#${ids}-food)` },
    { v: u.leak, fill: `url(#${ids}-red2)` },
  ]
  let acc = 0
  const labelY = narrow ? hw.y + 86 : hw.y + 66
  const full = u.free < 400
  return (
    <g>
      <Rough shape={{ k: 'rect', ...hw }} seed={8801} strokeWidth={1.8} />
      {narrow ? (
        <text x={hw.x + 10} y={hw.y + 24} className="k-svg-display" style={{ fontSize: 15, fontWeight: 700 }}>
          hardver{' '}
          <tspan className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 400, fill: 'var(--ink-2)' }}>
            · {hostLabel} GB RAM
          </tspan>
        </text>
      ) : (
        <>
          <text x={hw.x + 12} y={hw.y + 30} className="k-svg-display" style={{ fontSize: 16, fontWeight: 700 }}>
            hardver
          </text>
          <text x={hw.x + 12} y={hw.y + 52} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
            {hostLabel} GB RAM
          </text>
        </>
      )}
      {segs.map((sg, i) => {
        const x = bar.x + (acc / host) * bar.w
        const w = (Math.max(0, sg.v) / host) * bar.w
        acc += Math.max(0, sg.v)
        return w > 0.2 ? <rect key={i} x={x} y={bar.y} width={w} height={bar.h} fill={sg.fill} /> : null
      })}
      {/* the bar's frame, and a tick per GB */}
      <Rough shape={{ k: 'rect', ...bar }} seed={8802} strokeWidth={1.6} />
      {Array.from({ length: Math.ceil(host / 1000) - 1 }, (_, i) => (
        <line key={i} x1={bar.x + (((i + 1) * 1000) / host) * bar.w} y1={bar.y + bar.h - 5} x2={bar.x + (((i + 1) * 1000) / host) * bar.w} y2={bar.y + bar.h} style={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} />
      ))}
      {/* cloud: the two VMs reserved everything but the host OS up front (dashed pen outline); used and free are inside them */}
      {cloud && <Rough shape={{ k: 'rect', x: bar.x + (HOST_OS_MB / host) * bar.w, y: bar.y - 4, w: bar.w * (1 - HOST_OS_MB / host) + 3, h: bar.h + 8 }} seed={8803} stroke="var(--pen)" strokeWidth={1.6} dash="5 4" roughness={0.6} />}
      <text x={bar.x} y={labelY} className="k-svg-mono" style={{ fontSize: g.mono, fill: full ? 'var(--red)' : 'var(--ink)', fontWeight: 600 }}>
        {cloud ? `u VM-ovima${narrow ? '' : ' zauzeto'} ${gb(u.used - HOST_OS_MB)} / ${gb(host - HOST_OS_MB)} GB` : `zauzeto ${gb(u.used)} / ${hostLabel} GB`}
      </text>
      <text x={bar.x + bar.w} y={labelY} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
        slobodno {gb(Math.max(0, u.free))} GB
      </text>
    </g>
  )
}

export function StackStage({ s, narrow }: { s: StackState; narrow: boolean }) {
  const g = narrow ? G4 : G6
  const ids = `ss${useId().replace(/:/g, '')}`
  const cloud = s.mode === 'ct' && s.cloud
  const vm = s.mode === 'vm'
  const pos = s.apps.map((_, i) => slotPos(g, s, i))
  const fitN = s.apps.filter((a) => a.status !== 'nofit').length
  const u = usage(s)
  const attacker = s.attacker !== null ? s.apps.findIndex((a) => a.id === s.attacker) : -1

  // the message at the top: the one thing that matters now
  let msg = ''
  let msgTone = 'var(--ink-2)'
  if (attacker >= 0 && s.kernelPwned) {
    msg = s.userns ? (narrow ? '✗ i bez roota – pali su svi' : '✗ krenuo je bez roota – ali jezgra je pala, s njom svi') : '✗ zajednička jezgra: pali su svi'
    msgTone = 'var(--red)'
  } else if (attacker >= 0 && vm) {
    msg = '✓ hipervizor je zaustavio napad'
    msgTone = 'var(--green)'
  } else if (attacker >= 0 && cloud) {
    msg = '✓ napad je ostao u jednom VM-u'
    msgTone = 'var(--green)'
  } else if (s.pressure) {
    msg = cloud ? '! VM-u u oblaku ponestaje memorije' : '! domaćinu ponestaje memorije'
    msgTone = 'var(--red)'
  } else if (vm && fitN < s.apps.length) {
    const n = s.apps.length - fitN
    msg = `✗ za ${n} ${plural(n, ['VM', 'VM-a', 'VM-ova'], false)} nema mjesta`
    msgTone = 'var(--red)'
  } else if (!s.apps.length) {
    msg = 'dodajte aplikacije →'
  }

  const label = `Domaćin od ${hostGb(s)} GB, ${vm ? 'svaka aplikacija u svojem virtualnom stroju' : cloud ? 'kontejneri u dva virtualna stroja u oblaku' : 'kontejneri na zajedničkoj jezgri'}: stalo ${fitN} od ${s.apps.length} aplikacija, zauzeto ${gb(u.used)} od ${hostGb(s)} GB.${msg ? ` ${msg.replace(/^[✓✗!] /, '')}.` : ''}`

  // crack lines for the exploit: from the attacker's box down the gap beside its column to the top of the kernel,
  // along the kernel's bottom edge (under its label), and short spikes up from the kernel under every column it
  // reaches — never through the lettering
  const cracks: Pt[][] = []
  if (attacker >= 0) {
    const [px, py] = pos[attacker]
    const midY = py + 12 + 23
    // cloud: the first column of a node frame sits next to the frame's wall, so the crack runs down the gap on its right
    const right = cloud && Math.floor(attacker / NODE_VMS) % (g.cols / NODE_VMS) === 0
    const gx = right ? px + g.slotW + g.gapX / 2 : px - g.gapX / 2
    const sx = right ? px + g.slotW - 5 : px + 5
    const spikes = (list: number[], top: number) => {
      const cols = new Map<number, number>()
      for (const i of list) cols.set(Math.round(pos[i][0]), pos[i][0] + g.slotW / 2)
      for (const cx of cols.values()) cracks.push([[cx, top], [cx, top - 24]])
    }
    if (s.kernelPwned) {
      const by = g.band.y + g.band.h - 5
      cracks.push([[sx, midY], [gx, midY], [gx, g.band.y + 2]])
      cracks.push([[g.x0 - 6, by], [g.W - g.x0 + 6, by]])
      spikes(s.apps.map((a, i) => (a.pwned ? i : -1)).filter((i) => i >= 0), g.band.y)
    } else if (cloud && s.pwnedNode !== null) {
      const f = g.frame(s.pwnedNode)
      const by = g.nodeKernel.y + g.nodeKernel.h - 4
      cracks.push([[sx, midY], [gx, midY], [gx, g.nodeKernel.y + 2]])
      cracks.push([[f.x + 14, by], [f.x + f.w - 14, by]])
      spikes(s.apps.map((a, i) => (a.pwned ? i : -1)).filter((i) => i >= 0), g.nodeKernel.y)
    } else if (vm) {
      cracks.push([[px + 8, py + 58], [px + 8, py + 122]])
    }
  }
  const safeNode = cloud && s.pwnedNode !== null ? 1 - s.pwnedNode : null

  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : 640, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
      <Hatches id={ids} />
      {msg && (
        <text x={g.W / 2} y={24} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand + 1, fill: msgTone }}>
          {msg}
        </text>
      )}
      {/* cloud: two node VMs, each with its own kernel */}
      {cloud &&
        [0, 1].map((n) => {
          const f = g.frame(n)
          const nu = nodeUsage(s, n)
          const hit = s.pwnedNode === n
          return (
            <g key={n}>
              <VmFrame x={f.x} y={f.y} w={f.w} h={f.h} label="" seed={8700 + n * 7} stroke={hit ? 'var(--red)' : 'var(--ink)'} />
              <text x={f.x + 10} y={f.y + 24} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
                {narrow ? `VM ${n + 1}` : `VM ${n + 1} u oblaku`}
              </text>
              <text x={f.x + f.w - 10} y={f.y + 23} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: nu.free < 400 ? 'var(--red)' : 'var(--ink-2)' }}>
                {gb(nu.used)}/{gb(nodeVmMb(s))} GB
              </text>
              <Band x={f.x + 8} y={g.nodeKernel.y} w={f.w - 16} h={g.nodeKernel.h} label="jezgra VM-a" size={g.small} hatch={hit ? 'var(--red)' : 'var(--hl-blue-ink)'} stroke={hit ? 'var(--red)' : 'var(--ink)'} ink={hit ? 'var(--red)' : 'var(--ink)'} seed={8710 + n} />
              {safeNode === n && <Check x={f.x + f.w - 26} y={g.nodeKernel.y + g.nodeKernel.h / 2} size={9} seed={8720 + n} />}
            </g>
          )
        })}
      {s.apps.map((a, i) => (
        <Slot key={a.id} a={a} s={s} g={g} x={pos[i][0]} y={pos[i][1]} ids={ids} selected={a.id === s.selected} />
      ))}
      {/* the layer under the apps */}
      {cloud ? (
        <Band x={8} y={g.cloudHyper.y} w={g.W - 16} h={g.cloudHyper.h} label={narrow ? 'hipervizor (oblak)' : 'hipervizor pružatelja oblaka + OS domaćina'} size={15} hatch="var(--ink-3)" seed={8730} />
      ) : vm ? (
        <g>
          <Band x={8} y={g.band.y} w={g.W - 16} h={g.band.h} label="hipervizor + OS domaćina" sub="1 GB" size={16} subSize={g.mono} hatch="var(--ink-3)" seed={8731} />
          {/* the ✓ sits on the hypervisor's top edge under the attacker's column, above the band's lettering */}
          {attacker >= 0 && <Check x={pos[attacker][0] + g.slotW / 2} y={g.band.y - 7} size={8} seed={8732} />}
        </g>
      ) : (
        <Band
          x={8}
          y={g.band.y}
          w={g.W - 16}
          h={g.band.h}
          label={s.kernelPwned ? 'jezgra domaćina – napadnuta' : narrow ? 'jezgra domaćina (jedna)' : 'jezgra domaćina – jedna, zajednička'}
          sub={s.kernelPwned ? undefined : narrow ? 'OS 1 GB + runtime 0,2 GB' : 'OS domaćina 1 GB + izvršno okruženje 0,2 GB'}
          size={16}
          subSize={g.small}
          hatch={s.kernelPwned ? 'var(--red)' : 'var(--hl-blue-ink)'}
          stroke={s.kernelPwned ? 'var(--red)' : 'var(--ink)'}
          ink={s.kernelPwned ? 'var(--red)' : 'var(--ink)'}
          seed={8733}
        />
      )}
      {cracks.map((c, i) => (
        <Crack key={`${s.attacker}-${i}`} pts={c} seed={8740 + i} delay={i * 0.25} />
      ))}
      <RamBar s={s} g={g} ids={ids} />
      {s.apps.length === 0 && (
        <text x={g.W / 2} y={g.rowsTop + 80} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-3)' }}>
          (još nema aplikacija)
        </text>
      )}
    </svg>
  )
}

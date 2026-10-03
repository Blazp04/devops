import { Building, DGroup, DLabel, Diagram, FoodBox, Helm, K8sIcon, NodeFrame, PodShape, Rough, Stepper } from '../../../kit'

const LEVELS = [
  { title: 'Regija oblaka', body: 'Klopa živi u jednoj regiji pružatelja oblaka; klaster je raspoređen po tri zone dostupnosti. Pad cijele zone vidite samo ovdje.' },
  { title: 'Klaster', body: 'U regiji je klaster: upravljačka ravnina (API poslužitelj, etcd, raspoređivač) i tri radna čvora. Ovdje živi željeno stanje.' },
  { title: 'Čvor', body: 'Jedan čvor, node-2: 4 vCPU i 16 GiB, na njemu kubelet i nekoliko Podova. Raspoređivač ih je ovamo stavio prema `requests`.' },
  { title: 'Pod', body: 'Jedan Pod klopa-api: vlastita IP adresa, varijable okoline (popust, lozinka baze iz Secreta), provjere spremnosti i živosti.' },
  { title: 'Kontejner', body: 'U Podu je kontejner: proces iz slike 2.0.2 u vlastitim namespaceovima (mrežu dijeli s cijelim Podom), s cgroup ograničenjima (`limits`).' },
  { title: 'Linux proces', body: 'Na dnu je običan Linux proces: gunicorn s PID-om 1 i nekoliko radnika – isti prikaz PID-ova kao u 7. predavanju.' },
]

const W = 420
const H = 300

function Level({ step }: { step: number }) {
  switch (step) {
    case 0:
      return (
        <>
          <DGroup x={12} y={14} w={396} h={272} />
          <DLabel x={26} y={42} text="regija oblaka" anchor="start" size={17} />
          <Rough shape={{ k: 'rect', x: 34, y: 62, w: 352, h: 200 }} stroke="var(--pen)" strokeWidth={1.8} multi seed={2400} />
          <Helm x={56} y={86} r={14} />
          <DLabel x={78} y={92} text="klaster" anchor="start" size={16} tone="blue" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <DGroup x={56 + i * 112} y={108} w={96} h={118} dashed />
              <Building x={78 + i * 112} y={126} w={52} h={70} />
              <DLabel x={104 + i * 112} y={250} text={`zona ${'abc'[i]}`} mono size={16} />
            </g>
          ))}
        </>
      )
    case 1:
      return (
        <>
          <Rough shape={{ k: 'rect', x: 14, y: 18, w: 392, h: 264 }} stroke="var(--pen)" strokeWidth={1.8} multi seed={2401} />
          <Helm x={50} y={58} r={20} />
          <DLabel x={196} y={50} text="upravljačka ravnina" size={16} tone="blue" />
          <K8sIcon kind="api" x={130} y={104} size={40} />
          <K8sIcon kind="etcd" x={200} y={104} size={40} />
          <K8sIcon kind="sched" x={270} y={104} size={40} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Building x={50 + i * 125} y={168} w={70} h={78} />
              <DLabel x={85 + i * 125} y={270} text={`node-${i + 1}`} mono size={16} />
            </g>
          ))}
          <Rough shape={{ k: 'ellipse', cx: 210, cy: 214, w: 118, h: 124 }} stroke="var(--red)" strokeWidth={2} seed={2411} />
        </>
      )
    case 2:
      return (
        <NodeFrame x={14} y={20} w={392} h={260} name="node-2" spec="4 vCPU · 16 GiB" cpu={{ used: 1300, total: 3920 }} mem={{ used: 2200, total: 13622 }}>
          <PodShape x={80} y={150} size={40} status="running" tone="green" label="api" />
          <Rough shape={{ k: 'ellipse', cx: 80, cy: 152, w: 78, h: 80 }} stroke="var(--red)" strokeWidth={2} seed={2412} />
          <PodShape x={160} y={150} size={40} status="running" tone="green" label="api" />
          <PodShape x={240} y={150} size={40} status="running" tone="teal" label="w" />
          <K8sIcon kind="kubelet" x={334} y={150} size={44} />
        </NodeFrame>
      )
    case 3:
      return (
        <>
          <PodShape x={108} y={150} size={110} status="running" tone="green" label="api" />
          <DLabel x={196} y={92} text="IP 10.244.2.7" anchor="start" mono size={16} />
          <DLabel x={196} y={130} text="env → popust 20 %" anchor="start" mono size={16} />
          <DLabel x={196} y={168} text="Secret → DB_PASSWORD" anchor="start" mono size={16} />
          <DLabel x={196} y={206} text="/ready · /healthz" anchor="start" mono size={16} />
        </>
      )
    case 4:
      return (
        <>
          <FoodBox x={40} y={70} w={130} h={140} />
          <DLabel x={105} y={242} text="kontejner" mono size={16} />
          <Rough shape={{ k: 'ellipse', cx: 105, cy: 140, w: 168, h: 178 }} stroke="var(--red)" strokeWidth={2} seed={2414} />
          <DLabel x={186} y={90} text="ns: pid, mnt" anchor="start" mono size={16} />
          <DLabel x={186} y={122} text="net: dijeli s Podom" anchor="start" mono size={16} />
          <DLabel x={186} y={154} text="cgroup cpu: 300m" anchor="start" mono size={16} />
          <DLabel x={186} y={186} text="cgroup mem: 256Mi" anchor="start" mono size={16} />
          <DLabel x={186} y={218} text="slika 2.0.2 · 7 slojeva" anchor="start" mono size={16} />
        </>
      )
    default:
      return (
        <>
          <Rough shape={{ k: 'rect', x: 20, y: 40, w: 380, h: 210 }} stroke="var(--ink-2)" strokeWidth={1.6} seed={2406} />
          <DLabel x={38} y={78} text="$ ps -o pid,cmd" anchor="start" mono size={16} tone="blue" />
          <DLabel x={38} y={116} text="PID 1  gunicorn: master" anchor="start" mono size={16} />
          <DLabel x={38} y={150} text="PID 7  gunicorn: worker" anchor="start" mono size={16} />
          <DLabel x={38} y={184} text="PID 8  gunicorn: worker" anchor="start" mono size={16} />
          <DLabel x={38} y={228} text="u kontejneru: PID 1 je aplikacija" anchor="start" size={16} />
        </>
      )
  }
}

/** Powers of ten: the same system at six zoom levels, from the cloud region down to one Linux process. */
export function PowersOfTen() {
  return (
    <Stepper title="Potencije desetke: ista Klopa na šest razina" steps={LEVELS.map((l) => ({ title: l.title, body: l.body.replace(/`/g, '') }))} caption="Crvenom olovkom zaokruženo je ono u što zumiramo sljedeće. Natrag vraća zum: svaka razina skriva kvarove razina ispod sebe.">
      {(step) => (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <Diagram width={W} height={H} label={`Razina ${step + 1} od 6: ${LEVELS[step].title}. ${LEVELS[step].body.replace(/`/g, '')}`}>
            <Level step={step} />
          </Diagram>
        </div>
      )}
    </Stepper>
  )
}

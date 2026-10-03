import { Diagram, DLabel, DNode, Edge, FoodBox, Stepper, TrayStack, useWidth } from '../../../kit'
import { Fade } from './Drawn'

type P = [number, number]

interface Geo {
  W: number
  H: number
  hand: number
  colX: [number, number]
  rowY: number[]
  nodeW: number
  nodeH: number
  head: number
  labelDx: number
  image: { x: number; y: number; w: number; h: number } | null
  box: { w: number; h: number }
}

const WIDE: Geo = { W: 640, H: 410, hand: 13, colX: [150, 490], rowY: [74, 146, 218, 290], nodeW: 176, nodeH: 42, head: 30, labelDx: 12, image: { x: 278, y: 196, w: 84, h: 62 }, box: { w: 132, h: 48 } }
const NARROW: Geo = { W: 320, H: 430, hand: 13, colX: [80, 240], rowY: [76, 150, 224, 298], nodeW: 140, nodeH: 42, head: 30, labelDx: 8, image: null, box: { w: 120, h: 46 } }

const STEPS = [
  {
    title: 'Naredba docker je samo klijent',
    body: (
      <>
        Naredba <code>docker</code> šalje zahtjev REST API-ju pozadinskog procesa (engl. <em>daemon</em>) <code>dockerd</code> (na Linuxu kroz <code>/var/run/docker.sock</code>). Sav posao obavlja taj pozadinski proces.
      </>
    ),
  },
  {
    title: 'dockerd → containerd → runc',
    body: (
      <>
        <code>dockerd</code> posao predaje containerdu, koji drži slike i prati kontejnere. Za svaki kontejner containerd pozove <code>runc</code>: on prema OCI specifikaciji postavi imenske prostore i cgroups, pokrene proces i izađe.
      </>
    ),
  },
  {
    title: 'Kubernetes ne treba dockerd',
    body: (
      <>
        Na čvoru Kubernetesa agent <code>kubelet</code> kroz sučelje CRI razgovara izravno s containerdom ili CRI-O-m. Docker Engine na čvoru nije potreban – posrednik za Docker (dockershim) Kubernetes je uklonio prije nekoliko godina.
      </>
    ),
  },
  {
    title: 'Ista OCI slika svugdje',
    body: (
      <>
        Slika koju je izgradio <code>docker build</code> OCI je slika. Iz istog registra povlači je i laptop s Dockerom i čvor s containerdom ili CRI-O-m – i pokreće je jednako.
      </>
    ),
  },
]

/** DeepDive „Ispod haube”: CLI → dockerd → containerd → runc, and the Kubernetes side via CRI. */
export function UnderHoodStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 600
  const G = wide ? WIDE : NARROW
  const [L, Rx] = G.colX
  const y = G.rowY
  const bottom = (i: number): P => [0, y[i] + G.nodeH / 2 + 2]
  const top = (i: number): P => [0, y[i] - G.nodeH / 2 - 2]
  const at = (x: number, p: P): P => [x, p[1]]
  const boxY = y[3] + G.nodeH / 2 + 34
  return (
    <div ref={ref}>
      <Stepper title="Ispod haube" steps={STEPS}>
        {(step) => (
          <div style={{ maxWidth: wide ? 680 : 380, margin: '0 auto' }}>
            <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}.`}>
              <DLabel x={L} y={G.head} text="laptop s Dockerom" size={G.hand} bold />
              <Fade show={step >= 2}>
                <DLabel x={Rx} y={G.head} text="čvor u Kubernetesu" size={G.hand} bold />
              </Fade>

              {/* Docker side */}
              <DNode x={L} y={y[0]} w={G.nodeW} h={G.nodeH} title="docker (CLI)" tone="blue" status={step === 0 ? 'active' : 'normal'} animate={false} />
              <Edge from={at(L, bottom(0))} to={at(L, top(1))} tone="blue" />
              <DLabel x={L + G.labelDx} y={(y[0] + y[1]) / 2 + 5} text="REST API" size={G.hand} anchor="start" tone="blue" />
              <DNode x={L} y={y[1]} w={G.nodeW} h={G.nodeH} title="dockerd" status={step === 0 ? 'active' : 'normal'} animate={false} />
              <Fade show={step >= 1}>
                <Edge from={at(L, bottom(1))} to={at(L, top(2))} />
                <DLabel x={L + G.labelDx} y={(y[1] + y[2]) / 2 + 5} text="gRPC" size={G.hand} anchor="start" />
                <DNode x={L} y={y[2]} w={G.nodeW} h={G.nodeH} title="containerd" status={step === 1 ? 'active' : 'normal'} animate={false} />
                <Edge from={at(L, bottom(2))} to={at(L, top(3))} />
                <DNode x={L} y={y[3]} w={G.nodeW} h={G.nodeH} title="runc" status={step === 1 ? 'active' : 'normal'} animate={false} />
                <Edge from={at(L, bottom(3))} to={[L, boxY - 4]} tone="green" />
                <FoodBox x={L - G.box.w / 2} y={boxY} w={G.box.w} h={G.box.h} label="proces" labelSize={14} seed={7811} />
              </Fade>

              {/* Kubernetes side */}
              <Fade show={step >= 2}>
                <DNode x={Rx} y={y[0]} w={G.nodeW} h={G.nodeH} title="kubelet" status={step === 2 ? 'active' : 'normal'} animate={false} />
                <Edge from={at(Rx, bottom(0))} to={at(Rx, top(2))} tone="violet" />
                <DLabel x={Rx + G.labelDx} y={y[1] + 5} text="CRI" size={G.hand} anchor="start" tone="violet" />
                <DNode x={Rx} y={y[2]} w={G.nodeW} h={G.nodeH} title={wide ? 'containerd / CRI-O' : 'containerd'} status={step === 2 ? 'active' : 'normal'} animate={false} />
                <Edge from={at(Rx, bottom(2))} to={at(Rx, top(3))} />
                <DNode x={Rx} y={y[3]} w={G.nodeW} h={G.nodeH} title="runc" animate={false} />
                <Edge from={at(Rx, bottom(3))} to={[Rx, boxY - 4]} tone="green" />
                <FoodBox x={Rx - G.box.w / 2} y={boxY} w={G.box.w} h={G.box.h} label="proces" labelSize={14} seed={7821} />
              </Fade>

              {/* the shared OCI image */}
              <Fade show={step >= 3}>
                {G.image ? (
                  <>
                    <TrayStack x={G.image.x} y={G.image.y} w={G.image.w} h={G.image.h} n={3} seed={7831} />
                    <DLabel x={G.image.x + G.image.w / 2} y={G.image.y + G.image.h + 24} text="ista OCI slika" size={G.hand} tone="green" bold />
                    <Edge from={[G.image.x - 4, G.image.y + 30]} to={[L + G.nodeW / 2 + 6, y[2]]} tone="green" dashed />
                    <Edge from={[G.image.x + G.image.w + 4, G.image.y + 30]} to={[Rx - G.nodeW / 2 - 6, y[2]]} tone="green" dashed />
                  </>
                ) : (
                  <DLabel x={G.W / 2} y={G.H - 8} text="obje strane: ista OCI slika" size={G.hand} tone="green" bold />
                )}
              </Fade>
            </Diagram>
          </div>
        )}
      </Stepper>
    </div>
  )
}

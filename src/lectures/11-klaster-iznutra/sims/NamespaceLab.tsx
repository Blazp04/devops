import { useState } from 'react'
import { Diagram, FolderTab, K8sGlyph, PodShape, Rough, Segmented, Terminal, useWidth, type K8sKind, type TerminalLine } from '../../../kit'
import { Hand, Mono } from './Parts'
import { NS_OUTPUT, type NsChoice } from './namespaceData'

const CHOICES: { value: NsChoice; label: string }[] = [
  { value: 'klopa', label: '-n klopa' },
  { value: 'klopa-staging', label: '-n klopa-staging' },
  { value: 'kube-system', label: '-n kube-system' },
  { value: 'all', label: '-A' },
]

/** The control-plane Pods of kind (kube-apiserver-…, etcd-…, kube-scheduler-…, kube-controller-manager-…); `short` fits the wide folder. */
const CP_GLYPHS: { kind: K8sKind; name: string; short: string }[] = [
  { kind: 'api', name: 'apiserver', short: 'api' },
  { kind: 'etcd', name: 'etcd', short: 'etcd' },
  { kind: 'sched', name: 'scheduler', short: 'sched' },
  { kind: 'cm-ctrl', name: 'controller', short: 'ctrl' },
]

function Folders({ choice }: { choice: NsChoice }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = (width ?? 720) < 560
  const W = narrow ? 400 : 720
  const fw = narrow ? 384 : 226
  const fh = narrow ? 178 : 220
  const H = narrow ? 3 * (fh + 16) + 40 : fh + 70
  const at = (i: number) => (narrow ? { x: 8, y: 8 + i * (fh + 16) } : { x: 8 + i * (fw + 11), y: 8 })
  const names = ['klopa', 'klopa-staging', 'kube-system'] as const
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <Diagram width={W} height={H} label="Tri mape (Namespacea): klopa i klopa-staging sadrže Podove istih imena, klopa-api i klopa-worker; kube-system sadrži dijelove upravljačke ravnine.">
          {names.map((ns, i) => {
            const { x, y } = at(i)
            const on = choice === ns || choice === 'all'
            return (
              <g key={ns}>
                {on && <Rough shape={{ k: 'rect', x: x - 4, y: y - 4, w: fw + 8, h: fh + 8 }} seed={4301 + i} stroke="var(--pen)" strokeWidth={2.2} multi />}
                <FolderTab x={x} y={y} w={fw} h={fh} label={ns} labelSize={15} seed={4311 + i * 3} tint={ns === 'kube-system' ? 'var(--note-blue)' : ns === 'klopa' ? 'var(--note-yellow)' : 'var(--note-green)'} />
                {ns !== 'kube-system' ? (
                  <g>
                    {(['klopa-api', 'klopa-worker'] as const).map((p, j) => {
                      const cx = x + (narrow ? 90 + j * 190 : 58 + j * 112)
                      const cy = y + (narrow ? 86 : 96)
                      return (
                        <g key={p}>
                          <PodShape x={cx} y={cy} size={32} status="running" tone={j === 0 ? 'blue' : 'teal'} />
                          <Mono x={cx} y={cy + 44} anchor="middle" color="var(--note-ink)">
                            {p}
                          </Mono>
                        </g>
                      )
                    })}
                    <Hand x={x + 14} y={y + fh - 16} lines={[ns === 'klopa' ? 'produkcija' : 'probno okruženje']} color="var(--note-ink)" />
                  </g>
                ) : (
                  <g>
                    {CP_GLYPHS.map((c, j) => {
                      const gx = x + (narrow ? 26 + j * 90 : 14 + j * 52)
                      const gy = y + (narrow ? 50 : 54)
                      const gw = narrow ? 48 : 40
                      return (
                        <g key={c.kind}>
                          <K8sGlyph kind={c.kind} x={gx} y={gy} w={gw} h={narrow ? 38 : 32} />
                          <Mono x={gx + gw / 2} y={gy + (narrow ? 54 : 48)} anchor="middle" color="var(--note-ink)">
                            {narrow ? c.name : c.short}
                          </Mono>
                        </g>
                      )
                    })}
                    <Hand x={x + 14} y={y + (narrow ? 124 : 126)} lines={['upravljačka ravnina']} color="var(--note-ink)" />
                    <Mono x={x + 14} y={y + (narrow ? 158 : 160)} color="var(--note-ink)">
                      {narrow ? 'kube-proxy ×4 · coredns ×2' : 'kube-proxy ×4'}
                    </Mono>
                    {!narrow && (
                      <Mono x={x + 14} y={y + 184} color="var(--note-ink)">
                        coredns ×2
                      </Mono>
                    )}
                  </g>
                )}
              </g>
            )
          })}
          {!narrow && <Hand x={W / 2} y={H - 12} anchor="middle" lines={['ista imena, različite mape – kao index.ts u dvije mape']} color="var(--pen)" />}
          {narrow && <Hand x={W / 2} y={H - 10} anchor="middle" lines={['ista imena, različite mape']} color="var(--pen)" />}
        </Diagram>
      </div>
    </div>
  )
}

export function NamespaceLab() {
  const [choice, setChoice] = useState<NsChoice>('klopa')
  const lines: TerminalLine[] = NS_OUTPUT[choice]
  return (
    <div>
      <Segmented label="kubectl get pods" value={choice} options={CHOICES} onChange={setChoice} />
      <Folders choice={choice} />
      <Terminal title="Lanin laptop · klaster menza" animate={false} lines={lines} />
    </div>
  )
}

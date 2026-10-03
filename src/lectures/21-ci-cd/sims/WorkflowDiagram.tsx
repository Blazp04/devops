import { Diagram, DNode, DGroup, Edge, DLabel, useWidth } from '../../../kit'

/**
 * Scene 5 „Pipeline kao kod”: how the YAML becomes stations. GitHub Actions: jobs run in parallel unless `needs`
 * orders them. GitLab CI: stages run in order, jobs inside a stage run in parallel.
 */

function Gha({ wide }: { wide: boolean }) {
  if (wide)
    return (
      <Diagram width={720} height={230} label="GitHub Actions: događaj push pokreće poslove lint i test istodobno; build-push čeka oba (needs); deploy-prod čeka build-push i ljudska vrata (environment).">
        <DNode x={70} y={110} w={112} h={50} icon="git" title="push" />
        <DNode x={250} y={58} w={130} h={46} title="lint" status="active" />
        <DNode x={250} y={162} w={130} h={46} title="test" status="active" />
        <DNode x={440} y={110} w={150} h={50} icon="registry" title="build-push" />
        <DNode x={630} y={110} w={150} h={50} icon="lock" title="deploy-prod" dashed status="dim" />
        <Edge from={[126, 100]} to={[184, 62]} />
        <Edge from={[126, 120]} to={[184, 158]} />
        <Edge from={[316, 62]} to={[364, 100]} tone="blue" />
        <Edge from={[316, 158]} to={[364, 120]} tone="blue" />
        <Edge from={[516, 110]} to={[554, 110]} dashed />
        <DLabel x={250} y={118} text="istodobno" anchor="middle" size={14} tone="blue" />
        <DLabel x={440} y={160} text="needs: [lint, test]" anchor="middle" size={14} mono tone="neutral" />
        <DLabel x={618} y={160} text="environment: production" anchor="middle" size={14} mono tone="neutral" />
        <DLabel x={630} y={208} text="predavanje 22 to mijenja" anchor="middle" size={14} tone="neutral" />
      </Diagram>
    )
  return (
    <Diagram width={340} height={474} label="GitHub Actions: događaj push pokreće poslove lint i test istodobno; build-push čeka oba (needs); deploy-prod čeka build-push i ljudska vrata (environment).">
      <DNode x={170} y={34} w={120} h={46} icon="git" title="push" />
      <DNode x={86} y={130} w={132} h={46} title="lint" status="active" />
      <DNode x={254} y={130} w={132} h={46} title="test" status="active" />
      <DNode x={170} y={244} w={170} h={50} icon="registry" title="build-push" />
      <DNode x={170} y={380} w={170} h={50} icon="lock" title="deploy-prod" dashed status="dim" />
      <Edge from={[150, 58]} to={[100, 106]} />
      <Edge from={[190, 58]} to={[240, 106]} />
      <Edge from={[86, 154]} to={[140, 218]} tone="blue" />
      <Edge from={[254, 154]} to={[200, 218]} tone="blue" />
      <Edge from={[170, 304]} to={[170, 354]} dashed />
      <DLabel x={170} y={180} text="istodobno" anchor="middle" size={14} tone="blue" />
      <DLabel x={170} y={292} text="needs: [lint, test]" anchor="middle" size={14} mono tone="neutral" />
      <DLabel x={180} y={334} text="needs: build-push" anchor="start" size={14} mono tone="neutral" />
      <DLabel x={170} y={428} text="environment: production" anchor="middle" size={14} mono tone="neutral" />
      <DLabel x={170} y={456} text="predavanje 22 to mijenja" anchor="middle" size={14} tone="neutral" />
    </Diagram>
  )
}

function GitLab({ wide }: { wide: boolean }) {
  if (wide)
    return (
      <Diagram width={720} height={230} label="GitLab CI: faza test sadrži lint i pytest koji rade istodobno; faza build počinje tek kad cijela faza test prođe.">
        <DNode x={70} y={115} w={112} h={50} icon="git" title="push" />
        <DGroup x={160} y={14} w={250} h={200} label="stage: test" tone="blue" />
        <DNode x={285} y={82} w={150} h={46} title="lint" status="active" />
        <DNode x={285} y={160} w={150} h={46} title="pytest" status="active" />
        <DGroup x={460} y={14} w={240} h={200} label="stage: build" />
        <DNode x={580} y={120} w={170} h={50} icon="registry" title="build-push" />
        <Edge from={[126, 115]} to={[158, 115]} />
        <Edge from={[412, 120]} to={[494, 120]} tone="blue" />
        <DLabel x={285} y={128} text="istodobno" anchor="middle" size={14} tone="blue" />
        <DLabel x={580} y={180} text="tek kad cijela faza prođe" anchor="middle" size={14} tone="neutral" />
      </Diagram>
    )
  return (
    <Diagram width={340} height={400} label="GitLab CI: faza test sadrži lint i pytest koji rade istodobno; faza build počinje tek kad cijela faza test prođe.">
      <DNode x={170} y={34} w={120} h={46} icon="git" title="push" />
      <DGroup x={10} y={74} w={320} h={142} label="stage: test" tone="blue" />
      <DNode x={92} y={150} w={140} h={46} title="lint" status="active" />
      <DNode x={248} y={150} w={140} h={46} title="pytest" status="active" />
      <DGroup x={10} y={250} w={320} h={136} label="stage: build" />
      <DNode x={170} y={320} w={170} h={50} icon="registry" title="build-push" />
      <Edge from={[170, 58]} to={[170, 76]} />
      <Edge from={[170, 216]} to={[170, 292]} tone="blue" />
      <DLabel x={170} y={204} text="istodobno" anchor="middle" size={14} tone="blue" />
      <DLabel x={170} y={374} text="tek kad cijela faza prođe" anchor="middle" size={14} tone="neutral" />
    </Diagram>
  )
}

export function WorkflowDiagram({ kind }: { kind: 'gha' | 'gitlab' }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w !== null && w >= 620
  return (
    <div ref={ref}>
      <div style={wide ? undefined : { maxWidth: 420, margin: '0 auto' }}>{kind === 'gha' ? <Gha wide={wide} /> : <GitLab wide={wide} />}</div>
    </div>
  )
}

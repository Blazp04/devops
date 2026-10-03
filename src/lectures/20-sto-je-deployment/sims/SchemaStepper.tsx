import { Diagram, Stepper, useWidth } from '../../../kit'
import { SCHEMA_FRAMES, SCHEMA_H } from '../lib/schema'
import { SchemaDrawing } from './SchemaDrawing'

const STEPS = [
  {
    title: 'Petak: preimenovanje u jednom koraku',
    body: (
      <>
        Migracija je preimenovala stupac <code>cijena</code> u <code>cijena_s_pdv</code>, a uvođenje je tek počelo. Stari Podovi 1.4.1 i dalje traže <code>cijena</code> – i svaka njihova narudžba završi s HTTP 500.
      </>
    ),
    aria: 'Migracija je preimenovala stupac cijena u cijena_s_pdv, a uvođenje je tek počelo. Stari Podovi 1.4.1 i dalje traže cijena – i svaka njihova narudžba završi s HTTP 500.',
  },
  {
    title: '① Proširi: dodajte novi stupac',
    body: (
      <>
        Dodajte <code>cijena_s_pdv</code> uz stari stupac i popunite ga za postojeće narudžbe. Okidač drži oba stupca usklađena, što god koja verzija upiše. Verzija 1.4.1 ništa ne primjećuje.
      </>
    ),
    aria: 'Dodajte cijena_s_pdv uz stari stupac i popunite ga za postojeće narudžbe. Okidač drži oba stupca usklađena, što god koja verzija upiše. Verzija 1.4.1 ništa ne primjećuje.',
  },
  {
    title: '② Prebacite čitatelje: uvedite 2.0',
    body: (
      <>
        Uvođenje sada može trajati koliko god treba: 1.4.1 čita i upisuje <code>cijena</code>, 2.0.0 čita i upisuje samo <code>cijena_s_pdv</code>, a okidač popunjava drugi stupac. Povratak na 1.4.1 i dalje je siguran.
      </>
    ),
    aria: 'Uvođenje sada može trajati koliko god treba: 1.4.1 čita i upisuje cijena, 2.0.0 čita i upisuje samo cijena_s_pdv, a okidač popunjava drugi stupac. Povratak na 1.4.1 i dalje je siguran.',
  },
  {
    title: '③ Suzi: obrišite stari stupac',
    body: (
      <>
        Tek kad nijedan Pod više ne čita ni ne upisuje <code>cijena</code> (i kad se sigurno ne vraćate), briše se okidač, a zatim i stari stupac. Od tog trenutka povratak na 1.4.1 više ne radi.
      </>
    ),
    aria: 'Tek kad nijedan Pod više ne čita ni ne upisuje cijena (i kad se sigurno ne vraćate), briše se okidač, a zatim i stari stupac. Od tog trenutka povratak na 1.4.1 više ne radi.',
  },
]

/** Scene 5: expand / contract in three steps, after Friday's one-step rename. */
export function SchemaStepper() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = (width ?? 0) >= 560
  return (
    <div ref={ref}>
      <Stepper steps={STEPS} title="Promjena sheme u tri koraka" autoPlay={0}>
        {(step) => (
          <div style={wide ? undefined : { maxWidth: 460, margin: '0 auto' }}>
            <Diagram width={wide ? 560 : 340} height={SCHEMA_H} label={`${STEPS[step].title}. ${STEPS[step].aria}`}>
              <SchemaDrawing frame={SCHEMA_FRAMES[step]} layout={wide ? 'wide' : 'narrow'} />
            </Diagram>
          </div>
        )}
      </Stepper>
    </div>
  )
}

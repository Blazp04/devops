import { Arrow, Cross, Diagram, K8sGlyph, Rough, Vault } from '../../../kit'
import { AddressCard, Fit, KeyGlyph, Lines, LockedBox, Txt } from './Draw'

const WIDE_MIN = Math.ceil((720 * 12) / 14)

function Wide() {
  return (
    <Diagram width={720} height={250} label="U Gitu smiju biti zaključana kutija (SealedSecret ili SOPS) i adresa (ExternalSecret); ključ nikad. Ključ za otključavanje je u klasteru, a vrijednost iza adrese u trezoru.">
      <Rough shape={{ k: 'rect', x: 10, y: 14, w: 470, h: 222 }} seed={3201} stroke="var(--ink-3)" strokeWidth={1.3} dash="7 6" />
      <Txt x={24} y={42} v="hand" size={22} fill="var(--ink-2)" anchor="start">
        u Gitu
      </Txt>
      <LockedBox x={46} y={78} w={92} h={66} seed={3202} />
      <Lines x={92} y={178} lines={['brava', 'SealedSecret · SOPS']} gap={20} v="display" size={15} fill="var(--ink-2)" />
      <AddressCard x={182} y={84} w={140} h={56} lines={['trezor:', 'klopa/sms']} size={15} seed={3203} />
      <Lines x={252} y={178} lines={['adresa', 'ExternalSecret']} gap={20} v="display" size={15} fill="var(--ink-2)" />
      <KeyGlyph x={364} y={110} s={1.4} seed={3204} />
      <Cross x={396} y={110} size={22} />
      <Lines x={400} y={178} lines={['ključ', 'nikad']} gap={20} v="display" size={15} fill="var(--red)" />
      <K8sGlyph kind="cm-ctrl" x={540} y={52} w={48} h={38} />
      <Txt x={564} y={112} v="hand" size={21} fill="var(--pen)">
        bravu otvara klaster
      </Txt>
      <Arrow pts={[[92, 74], [300, 56], [530, 66]]} stroke="var(--pen)" strokeWidth={1.3} dash="5 5" seed={3205} />
      <Vault x={540} y={150} w={56} h={52} seed={3206} />
      <Txt x={640} y={184} v="display" size={15} fill="var(--ink-2)" anchor="start">
        trezor
      </Txt>
      <Txt x={568} y={232} v="hand" size={21} fill="var(--green)">
        adresa vodi do trezora
      </Txt>
      <Arrow pts={[[262, 142], [380, 214], [532, 186]]} stroke="var(--green)" strokeWidth={1.3} dash="5 5" seed={3207} />
    </Diagram>
  )
}

function Narrow() {
  return (
    <Diagram width={400} height={420} label="U Gitu smiju biti zaključana kutija (SealedSecret ili SOPS) i adresa (ExternalSecret); ključ nikad. Ključ za otključavanje je u klasteru, a vrijednost iza adrese u trezoru.">
      <Rough shape={{ k: 'rect', x: 8, y: 10, w: 384, h: 240 }} seed={3211} stroke="var(--ink-3)" strokeWidth={1.3} dash="7 6" />
      <Txt x={22} y={38} v="hand" size={22} fill="var(--ink-2)" anchor="start">
        u Gitu
      </Txt>
      <LockedBox x={28} y={70} w={86} h={62} seed={3212} />
      <Lines x={72} y={168} lines={['brava', 'SealedSecret', 'SOPS']} gap={20} v="display" size={15} fill="var(--ink-2)" />
      <AddressCard x={140} y={74} w={124} h={56} lines={['trezor:', 'klopa/sms']} size={15} seed={3213} />
      <Lines x={202} y={168} lines={['adresa', 'ExternalSecret']} gap={20} v="display" size={15} fill="var(--ink-2)" />
      <KeyGlyph x={292} y={100} s={1.3} seed={3214} />
      <Cross x={322} y={100} size={20} />
      <Lines x={330} y={168} lines={['ključ', 'nikad']} gap={20} v="display" size={15} fill="var(--red)" />
      <K8sGlyph kind="cm-ctrl" x={50} y={290} w={48} h={38} />
      <Lines x={74} y={360} lines={['bravu otvara', 'klaster']} gap={22} v="hand" size={22} fill="var(--pen)" />
      <Arrow pts={[[70, 136], [74, 282]]} stroke="var(--pen)" strokeWidth={1.3} dash="5 5" seed={3215} />
      <Vault x={250} y={284} w={56} h={52} seed={3216} />
      <Lines x={278} y={366} lines={['adresa vodi', 'do trezora']} gap={22} v="hand" size={22} fill="var(--green)" />
      <Arrow pts={[[202, 136], [262, 278]]} stroke="var(--green)" strokeWidth={1.3} dash="5 5" seed={3217} />
    </Diagram>
  )
}

/** „Brava ili adresa”: what may go into Git (a lock or an address) and what never may (the key). */
export function LockOrAddress() {
  return <Fit wideMin={WIDE_MIN}>{(wide) => (wide ? <Wide /> : <Narrow />)}</Fit>
}

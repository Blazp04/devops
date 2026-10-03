/**
 * Doodles: the illustration grammar of the notebook (see src/design-lab/biljeznica/README.md).
 * Characters, menza things (tray = request, redar = load balancer, server faces, lunchbox = Pod, luggage tag =
 * Service, envelope = Secret, laptop = terminal), paper (marker, tape, sticky notes, stamps), section-head props and
 * small 64 × 48 doodles. Live reference: /kit/crtezi. Styles: ./doodles.css (imported once from src/main.tsx).
 */
export { Person, Lana, Davor, Mira, Petra, Iva, Redar, Student, StudentQueue, Crowd, PeekDavor } from './Characters'
export type { PersonProps } from './Characters'
export {
  ServerFace,
  ServerCard,
  Brain,
  Plate,
  TrayDefs,
  Tray,
  SpeechBubble,
  Helm,
  Envelope,
  Lunchbox,
  ServiceTag,
  Laptop,
  Cylinder,
  SvgStamp,
  CoffeeRing,
  ClockIcon,
} from './Things'
export { Mark, Tape, StickyNote, Stamp, MarginDoodle } from './Paper'
export {
  SectionProp,
  PropClock,
  PropBolt,
  PropHelm,
  PropFlip,
  PropBoxes,
  PropQuestion,
  PropIndex,
  PropQueue,
  PropBox,
  PropGit,
  PropLock,
  PropLoop,
} from './Props'
export { Doodle, DoodleIcon } from './Doodle'
export { PROP_KINDS, DOODLE_KINDS, STUDENTS } from './types'
export type {
  Hair,
  Mood,
  Holding,
  Build,
  CharacterProps,
  ServerMood,
  LunchboxState,
  AppVersion,
  BubbleTone,
  MarkColor,
  NoteColor,
  TapeColor,
  StampTone,
  PropKind,
  DoodleKind,
  StudentLook,
} from './types'

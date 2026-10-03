/**
 * SVG diagrams in the notebook's hand: the responsive canvas, nodes (pencil boxes with doodle icons), pencil edges,
 * request trays, groups, labels, marker bars, the Kubernetes shapes (lunchbox Pods, node frames, hand-drawn kinds)
 * and the doodles they are made of. Styles: ./diagram.css (imported once from src/main.tsx).
 */
export { Diagram, DiagramDefs, DiagramScale, DNode, Edge, Packet, DGroup, DLabel, DBar } from './Diagram'
export { NodeGlyph } from './Glyphs'
export { GLYPH_KINDS, isGlyphKind, type GlyphKind } from './glyph-kinds'
export {
  edgePath,
  curveControl,
  strokeOf,
  fillOf,
  markerOf,
  trayFillOf,
  useSvgId,
  pathTimes,
  pointAt,
  diagramIds,
  useDiagramIds,
  useDiagramScale,
  minUnits,
  DIAGRAM_TONES,
  type DiagramTone,
  type DiagramIds,
} from './helpers'
export { K8sIcon, PodShape, NodeFrame, FreeSlot } from './K8s'
export { K8sGlyph } from './K8sGlyphs'
export { podStatusLabel, POD_STATUS, POD_TONE, K8S_KINDS, KIND_LABEL, type PodStatus, type PodTone, type K8sKind } from './k8s-helpers'
/* doodles added by the diagram area (live in src/kit/doodles/diagram-doodles.tsx) */
export {
  FoodBox,
  MiniLunchbox,
  TrayStack,
  Shelf,
  CommitString,
  RecipeCard,
  Clipboard,
  FolderTab,
  MenzaGate,
  Elastic,
  KitchenTimer,
  Fridge,
  Drawer,
  LoopArrows,
  Magnifier,
  LoopMagnifier,
  Building,
  Vault,
  Brace,
  Phone,
  BoxedComputer,
  Disk,
  Cloud,
  Globe,
  Network,
  Signpost,
  CounterWindow,
  Burst,
  MiniPerson,
  MiniFace,
  QueueSlots,
  MiniLaptop,
  MiniServer,
} from '../doodles/diagram-doodles'
/* the running example's map data (the StoryMap component itself is exported from src/kit/index.ts) */
export { STORY_LECTURES, storyStage, mapFont, type StoryStage, type StoryItem, type StoryLink, type MapKind, type MapFont } from '../story/story-map'

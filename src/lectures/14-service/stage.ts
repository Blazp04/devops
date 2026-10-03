/**
 * Geometry of the Service stage (client + luggage tag on node-1 on the left, Pods as rows on the right).
 * Two layouts picked by the container width: wide (viewBox 760, ≥ 700 px so 13-unit lettering stays ≥ 12 px) and
 * narrow (viewBox 400, max 460 px, 14.5-unit lettering ≥ 12 px down to 331 px).
 */
export type Pt = [number, number]
export type StageKind = 'wide' | 'narrow'

export interface StageGeo {
  kind: StageKind
  W: number
  H: number
  /** sizes in viewBox units */
  mono: number
  hand: number
  podSize: number
  rowH: number
  node1: { x: number; y: number; w: number; h: number }
  client: Pt
  tag: { x: number; y: number; w: number; h: number }
  /** where trays leave the client, enter the tag and where the Service lines start */
  clientOut: Pt
  tagIn: Pt
  tagOut: Pt
  /** selector lines under the tag (top-left of the first line) */
  selector: Pt
  rules: { x: number; y: number; w: number; h: number; cols: number }
  /** „the same rules on node-2 and node-3” note (start of the baseline) */
  rulesNote: Pt
  /** staging Namespace / ghost of a vanished Pod */
  extra: { x: number; y: number; w: number; h: number }
  /** narrow only: the vertical bus from the tag down to the Pod rows */
  trunkX: number | null
  /** the first row's centre y and how many rows are laid out */
  rowY0: number
  rows: number
  podX: number
  stickerX: number
  stickerW: number
  captionX: number
  barX: number
  barW: number
}

export const WIDE_MIN_PX = 700
const WIDE_ROWS = 8

/** Rows are centred on the right half (wide) or stacked under the header (narrow). */
export function stageGeometry(kind: StageKind, nPods: number, extra: boolean): StageGeo {
  if (kind === 'wide') {
    const rowH = 56
    const rows = WIDE_ROWS
    const shown = Math.min(rows, Math.max(1, nPods))
    const H = Math.max(extra ? 486 : 404, shown * rowH + 40)
    const rowY0 = H / 2 - ((shown - 1) * rowH) / 2
    return {
      kind,
      W: 760,
      H,
      mono: 13,
      hand: 18,
      podSize: 38,
      rowH,
      node1: { x: 8, y: 14, w: 262, h: 352 },
      // trays run along the tag's lower band, under its lettering (name, ClusterIP, type)
      client: [56, 182],
      tag: { x: 104, y: 104, w: 154, h: 90 },
      clientOut: [84, 182],
      tagIn: [106, 182],
      tagOut: [258, 182],
      selector: [114, 226],
      rules: { x: 20, y: 286, w: 238, h: 66, cols: 2 },
      rulesNote: extra ? [20, 474] : [20, 392],
      extra: { x: 8, y: 376, w: 262, h: 72 },
      trunkX: null,
      rowY0,
      rows,
      podX: 330,
      stickerX: 360,
      stickerW: 112,
      captionX: 482,
      barX: 612,
      barW: 132,
    }
  }
  const rowH = 54
  const rows = Math.max(4, Math.min(8, nPods))
  const rowY0 = 222
  const H = rowY0 - rowH / 2 + rows * rowH + 126 + (extra ? 96 : 0)
  return {
    kind,
    W: 400,
    H,
    mono: 15,
    hand: 21.5,
    podSize: 34,
    rowH,
    node1: { x: 6, y: 6, w: 388, h: 160 },
    client: [60, 88],
    tag: { x: 104, y: 42, w: 214, h: 86 },
    clientOut: [88, 88],
    tagIn: [106, 85],
    tagOut: [116, 128],
    selector: [104, 156],
    rules: { x: 10, y: rowY0 - rowH / 2 + rows * rowH + 10, w: 380, h: 80, cols: 3 },
    rulesNote: [14, rowY0 - rowH / 2 + rows * rowH + 114],
    extra: { x: 6, y: rowY0 - rowH / 2 + rows * rowH + 130, w: 388, h: 86 },
    trunkX: 16,
    rowY0,
    rows,
    podX: 52,
    stickerX: 80,
    stickerW: 126,
    captionX: 209,
    barX: 310,
    barW: 72,
  }
}

/** Centre y of row i. */
export function rowY(g: StageGeo, i: number): number {
  return g.rowY0 + i * g.rowH
}

/** The Pod's „port” on its left edge, where the Service line ends (bible: never on the node's edge). */
export function portOf(g: StageGeo, i: number): Pt {
  return [g.podX - g.podSize * 0.65 - 3, rowY(g, i) + 3]
}

/** Polyline a tray follows from the client to Pod row i (through node-1's rules, drawn as the tag). */
export function routeTo(g: StageGeo, i: number): Pt[] {
  const port = portOf(g, i)
  if (g.trunkX === null) return [g.clientOut, g.tagIn, g.tagOut, port]
  return [g.clientOut, g.tagIn, g.tagOut, [g.trunkX, g.tagOut[1] + 48], [g.trunkX, port[1]], port]
}

/** A connection refused at the Service (0 endpoints): the tray stops at the rules. */
export function routeRefused(g: StageGeo): Pt[] {
  return [g.clientOut, g.tagIn, g.tagOut]
}

/**
 * A tray dialling a Pod IP directly (no Service, no rules): up out of the client, along the top of node-1 and
 * straight to that Pod's row – or to the ghost row of the Pod that no longer exists.
 */
export function routeDirect(g: StageGeo, row: number): Pt[] {
  const port = portOf(g, row)
  const top: Pt = [g.client[0], g.client[1] - 22]
  if (g.kind === 'wide') return [top, [g.client[0], g.node1.y + 6], [port[0] - 16, g.node1.y + 6], [port[0] - 16, port[1]], port]
  return [top, [g.client[0], g.node1.y + 4], [6, g.node1.y + 4], [6, port[1]], port]
}

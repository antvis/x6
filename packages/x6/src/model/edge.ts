import { ObjectExt, StringExt, Size, KeyValue } from '@antv/x6-common'
import { Point, Polyline } from '@antv/x6-geometry'
import { Registry } from '../registry/registry'
import {
  Attr,
  Router,
  Connector,
  EdgeAnchor,
  NodeAnchor,
  ConnectionPoint,
} from '../registry'
import { Markup } from '../view/markup'
import { ShareRegistry } from './registry'
import { Store } from './store'
import { Cell } from './cell'
import { Node } from './node'

export class Edge<
  Properties extends Edge.Properties = Edge.Properties,
> extends Cell<Properties> {
  protected static defaults: Edge.Defaults = {}
  protected readonly store: Store<Edge.Properties>

  protected get [Symbol.toStringTag]() {
    return Edge.toStringTag
  }

  constructor(metadata: Edge.Metadata = {}) {
    super(metadata)
  }

  protected preprocess(metadata: Edge.Metadata, ignoreIdCheck?: boolean) {
    const {
      source,
      sourceCell,
      sourcePort,
      sourcePoint,
      target,
      targetCell,
      targetPort,
      targetPoint,
      ...others
    } = metadata

    const data = others as Edge.BaseOptions
    const isValidId = (val: any): val is string =>
      typeof val === 'string' || typeof val === 'number'

    if (source != null) {
      if (Cell.isCell(source)) {
        data.source = { cell: source.id }
      } else if (isValidId(source)) {
        data.source = { cell: source }
      } else if (Point.isPoint(source)) {
        data.source = source.toJSON()
      } else if (Array.isArray(source)) {
        data.source = { x: source[0], y: source[1] }
      } else {
        const cell = (source as Edge.TerminalCellLooseData).cell
        if (Cell.isCell(cell)) {
          data.source = {
            ...source,
            cell: cell.id,
          }
        } else {
          data.source = source as Edge.TerminalCellData
        }
      }
    }

    if (sourceCell != null || sourcePort != null) {
      let terminal = data.source as Edge.TerminalCellData
      if (sourceCell != null) {
        const id = isValidId(sourceCell) ? sourceCell : sourceCell.id
        if (terminal) {
          terminal.cell = id
        } else {
          terminal = data.source = { cell: id }
        }
      }

      if (sourcePort != null && terminal) {
        terminal.port = sourcePort
      }
    } else if (sourcePoint != null) {
      data.source = Point.create(sourcePoint).toJSON()
    }

    if (target != null) {
      if (Cell.isCell(target)) {
        data.target = { cell: target.id }
      } else if (isValidId(target)) {
        data.target = { cell: target }
      } else if (Point.isPoint(target)) {
        data.target = target.toJSON()
      } else if (Array.isArray(target)) {
        data.target = { x: target[0], y: target[1] }
      } else {
        const cell = (target as Edge.TerminalCellLooseData).cell
        if (Cell.isCell(cell)) {
          data.target = {
            ...target,
            cell: cell.id,
          }
        } else {
          data.target = target as Edge.TerminalCellData
        }
      }
    }

    if (targetCell != null || targetPort != null) {
      let terminal = data.target as Edge.TerminalCellData

      if (targetCell != null) {
        const id = isValidId(targetCell) ? targetCell : targetCell.id
        if (terminal) {
          terminal.cell = id
        } else {
          terminal = data.target = { cell: id }
        }
      }

      if (targetPort != null && terminal) {
        terminal.port = targetPort
      }
    } else if (targetPoint != null) {
      data.target = Point.create(targetPoint).toJSON()
    }

    return super.preprocess(data, ignoreIdCheck)
  }

  protected setup() {
    super.setup()
    this.on('change:labels', (args) => this.onLabelsChanged(args))
    this.on('change:vertices', (args) => this.onVertexsChanged(args))
  }

  isEdge(): this is Edge {
    return true
  }

  // #region terminal

  disconnect(options: Edge.SetOptions = {}) {
    this.store.set(
      {
        source: { x: 0, y: 0 },
        target: { x: 0, y: 0 },
      },
      options,
    )
    return this
  }

  get source() {
    return this.getSource()
  }

  set source(data: Edge.TerminalData) {
    this.setSource(data)
  }

  getSource() {
    return this.getTerminal('source')
  }

  getSourceCellId() {
    return (this.source as Edge.TerminalCellData).cell
  }

  getSourcePortId() {
    return (this.source as Edge.TerminalCellData).port
  }

  setSource(
    node: Node,
    args?: Edge.SetCellTerminalArgs,
    options?: Edge.SetOptions,
  ): this
  setSource(
    edge: Edge,
    args?: Edge.SetEdgeTerminalArgs,
    options?: Edge.SetOptions,
  ): this
  setSource(
    point: Point | Point.PointLike,
    args?: Edge.SetTerminalCommonArgs,
    options?: Edge.SetOptions,
  ): this
  setSource(args: Edge.TerminalData, options?: Edge.SetOptions): this
  setSource(
    source: Node | Edge | Point | Point.PointLike | Edge.TerminalData,
    args?: Edge.SetTerminalCommonArgs | Edge.SetOptions,
    options: Edge.SetOptions = {},
  ) {
    return this.setTerminal('source', source, args, options)
  }

  get target() {
    return this.getTarget()
  }

  set target(data: Edge.TerminalData) {
    this.setTarget(data)
  }

  getTarget() {
    return this.getTerminal('target')
  }

  getTargetCellId() {
    return (this.target as Edge.TerminalCellData).cell
  }

  getTargetPortId() {
    return (this.target as Edge.TerminalCellData).port
  }

  setTarget(
    edge: Node,
    args?: Edge.SetCellTerminalArgs,
    options?: Edge.SetOptions,
  ): this
  setTarget(
    edge: Edge,
    args?: Edge.SetEdgeTerminalArgs,
    options?: Edge.SetOptions,
  ): this
  setTarget(
    point: Point | Point.PointLike,
    args?: Edge.SetTerminalCommonArgs,
    options?: Edge.SetOptions,
  ): this
  setTarget(args: Edge.TerminalData, options?: Edge.SetOptions): this
  setTarget(
    target: Node | Edge | Point | Point.PointLike | Edge.TerminalData,
    args?: Edge.SetTerminalCommonArgs | Edge.SetOptions,
    options: Edge.SetOptions = {},
  ) {
    return this.setTerminal('target', target, args, options)
  }

  getTerminal(type: Edge.TerminalType) {
    return { ...this.store.get(type) } as Edge.TerminalData
  }

  setTerminal(
    type: Edge.TerminalType,
    terminal: Node | Edge | Point | Point.PointLike | Edge.TerminalData,
    args?: Edge.SetTerminalCommonArgs | Edge.SetOptions,
    options: Edge.SetOptions = {},
  ): this {
    // `terminal` is a cell
    if (Cell.isCell(terminal)) {
      this.store.set(
        type,
        ObjectExt.merge({}, args, { cell: terminal.id }),
        options,
      )
      return this
    }

    // `terminal` is a point-like object
    const p = terminal as Point.PointLike
    if (Point.isPoint(terminal) || (p.x != null && p.y != null)) {
      this.store.set(
        type,
        ObjectExt.merge({}, args, { x: p.x, y: p.y }),
        options,
      )
      return this
    }

    // `terminal` is an object
    this.store.set(
      type,
      ObjectExt.cloneDeep(terminal as Edge.TerminalData),
      options,
    )

    return this
  }

  getSourcePoint() {
    return this.getTerminalPoint('source')
  }

  getTargetPoint() {
    return this.getTerminalPoint('target')
  }

  protected getTerminalPoint(type: Edge.TerminalType): Point {
    const terminal = this[type]
    if (Point.isPointLike(terminal)) {
      return Point.create(terminal)
    }

    const cell = this.getTerminalCell(type)
    if (cell) {
      return cell.getConnectionPoint(this as any, type)
    }

    return new Point()
  }

  getSourceCell() {
    return this.getTerminalCell('source')
  }

  getTargetCell() {
    return this.getTerminalCell('target')
  }

  protected getTerminalCell(type: Edge.TerminalType) {
    if (this.model) {
      const cellId =
        type === 'source' ? this.getSourceCellId() : this.getTargetCellId()
      if (cellId) {
        return this.model.getCell(cellId)
      }
    }

    return null
  }

  getSourceNode() {
    return this.getTerminalNode('source')
  }

  getTargetNode() {
    return this.getTerminalNode('target')
  }

  protected getTerminalNode(type: Edge.TerminalType): Node | null {
    let cell: Cell | null = this // eslint-disable-line
    const visited: { [id: string]: boolean } = {}

    while (cell && cell.isEdge()) {
      if (visited[cell.id]) {
        return null
      }
      visited[cell.id] = true
      cell = cell.getTerminalCell(type)
    }

    return cell && cell.isNode() ? cell : null
  }

  // #endregion

  // #region router

  get router() {
    return this.getRouter()
  }

  set router(data: Edge.RouterData | undefined) {
    if (data == null) {
      this.removeRouter()
    } else {
      this.setRouter(data)
    }
  }

  getRouter() {
    return this.store.get<Edge.RouterData>('router')
  }

  setRouter(name: string, args?: KeyValue, options?: Edge.SetOptions): this
  setRouter(router: Edge.RouterData, options?: Edge.SetOptions): this
  setRouter(
    name?: string | Edge.RouterData,
    args?: KeyValue,
    options?: Edge.SetOptions,
  ) {
    if (typeof name === 'object') {
      this.store.set('router', name, args)
    } else {
      this.store.set('router', { name, args }, options)
    }
    return this
  }

  removeRouter(options: Edge.SetOptions = {}) {
    this.store.remove('router', options)
    return this
  }

  // #endregion

  // #region connector

  get connector() {
    return this.getConnector()
  }

  set connector(data: Edge.ConnectorData | undefined) {
    if (data == null) {
      this.removeConnector()
    } else {
      this.setConnector(data)
    }
  }

  getConnector() {
    return this.store.get('connector')
  }

  setConnector(name: string, args?: KeyValue, options?: Edge.SetOptions): this
  setConnector(connector: Edge.ConnectorData, options?: Edge.SetOptions): this
  setConnector(
    name?: string | Edge.ConnectorData,
    args?: KeyValue | Edge.SetOptions,
    options?: Edge.SetOptions,
  ) {
    if (typeof name === 'object') {
      this.store.set('connector', name, args)
    } else {
      this.store.set('connector', { name, args }, options)
    }
    return this
  }

  removeConnector(options: Edge.SetOptions = {}) {
    return this.store.remove('connector', options)
  }

  // #endregion

  // #region labels

  getDefaultLabel(): Edge.Label {
    const ctor = this.constructor as Edge.Definition
    const defaults = this.store.get('defaultLabel') || ctor.defaultLabel || {}
    return ObjectExt.cloneDeep(defaults)
  }

  get labels() {
    return this.getLabels()
  }

  set labels(labels: Edge.Label[]) {
    this.setLabels(labels)
  }

  getLabels(): Edge.Label[] {
    return [...this.store.get('labels', [])].map((item) =>
      this.parseLabel(item),
    )
  }

  setLabels(
    labels: Edge.Label | Edge.Label[] | string | string[],
    options: Edge.SetOptions = {},
  ) {
    this.store.set('labels', Array.isArray(labels) ? labels : [labels], options)
    return this
  }

  insertLabel(
    label: Edge.Label | string,
    index?: number,
    options: Edge.SetOptions = {},
  ) {
    const labels = this.getLabels()
    const len = labels.length
    let idx = index != null && Number.isFinite(index) ? index : len
    if (idx < 0) {
      idx = len + idx + 1
    }

    labels.splice(idx, 0, this.parseLabel(label))
    return this.setLabels(labels, options)
  }

  appendLabel(label: Edge.Label | string, options: Edge.SetOptions = {}) {
    return this.insertLabel(label, -1, options)
  }

  getLabelAt(index: number) {
    const labels = this.getLabels()
    if (index != null && Number.isFinite(index)) {
      return this.parseLabel(labels[index])
    }
    return null
  }

  setLabelAt(
    index: number,
    label: Edge.Label | string,
    options: Edge.SetOptions = {},
  ) {
    if (index != null && Number.isFinite(index)) {
      const labels = this.getLabels()
      labels[index] = this.parseLabel(label)
      this.setLabels(labels, options)
    }
    return this
  }

  removeLabelAt(index: number, options: Edge.SetOptions = {}) {
    const labels = this.getLabels()
    const idx = index != null && Number.isFinite(index) ? index : -1

    const removed = labels.splice(idx, 1)
    this.setLabels(labels, options)
    return removed.length ? removed[0] : null
  }

  protected parseLabel(label: string | Edge.Label) {
    if (typeof label === 'string') {
      const ctor = this.constructor as Edge.Definition
      return ctor.parseStringLabel(label)
    }
    return label
  }

  protected onLabelsChanged({
    previous,
    current,
  }: Cell.ChangeArgs<Edge.Label[]>) {
    const added =
      previous && current
        ? current.filter((label1) => {
            if (
              !previous.find(
                (label2) =>
                  label1 === label2 || ObjectExt.isEqual(label1, label2),
              )
            ) {
              return label1
            }
            return null
          })
        : current
        ? [...current]
        : []

    const removed =
      previous && current
        ? previous.filter((label1) => {
            if (
              !current.find(
                (label2) =>
                  label1 === label2 || ObjectExt.isEqual(label1, label2),
              )
            ) {
              return label1
            }
            return null
          })
        : previous
        ? [...previous]
        : []

    if (added.length > 0) {
      this.notify('labels:added', { added, cell: this, edge: this })
    }

    if (removed.length > 0) {
      this.notify('labels:removed', { removed, cell: this, edge: this })
    }
  }

  // #endregion

  // #region vertices
  get vertices() {
    return this.getVertices()
  }

  set vertices(vertices: Point.PointLike | Point.PointLike[]) {
    this.setVertices(vertices)
  }

  getVertices() {
    return [...this.store.get('vertices', [])]
  }

  setVertices(
    vertices: Point.PointLike | Point.PointLike[],
    options: Edge.SetOptions = {},
  ) {
    const points = Array.isArray(vertices) ? vertices : [vertices]
    this.store.set(
      'vertices',
      points.map((p) => Point.toJSON(p)),
      options,
    )
    return this
  }

  insertVertex(
    vertice: Point.PointLike,
    index?: number,
    options: Edge.SetOptions = {},
  ) {
    const vertices = this.getVertices()
    const len = vertices.length
    let idx = index != null && Number.isFinite(index) ? index : len
    if (idx < 0) {
      idx = len + idx + 1
    }

    vertices.splice(idx, 0, Point.toJSON(vertice))
    return this.setVertices(vertices, options)
  }

  appendVertex(vertex: Point.PointLike, options: Edge.SetOptions = {}) {
    return this.insertVertex(vertex, -1, options)
  }

  getVertexAt(index: number) {
    if (index != null && Number.isFinite(index)) {
      const vertices = this.getVertices()
      return vertices[index]
    }
    return null
  }

  setVertexAt(
    index: number,
    vertice: Point.PointLike,
    options: Edge.SetOptions = {},
  ) {
    if (index != null && Number.isFinite(index)) {
      const vertices = this.getVertices()
      vertices[index] = vertice
      this.setVertices(vertices, options)
    }
    return this
  }

  removeVertexAt(index: number, options: Edge.SetOptions = {}) {
    const vertices = this.getVertices()
    const idx = index != null && Number.isFinite(index) ? index : -1
    vertices.splice(idx, 1)
    return this.setVertices(vertices, options)
  }

  protected onVertexsChanged({
    previous,
    current,
  }: Cell.ChangeArgs<Point.PointLike[]>) {
    const added =
      previous && current
        ? current.filter((p1) => {
            if (!previous.find((p2) => Point.equals(p1, p2))) {
              return p1
            }
            return null
          })
        : current
        ? [...current]
        : []

    const removed =
      previous && current
        ? previous.filter((p1) => {
            if (!current.find((p2) => Point.equals(p1, p2))) {
              return p1
            }
            return null
          })
        : previous
        ? [...previous]
        : []

    if (added.length > 0) {
      this.notify('vertexs:added', { added, cell: this, edge: this })
    }

    if (removed.length > 0) {
      this.notify('vertexs:removed', { removed, cell: this, edge: this })
    }
  }

  // #endregion

  // #region markup

  getDefaultMarkup() {
    return this.store.get('defaultMarkup') || Markup.getEdgeMarkup()
  }

  getMarkup() {
    return super.getMarkup() || this.getDefaultMarkup()
  }

  // #endregion

  // #region transform

  /**
   * Translate the edge vertices (and source and target if they are points)
   * by `tx` pixels in the x-axis and `ty` pixels in the y-axis.
   */
  translate(tx: number, ty: number, options: Cell.TranslateOptions = {}) {
    options.translateBy = options.translateBy || this.id
    options.tx = tx
    options.ty = ty

    return this.applyToPoints(
      (p) => ({
        x: (p.x || 0) + tx,
        y: (p.y || 0) + ty,
      }),
      options,
    )
  }

  /**
   * Scales the edge's points (vertices) relative to the given origin.
   */
  scale(
    sx: number,
    sy: number,
    origin?: Point | Point.PointLike,
    options: Edge.SetOptions = {},
  ) {
    return this.applyToPoints((p) => {
      return Point.create(p).scale(sx, sy, origin).toJSON()
    }, options)
  }

  protected applyToPoints(
    worker: (p: Point.PointLike) => Point.PointLike,
    options: Edge.SetOptions = {},
  ) {
    const attrs: {
      source?: Edge.TerminalPointData
      target?: Edge.TerminalPointData
      vertices?: Point.PointLike[]
    } = {}

    const source = this.getSource()
    const target = this.getTarget()
    if (Point.isPointLike(source)) {
      attrs.source = worker(source)
    }

    if (Point.isPointLike(target)) {
      attrs.target = worker(target)
    }

    const vertices = this.getVertices()
    if (vertices.length > 0) {
      attrs.vertices = vertices.map(worker)
    }

    this.store.set(attrs, options)
    return this
  }

  // #endregion

  // #region common

  getBBox() {
    return this.getPolyline().bbox()
  }

  getConnectionPoint() {
    return this.getPolyline().pointAt(0.5)!
  }

  getPolyline() {
    const points = [
      this.getSourcePoint(),
      ...this.getVertices().map((vertice) => Point.create(vertice)),
      this.getTargetPoint(),
    ]
    return new Polyline(points)
  }

  updateParent(options?: Edge.SetOptions) {
    let newParent: Cell | null = null

    const source = this.getSourceCell()
    const target = this.getTargetCell()
    const prevParent = this.getParent()

    if (source && target) {
      if (source === target || source.isDescendantOf(target)) {
        newParent = target
      } else if (target.isDescendantOf(source)) {
        newParent = source
      } else {
        newParent = Cell.getCommonAncestor(source, target)
      }
    }

    // Unembeds the edge if source and target has no common
    // ancestor or common ancestor changed
    if (prevParent && newParent && newParent.id !== prevParent.id) {
      prevParent.unembed(this, options)
    }

    // Embeds the edge if source and target are not same
    if (newParent && (!prevParent || prevParent.id !== newParent.id)) {
      newParent.embed(this, options)
    }

    return newParent
  }

  hasLoop(options: { deep?: boolean } = {}) {
    const source = this.getSource() as Edge.TerminalCellData
    const target = this.getTarget() as Edge.TerminalCellData
    const sourceId = source.cell
    const targetId = target.cell

    if (!sourceId || !targetId) {
      return false
    }

    let loop = sourceId === targetId

    // Note that there in the deep mode a edge can have a loop,
    // even if it connects only a parent and its embed.
    // A loop "target equals source" is valid in both shallow and deep mode.
    // eslint-disable-next-line
    if (!loop && options.deep && this._model) {
      const sourceCell = this.getSourceCell()
      const targetCell = this.getTargetCell()

      if (sourceCell && targetCell) {
        loop =
          sourceCell.isAncestorOf(targetCell, options) ||
          targetCell.isAncestorOf(sourceCell, options)
      }
    }

    return loop
  }

  getFragmentAncestor(): Cell | null {
    const cells = [this, this.getSourceNode(), this.getTargetNode()].filter(
      (item) => item != null,
    )
    return this.getCommonAncestor(...cells)
  }

  isFragmentDescendantOf(cell: Cell) {
    const ancestor = this.getFragmentAncestor()
    return (
      !!ancestor && (ancestor.id === cell.id || ancestor.isDescendantOf(cell))
    )
  }

  // #endregion
}

export namespace Edge {
  export type RouterData = Router.NativeItem | Router.ManaualItem
  export type ConnectorData = Connector.NativeItem | Connector.ManaualItem
}

export namespace Edge {
  interface Common extends Cell.Common {
    source?: TerminalData
    target?: TerminalData
    router?: RouterData
    connector?: ConnectorData
    labels?: Label[] | string[]
    defaultLabel?: Label
    vertices?: (Point.PointLike | Point.PointData)[]
    defaultMarkup?: Markup
  }

  interface TerminalOptions {
    sourceCell?: Cell | string
    sourcePort?: string
    sourcePoint?: Point.PointLike | Point.PointData
    targetCell?: Cell | string
    targetPort?: string
    targetPoint?: Point.PointLike | Point.PointData
    source?:
      | string
      | Cell
      | Point.PointLike
      | Point.PointData
      | TerminalPointData
      | TerminalCellLooseData
    target?:
      | string
      | Cell
      | Point.PointLike
      | Point.PointData
      | TerminalPointData
      | TerminalCellLooseData
  }

  export interface BaseOptions extends Common, Cell.Metadata {}

  export interface Metadata
    extends Omit<BaseOptions, TerminalType>,
      TerminalOptions {}

  export interface Defaults extends Common, Cell.Defaults {}

  export interface Properties
    extends Cell.Properties,
      Omit<BaseOptions, 'tools'> {}

  export interface Config
    extends Omit<Defaults, TerminalType>,
      TerminalOptions,
      Cell.Config<Metadata, Edge> {}
}

export namespace Edge {
  export interface SetOptions extends Cell.SetOptions {}

  export type TerminalType = 'source' | 'target'

  export interface SetTerminalCommonArgs {
    selector?: string
    magnet?: string
    connectionPoint?:
      | string
      | ConnectionPoint.NativeItem
      | ConnectionPoint.ManaualItem
  }

  export type NodeAnchorItem =
    | string
    | NodeAnchor.NativeItem
    | NodeAnchor.ManaualItem

  export type EdgeAnchorItem =
    | string
    | EdgeAnchor.NativeItem
    | EdgeAnchor.ManaualItem

  export interface SetCellTerminalArgs extends SetTerminalCommonArgs {
    port?: string
    priority?: boolean
    anchor?: NodeAnchorItem
  }

  export interface SetEdgeTerminalArgs extends SetTerminalCommonArgs {
    anchor?: EdgeAnchorItem
  }

  export interface TerminalPointData
    extends SetTerminalCommonArgs,
      Point.PointLike {}

  export interface TerminalCellData extends SetCellTerminalArgs {
    cell: string
    port?: string
  }

  export interface TerminalCellLooseData extends SetCellTerminalArgs {
    cell: string | Cell
    port?: string
  }

  export type TerminalData = TerminalPointData | TerminalCellLooseData

  export function equalTerminals(a: TerminalData, b: TerminalData) {
    const a1 = a as TerminalCellData
    const b1 = b as TerminalCellData
    if (a1.cell === b1.cell) {
      return a1.port === b1.port || (a1.port == null && b1.port == null)
    }
    return false
  }
}

export namespace Edge {
  export interface Label extends KeyValue {
    markup?: Markup
    attrs?: Attr.CellAttrs
    /**
     * If the distance is in the `[0,1]` range (inclusive), then the position
     * of the label is defined as a percentage of the total length of the edge
     * (the normalized length). For example, passing the number `0.5` positions
     * the label to the middle of the edge.
     *
     * If the distance is larger than `1` (exclusive), the label will be
     * positioned distance pixels away from the beginning of the path along
     * the edge.
     *
     * If the distance is a negative number, the label will be positioned
     * distance pixels away from the end of the path along the edge.
     */
    position?: LabelPosition
    size?: Size
  }

  export interface LabelPositionOptions {
    /**
     * Forces absolute coordinates for distance.
     */
    absoluteDistance?: boolean
    /**
     * Forces reverse absolute coordinates (if absoluteDistance = true)
     */
    reverseDistance?: boolean
    /**
     * Forces absolute coordinates for offset.
     */
    absoluteOffset?: boolean
    /**
     * Auto-adjusts the angle of the label to match path gradient at position.
     */
    keepGradient?: boolean
    /**
     * Whether rotates labels so they are never upside-down.
     */
    ensureLegibility?: boolean
  }

  export interface LabelPositionObject {
    distance: number
    offset?:
      | number
      | {
          x?: number
          y?: number
        }
    angle?: number
    options?: LabelPositionOptions
  }

  export type LabelPosition = number | LabelPositionObject

  export const defaultLabel: Label = {
    markup: [
      {
        tagName: 'rect',
        selector: 'body',
      },
      {
        tagName: 'text',
        selector: 'label',
      },
    ],
    attrs: {
      text: {
        fill: '#000',
        fontSize: 14,
        textAnchor: 'middle',
        textVerticalAnchor: 'middle',
        pointerEvents: 'none',
      },
      rect: {
        ref: 'label',
        fill: '#fff',
        rx: 3,
        ry: 3,
        refWidth: 1,
        refHeight: 1,
        refX: 0,
        refY: 0,
      },
    },
    position: {
      distance: 0.5,
    },
  }

  export function parseStringLabel(text: string): Label {
    return {
      attrs: { label: { text } },
    }
  }
}

export namespace Edge {
  export const toStringTag = `X6.${Edge.name}`

  export function isEdge(instance: any): instance is Edge {
    if (instance == null) {
      return false
    }

    if (instance instanceof Edge) {
      return true
    }

    const tag = instance[Symbol.toStringTag]
    const edge = instance as Edge

    if (
      (tag == null || tag === toStringTag) &&
      typeof edge.isNode === 'function' &&
      typeof edge.isEdge === 'function' &&
      typeof edge.prop === 'function' &&
      typeof edge.attr === 'function' &&
      typeof edge.disconnect === 'function' &&
      typeof edge.getSource === 'function' &&
      typeof edge.getTarget === 'function'
    ) {
      return true
    }

    return false
  }
}

export namespace Edge {
  export const registry = Registry.create<
    Definition,
    never,
    Config & { inherit?: string | Definition }
  >({
    type: 'edge',
    process(shape, options) {
      if (ShareRegistry.exist(shape, false)) {
        throw new Error(
          `Edge with name '${shape}' was registered by anthor Node`,
        )
      }

      if (typeof options === 'function') {
        options.config({ shape })
        return options
      }

      let parent = Edge

      // default inherit from 'dege'
      const { inherit = 'edge', ...others } = options
      if (typeof inherit === 'string') {
        const base = this.get(inherit || 'edge')
        if (base == null && inherit) {
          this.onNotFound(inherit, 'inherited')
        } else {
          parent = base
        }
      } else {
        parent = inherit
      }

      if (others.constructorName == null) {
        others.constructorName = shape
      }

      const ctor: Definition = parent.define.call(parent, others)
      ctor.config({ shape })
      return ctor as any
    },
  })

  ShareRegistry.setEdgeRegistry(registry)
}

export namespace Edge {
  type EdgeClass = typeof Edge

  export interface Definition extends EdgeClass {
    new <T extends Properties = Properties>(metadata: T): Edge
  }

  let counter = 0
  function getClassName(name?: string) {
    if (name) {
      return StringExt.pascalCase(name)
    }
    counter += 1
    return `CustomEdge${counter}`
  }

  export function define(config: Config) {
    const { constructorName, overwrite, ...others } = config
    const ctor = ObjectExt.createClass<Definition>(
      getClassName(constructorName || others.shape),
      this as Definition,
    )

    ctor.config(others)

    if (others.shape) {
      registry.register(others.shape, ctor, overwrite)
    }

    return ctor
  }

  export function create(options: Metadata) {
    const shape = options.shape || 'edge'
    // 从registry 注册中心获取对应边的构造函数
    const Ctor = registry.get(shape)
    if (Ctor) {
      return new Ctor(options)
    }
    return registry.onNotFound(shape)
  }
}

export namespace Edge {
  const shape = 'basic.edge'
  Edge.config({
    shape,
    propHooks(metadata: Properties) {
      const { label, vertices, ...others } = metadata
      if (label) {
        if (others.labels == null) {
          others.labels = []
        }
        const formated =
          typeof label === 'string' ? parseStringLabel(label) : label
        others.labels.push(formated)
      }

      if (vertices) {
        if (Array.isArray(vertices)) {
          others.vertices = vertices.map((item) => Point.create(item).toJSON())
        }
      }

      return others
    },
  })
  registry.register(shape, Edge)
}

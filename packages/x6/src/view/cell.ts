/* eslint-disable @typescript-eslint/no-unused-vars */
import { Rectangle } from '@antv/x6-geometry'
import {
  ArrayExt,
  ObjectExt,
  Dom,
  FunctionExt,
  Nilable,
  KeyValue,
} from '@antv/x6-common'
import { Registry } from '../registry/registry'
import { View } from './view'
import { Cache } from './cache'
import { Markup } from './markup'
import { ToolsView } from './tool'
import { AttrManager } from './attr'
import { FlagManager } from './flag'
import { Util } from '../util'
import { Attr } from '../registry/attr'
import { Cell } from '../model/cell'
import { Edge } from '../model/edge'
import { Model } from '../model/model'
import { EdgeView } from './edge'
import { NodeView } from './node'
import { Graph } from '../graph'

export class CellView<
  Entity extends Cell = Cell,
  Options extends CellView.Options = CellView.Options,
> extends View<CellView.EventArgs> {
  protected static defaults: Partial<CellView.Options> = {
    isSvgElement: true,
    rootSelector: 'root',
    priority: 0,
    bootstrap: [],
    actions: {},
  }

  public static getDefaults() {
    return this.defaults
  }

  public static config<T extends CellView.Options = CellView.Options>(
    options: Partial<T>,
  ) {
    this.defaults = this.getOptions(options)
  }

  public static getOptions<T extends CellView.Options = CellView.Options>(
    options: Partial<T>,
  ): T {
    const mergeActions = <T>(arr1: T | T[], arr2?: T | T[]) => {
      if (arr2 != null) {
        return ArrayExt.uniq([
          ...(Array.isArray(arr1) ? arr1 : [arr1]),
          ...(Array.isArray(arr2) ? arr2 : [arr2]),
        ])
      }
      return Array.isArray(arr1) ? [...arr1] : [arr1]
    }

    const ret = ObjectExt.cloneDeep(this.getDefaults()) as T
    const { bootstrap, actions, events, documentEvents, ...others } = options

    if (bootstrap) {
      ret.bootstrap = mergeActions(ret.bootstrap, bootstrap)
    }

    if (actions) {
      Object.entries(actions).forEach(([key, val]) => {
        const raw = ret.actions[key]
        if (val && raw) {
          ret.actions[key] = mergeActions(raw, val)
        } else if (val) {
          ret.actions[key] = mergeActions(val)
        }
      })
    }

    if (events) {
      ret.events = { ...ret.events, ...events }
    }

    if (options.documentEvents) {
      ret.documentEvents = { ...ret.documentEvents, ...documentEvents }
    }

    return ObjectExt.merge(ret, others) as T
  }

  public graph: Graph
  public cell: Entity
  protected selectors: Markup.Selectors
  protected readonly options: Options
  protected readonly flag: FlagManager
  protected readonly attr: AttrManager
  protected readonly cache: Cache

  protected get [Symbol.toStringTag]() {
    return CellView.toStringTag
  }

  constructor(cell: Entity, options: Partial<Options> = {}) {
    super()
    // CellView中包含 Model中的Node、Edge
    this.cell = cell
    this.options = this.ensureOptions(options)
    this.graph = this.options.graph
    this.attr = new AttrManager(this)
    this.flag = new FlagManager(
      this,
      this.options.actions,
      this.options.bootstrap,
    )
    this.cache = new Cache(this)

    this.setContainer(this.ensureContainer())
    this.setup()

    this.init()
  }

  protected init() {}

  protected onRemove() {
    this.removeTools()
  }

  public get priority() {
    return this.options.priority
  }

  protected get rootSelector() {
    return this.options.rootSelector
  }

  protected getConstructor<T extends CellView.Definition>() {
    return this.constructor as any as T
  }

  protected ensureOptions(options: Partial<Options>) {
    return this.getConstructor().getOptions(options) as Options
  }

  protected getContainerTagName(): string {
    return this.options.isSvgElement ? 'g' : 'div'
  }

  protected getContainerStyle(): Nilable<
    Record<string, string | number>
  > | void {}

  protected getContainerAttrs(): Nilable<Attr.SimpleAttrs> {
    return {
      'data-cell-id': this.cell.id,
      'data-shape': this.cell.shape,
    }
  }

  protected getContainerClassName(): Nilable<string | string[]> {
    return this.prefixClassName('cell')
  }

  protected ensureContainer() {
    return View.createElement(
      this.getContainerTagName(),
      this.options.isSvgElement,
    )
  }

  protected setContainer(container: Element) {
    if (this.container !== container) {
      this.undelegateEvents()
      this.container = container

      if (this.options.events != null) {
        this.delegateEvents(this.options.events)
      }

      const attrs = this.getContainerAttrs()
      if (attrs != null) {
        this.setAttrs(attrs, container)
      }

      const style = this.getContainerStyle()
      if (style != null) {
        this.setStyle(style, container)
      }

      const className = this.getContainerClassName()
      if (className != null) {
        this.addClass(className, container)
      }
    }

    return this
  }

  isNodeView(): this is NodeView {
    return false
  }

  isEdgeView(): this is EdgeView {
    return false
  }

  render() {
    return this
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  confirmUpdate(flag: number, options: any = {}) {
    return 0
  }

  getBootstrapFlag() {
    return this.flag.getBootstrapFlag()
  }

  getFlag(actions: FlagManager.Actions) {
    return this.flag.getFlag(actions)
  }

  hasAction(flag: number, actions: FlagManager.Actions) {
    return this.flag.hasAction(flag, actions)
  }

  removeAction(flag: number, actions: FlagManager.Actions) {
    return this.flag.removeAction(flag, actions)
  }

  handleAction(
    flag: number,
    action: FlagManager.Action,
    handle: () => void,
    additionalRemovedActions?: FlagManager.Actions | null,
  ) {
    if (this.hasAction(flag, action)) {
      handle()
      const removedFlags = [action]
      if (additionalRemovedActions) {
        if (typeof additionalRemovedActions === 'string') {
          removedFlags.push(additionalRemovedActions)
        } else {
          removedFlags.push(...additionalRemovedActions)
        }
      }
      return this.removeAction(flag, removedFlags)
    }
    return flag
  }

  protected setup() {
    this.cell.on('changed', this.onCellChanged, this)
  }

  protected onCellChanged({ options }: Cell.EventArgs['changed']) {
    this.onAttrsChange(options)
  }

  protected onAttrsChange(options: Cell.MutateOptions) {
    let flag = this.flag.getChangedFlag()
    if (options.updated || !flag) {
      return
    }

    if (options.dirty && this.hasAction(flag, 'update')) {
      flag |= this.getFlag('render') // eslint-disable-line no-bitwise
    }

    // tool changes should be sync render
    if (options.toolId) {
      options.async = false
    }

    if (this.graph != null) {
      this.graph.renderer.requestViewUpdate(this, flag, options)
    }
  }

  parseJSONMarkup(
    markup: Markup.JSONMarkup | Markup.JSONMarkup[],
    rootElem?: Element,
  ) {
    const result = Markup.parseJSONMarkup(markup)
    const selectors = result.selectors
    const rootSelector = this.rootSelector
    if (rootElem && rootSelector) {
      if (selectors[rootSelector]) {
        throw new Error('Invalid root selector')
      }
      selectors[rootSelector] = rootElem
    }
    return result
  }

  can(feature: CellView.InteractionNames): boolean {
    let interacting = this.graph.options.interacting

    if (typeof interacting === 'function') {
      interacting = FunctionExt.call(interacting, this.graph, this)
    }

    if (typeof interacting === 'object') {
      let val = interacting[feature]
      if (typeof val === 'function') {
        val = FunctionExt.call(val, this.graph, this)
      }
      return val !== false
    }

    if (typeof interacting === 'boolean') {
      return interacting
    }

    return false
  }

  cleanCache() {
    this.cache.clean()
    return this
  }

  getCache(elem: Element) {
    return this.cache.get(elem)
  }

  getDataOfElement(elem: Element) {
    return this.cache.getData(elem)
  }

  getMatrixOfElement(elem: Element) {
    return this.cache.getMatrix(elem)
  }

  getShapeOfElement(elem: SVGElement) {
    return this.cache.getShape(elem)
  }

  getBoundingRectOfElement(elem: Element) {
    return this.cache.getBoundingRect(elem)
  }

  getBBoxOfElement(elem: Element) {
    const rect = this.getBoundingRectOfElement(elem)
    const matrix = this.getMatrixOfElement(elem)
    const rm = this.getRootRotatedMatrix()
    const tm = this.getRootTranslatedMatrix()
    return Util.transformRectangle(rect, tm.multiply(rm).multiply(matrix))
  }

  getUnrotatedBBoxOfElement(elem: SVGElement) {
    const rect = this.getBoundingRectOfElement(elem)
    const matrix = this.getMatrixOfElement(elem)
    const tm = this.getRootTranslatedMatrix()
    return Util.transformRectangle(rect, tm.multiply(matrix))
  }

  getBBox(options: { useCellGeometry?: boolean } = {}) {
    let bbox
    if (options.useCellGeometry) {
      const cell = this.cell
      const angle = cell.isNode() ? cell.getAngle() : 0
      bbox = cell.getBBox().bbox(angle)
    } else {
      bbox = this.getBBoxOfElement(this.container)
    }

    return this.graph.coord.localToGraphRect(bbox)
  }

  getRootTranslatedMatrix() {
    const cell = this.cell
    const pos = cell.isNode() ? cell.getPosition() : { x: 0, y: 0 }
    return Dom.createSVGMatrix().translate(pos.x, pos.y)
  }

  getRootRotatedMatrix() {
    let matrix = Dom.createSVGMatrix()
    const cell = this.cell
    const angle = cell.isNode() ? cell.getAngle() : 0
    if (angle) {
      const bbox = cell.getBBox()
      const cx = bbox.width / 2
      const cy = bbox.height / 2
      matrix = matrix.translate(cx, cy).rotate(angle).translate(-cx, -cy)
    }
    return matrix
  }

  findMagnet(elem: Element = this.container) {
    return this.findByAttr('magnet', elem)
  }

  updateAttrs(
    rootNode: Element,
    attrs: Attr.CellAttrs,
    options: Partial<AttrManager.UpdateOptions> = {},
  ) {
    if (options.rootBBox == null) {
      options.rootBBox = new Rectangle()
    }

    if (options.selectors == null) {
      options.selectors = this.selectors
    }

    this.attr.update(rootNode, attrs, options as AttrManager.UpdateOptions)
  }

  isEdgeElement(magnet?: Element | null) {
    return this.cell.isEdge() && (magnet == null || magnet === this.container)
  }

  // #region highlight

  protected prepareHighlight(
    elem?: Element | null,
    options: CellView.HighlightOptions = {},
  ) {
    const magnet = elem || this.container
    options.partial = magnet === this.container
    return magnet
  }

  highlight(elem?: Element | null, options: CellView.HighlightOptions = {}) {
    const magnet = this.prepareHighlight(elem, options)
    this.notify('cell:highlight', {
      magnet,
      options,
      view: this,
      cell: this.cell,
    })
    if (this.isEdgeView()) {
      this.notify('edge:highlight', {
        magnet,
        options,
        view: this,
        edge: this.cell,
        cell: this.cell,
      })
    } else if (this.isNodeView()) {
      this.notify('node:highlight', {
        magnet,
        options,
        view: this,
        node: this.cell,
        cell: this.cell,
      })
    }
    return this
  }

  unhighlight(elem?: Element | null, options: CellView.HighlightOptions = {}) {
    const magnet = this.prepareHighlight(elem, options)
    this.notify('cell:unhighlight', {
      magnet,
      options,
      view: this,
      cell: this.cell,
    })
    if (this.isNodeView()) {
      this.notify('node:unhighlight', {
        magnet,
        options,
        view: this,
        node: this.cell,
        cell: this.cell,
      })
    } else if (this.isEdgeView()) {
      this.notify('edge:unhighlight', {
        magnet,
        options,
        view: this,
        edge: this.cell,
        cell: this.cell,
      })
    }
    return this
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  notifyUnhighlight(magnet: Element, options: CellView.HighlightOptions) {}

  // #endregion

  getEdgeTerminal(
    magnet: Element,
    x: number,
    y: number,
    edge: Edge,
    type: Edge.TerminalType,
  ) {
    const cell = this.cell
    const portId = this.findAttr('port', magnet)
    const selector = magnet.getAttribute('data-selector')
    const terminal: Edge.TerminalCellData = { cell: cell.id }

    if (selector != null) {
      terminal.magnet = selector
    }

    if (portId != null) {
      terminal.port = portId
      if (cell.isNode()) {
        if (!cell.hasPort(portId) && selector == null) {
          // port created via the `port` attribute (not API)
          terminal.selector = this.getSelector(magnet)
        }
      }
    } else if (selector == null && this.container !== magnet) {
      terminal.selector = this.getSelector(magnet)
    }

    return terminal
  }

  getMagnetFromEdgeTerminal(terminal: Edge.TerminalData) {
    const cell = this.cell
    const root = this.container
    const portId = (terminal as Edge.TerminalCellData).port
    let selector = terminal.magnet
    let magnet
    if (portId != null && cell.isNode() && cell.hasPort(portId)) {
      magnet = (this as any).findPortElem(portId, selector) || root
    } else {
      if (!selector) {
        selector = terminal.selector
      }
      if (!selector && portId != null) {
        selector = `[port="${portId}"]`
      }
      magnet = this.findOne(selector, root, this.selectors)
    }

    return magnet
  }

  // #region tools

  protected tools: ToolsView | null

  hasTools(name?: string) {
    const tools = this.tools
    if (tools == null) {
      return false
    }

    if (name == null) {
      return true
    }

    return tools.name === name
  }

  addTools(options: ToolsView.Options | null): this
  addTools(tools: ToolsView | null): this
  addTools(config: ToolsView | ToolsView.Options | null) {
    this.removeTools()
    if (config) {
      if (!this.can('toolsAddable')) {
        return this
      }
      const tools = ToolsView.isToolsView(config)
        ? config
        : new ToolsView(config)
      this.tools = tools
      tools.config({ view: this })
      tools.mount()
    }
    return this
  }

  updateTools(options: ToolsView.UpdateOptions = {}) {
    if (this.tools) {
      this.tools.update(options)
    }
    return this
  }

  removeTools() {
    if (this.tools) {
      this.tools.remove()
      this.tools = null
    }
    return this
  }

  hideTools() {
    if (this.tools) {
      this.tools.hide()
    }
    return this
  }

  showTools() {
    if (this.tools) {
      this.tools.show()
    }
    return this
  }

  protected renderTools() {
    const tools = this.cell.getTools()
    this.addTools(tools as ToolsView.Options)
    return this
  }

  // #endregion

  // #region events

  notify<Key extends keyof CellView.EventArgs>(
    name: Key,
    args: CellView.EventArgs[Key],
  ): this
  notify(name: Exclude<string, keyof CellView.EventArgs>, args: any): this
  notify<Key extends keyof CellView.EventArgs>(
    name: Key,
    args: CellView.EventArgs[Key],
  ) {
    this.trigger(name, args)
    this.graph.trigger(name, args)
    return this
  }

  protected getEventArgs<E>(e: E): CellView.MouseEventArgs<E>
  protected getEventArgs<E>(
    e: E,
    x: number,
    y: number,
  ): CellView.MousePositionEventArgs<E>
  protected getEventArgs<E>(e: E, x?: number, y?: number) {
    const view = this // eslint-disable-line @typescript-eslint/no-this-alias
    const cell = view.cell
    if (x == null || y == null) {
      return { e, view, cell } as CellView.MouseEventArgs<E>
    }
    return { e, x, y, view, cell } as CellView.MousePositionEventArgs<E>
  }

  onClick(e: Dom.ClickEvent, x: number, y: number) {
    this.notify('cell:click', this.getEventArgs(e, x, y))
  }

  onDblClick(e: Dom.DoubleClickEvent, x: number, y: number) {
    this.notify('cell:dblclick', this.getEventArgs(e, x, y))
  }

  onContextMenu(e: Dom.ContextMenuEvent, x: number, y: number) {
    this.notify('cell:contextmenu', this.getEventArgs(e, x, y))
  }

  protected cachedModelForMouseEvent: Model | null

  onMouseDown(e: Dom.MouseDownEvent, x: number, y: number) {
    if (this.cell.model) {
      this.cachedModelForMouseEvent = this.cell.model
      this.cachedModelForMouseEvent.startBatch('mouse')
    }

    this.notify('cell:mousedown', this.getEventArgs(e, x, y))
  }

  onMouseUp(e: Dom.MouseUpEvent, x: number, y: number) {
    this.notify('cell:mouseup', this.getEventArgs(e, x, y))

    if (this.cachedModelForMouseEvent) {
      this.cachedModelForMouseEvent.stopBatch('mouse', { cell: this.cell })
      this.cachedModelForMouseEvent = null
    }
  }

  onMouseMove(e: Dom.MouseMoveEvent, x: number, y: number) {
    this.notify('cell:mousemove', this.getEventArgs(e, x, y))
  }

  onMouseOver(e: Dom.MouseOverEvent) {
    this.notify('cell:mouseover', this.getEventArgs(e))
  }

  onMouseOut(e: Dom.MouseOutEvent) {
    this.notify('cell:mouseout', this.getEventArgs(e))
  }

  onMouseEnter(e: Dom.MouseEnterEvent) {
    this.notify('cell:mouseenter', this.getEventArgs(e))
  }

  onMouseLeave(e: Dom.MouseLeaveEvent) {
    this.notify('cell:mouseleave', this.getEventArgs(e))
  }

  onMouseWheel(e: Dom.EventObject, x: number, y: number, delta: number) {
    this.notify('cell:mousewheel', {
      delta,
      ...this.getEventArgs(e, x, y),
    })
  }

  onCustomEvent(e: Dom.MouseDownEvent, name: string, x: number, y: number) {
    this.notify('cell:customevent', { name, ...this.getEventArgs(e, x, y) })
    this.notify(name, { ...this.getEventArgs(e, x, y) })
  }

  onMagnetMouseDown(
    e: Dom.MouseDownEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {}

  onMagnetDblClick(
    e: Dom.DoubleClickEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {}

  onMagnetContextMenu(
    e: Dom.ContextMenuEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {}

  onLabelMouseDown(e: Dom.MouseDownEvent, x: number, y: number) {}

  checkMouseleave(e: Dom.EventObject) {
    const target = this.getEventTarget(e, { fromPoint: true })
    const view = this.graph.findViewByElem(target)
    if (view === this) {
      return
    }

    // Leaving the current view
    this.onMouseLeave(e as Dom.MouseLeaveEvent)
    if (!view) {
      return
    }

    // Entering another view
    view.onMouseEnter(e as Dom.MouseEnterEvent)
  }

  @CellView.dispose()
  dispose() {
    this.cell.off('changed', this.onCellChanged, this)
  }

  // #endregion
}

export namespace CellView {
  export interface Options {
    graph: Graph
    priority: number
    isSvgElement: boolean
    rootSelector: string
    bootstrap: FlagManager.Actions
    actions: KeyValue<FlagManager.Actions>
    events?: View.Events | null
    documentEvents?: View.Events | null
  }

  type Interactable = boolean | ((this: Graph, cellView: CellView) => boolean)

  interface InteractionMap {
    // edge
    edgeMovable?: Interactable
    edgeLabelMovable?: Interactable
    arrowheadMovable?: Interactable
    vertexMovable?: Interactable
    vertexAddable?: Interactable
    vertexDeletable?: Interactable
    useEdgeTools?: Interactable

    // node
    nodeMovable?: Interactable
    magnetConnectable?: Interactable
    stopDelegateOnDragging?: Interactable

    // general
    toolsAddable?: Interactable
  }

  export type InteractionNames = keyof InteractionMap

  export type Interacting =
    | boolean
    | InteractionMap
    | ((this: Graph, cellView: CellView) => InteractionMap | boolean)

  export interface HighlightOptions {
    highlighter?:
      | string
      | {
          name: string
          args: KeyValue
        }

    type?: 'embedding' | 'nodeAvailable' | 'magnetAvailable' | 'magnetAdsorbed'

    partial?: boolean
  }
}

export namespace CellView {
  export interface PositionEventArgs {
    x: number
    y: number
  }

  export interface MouseDeltaEventArgs {
    delta: number
  }

  export interface MouseEventArgs<E> {
    e: E
    view: CellView
    cell: Cell
  }

  export interface MousePositionEventArgs<E>
    extends MouseEventArgs<E>,
      PositionEventArgs {}

  export interface EventArgs extends NodeView.EventArgs, EdgeView.EventArgs {
    'cell:click': MousePositionEventArgs<Dom.ClickEvent>
    'cell:dblclick': MousePositionEventArgs<Dom.DoubleClickEvent>
    'cell:contextmenu': MousePositionEventArgs<Dom.ContextMenuEvent>
    'cell:mousedown': MousePositionEventArgs<Dom.MouseDownEvent>
    'cell:mousemove': MousePositionEventArgs<Dom.MouseMoveEvent>
    'cell:mouseup': MousePositionEventArgs<Dom.MouseUpEvent>
    'cell:mouseover': MouseEventArgs<Dom.MouseOverEvent>
    'cell:mouseout': MouseEventArgs<Dom.MouseOutEvent>
    'cell:mouseenter': MouseEventArgs<Dom.MouseEnterEvent>
    'cell:mouseleave': MouseEventArgs<Dom.MouseLeaveEvent>
    'cell:mousewheel': MousePositionEventArgs<Dom.EventObject> &
      MouseDeltaEventArgs
    'cell:customevent': MousePositionEventArgs<Dom.MouseDownEvent> & {
      name: string
    }
    'cell:highlight': {
      magnet: Element
      view: CellView
      cell: Cell
      options: CellView.HighlightOptions
    }
    'cell:unhighlight': EventArgs['cell:highlight']
  }
}

export namespace CellView {
  export const Flag = FlagManager
  export const Attr = AttrManager
}

export namespace CellView {
  export const toStringTag = `X6.${CellView.name}`

  export function isCellView(instance: any): instance is CellView {
    if (instance == null) {
      return false
    }

    if (instance instanceof CellView) {
      return true
    }

    const tag = instance[Symbol.toStringTag]
    const view = instance as CellView

    if (
      (tag == null || tag === toStringTag) &&
      typeof view.isNodeView === 'function' &&
      typeof view.isEdgeView === 'function' &&
      typeof view.confirmUpdate === 'function'
    ) {
      return true
    }

    return false
  }
}

// decorators
// ----
export namespace CellView {
  export function priority(value: number) {
    return function (ctor: Definition) {
      ctor.config({ priority: value })
    }
  }

  export function bootstrap(actions: FlagManager.Actions) {
    return function (ctor: Definition) {
      ctor.config({ bootstrap: actions })
    }
  }
}

export namespace CellView {
  type CellViewClass = typeof CellView

  export interface Definition extends CellViewClass {
    new <
      Entity extends Cell = Cell,
      Options extends CellView.Options = CellView.Options,
    >(
      cell: Entity,
      options: Partial<Options>,
    ): CellView
  }

  export const registry = Registry.create<Definition>({
    type: 'view',
  })
}

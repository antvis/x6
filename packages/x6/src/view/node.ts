import { ArrayExt, FunctionExt, Dom } from '@antv/x6-common'
import { Rectangle, Point, GeometryUtil } from '@antv/x6-geometry'
import { Config } from '../config'
import { Attr, PortLayout } from '../registry'
import { Cell } from '../model/cell'
import { Node } from '../model/node'
import { Edge } from '../model/edge'
import { PortManager } from '../model/port'
import { CellView } from './cell'
import { EdgeView } from './edge'
import { Markup } from './markup'
import { AttrManager } from './attr'
import { Graph } from '../graph'

export class NodeView<
  Entity extends Node = Node,
  Options extends NodeView.Options = NodeView.Options,
> extends CellView<Entity, Options> {
  protected portsCache: { [id: string]: NodeView.PortCache } = {}

  protected get [Symbol.toStringTag]() {
    return NodeView.toStringTag
  }

  protected getContainerClassName() {
    const classList = [
      super.getContainerClassName(),
      this.prefixClassName('node'),
    ]
    if (!this.can('nodeMovable')) {
      classList.push(this.prefixClassName('node-immovable'))
    }
    return classList.join(' ')
  }

  protected updateClassName(e: Dom.MouseEnterEvent) {
    const target = e.target
    if (target.hasAttribute('magnet')) {
      // port
      const className = this.prefixClassName('port-unconnectable')
      if (this.can('magnetConnectable')) {
        Dom.removeClass(target, className)
      } else {
        Dom.addClass(target, className)
      }
    } else {
      // node
      const className = this.prefixClassName('node-immovable')
      if (this.can('nodeMovable')) {
        this.removeClass(className)
      } else {
        this.addClass(className)
      }
    }
  }

  isNodeView(): this is NodeView {
    return true
  }

  confirmUpdate(flag: number, options: any = {}) {
    let ret = flag
    if (this.hasAction(ret, 'ports')) {
      this.removePorts()
      this.cleanPortsCache()
    }

    if (this.hasAction(ret, 'render')) {
      this.render()
      ret = this.removeAction(ret, [
        'render',
        'update',
        'resize',
        'translate',
        'rotate',
        'ports',
        'tools',
      ])
    } else {
      ret = this.handleAction(
        ret,
        'resize',
        () => this.resize(),
        'update', // Resize method is calling `update()` internally
      )

      ret = this.handleAction(
        ret,
        'update',
        () => this.update(),
        // `update()` will render ports when useCSSSelectors are enabled
        Config.useCSSSelector ? 'ports' : null,
      )

      ret = this.handleAction(ret, 'translate', () => this.translate())
      ret = this.handleAction(ret, 'rotate', () => this.rotate())
      ret = this.handleAction(ret, 'ports', () => this.renderPorts())
      ret = this.handleAction(ret, 'tools', () => {
        if (this.getFlag('tools') === flag) {
          this.renderTools()
        } else {
          this.updateTools(options)
        }
      })
    }

    return ret
  }

  update(partialAttrs?: Attr.CellAttrs) {
    this.cleanCache()

    // When CSS selector strings are used, make sure no rule matches port nodes.
    if (Config.useCSSSelector) {
      this.removePorts()
    }

    const node = this.cell
    const size = node.getSize()
    const attrs = node.getAttrs()
    this.updateAttrs(this.container, attrs, {
      attrs: partialAttrs === attrs ? null : partialAttrs,
      rootBBox: new Rectangle(0, 0, size.width, size.height),
      selectors: this.selectors,
    })

    if (Config.useCSSSelector) {
      this.renderPorts()
    }
  }

  protected renderMarkup() {
    const markup = this.cell.markup
    if (markup) {
      if (typeof markup === 'string') {
        throw new TypeError('Not support string markup.')
      }

      return this.renderJSONMarkup(markup)
    }

    throw new TypeError('Invalid node markup.')
  }

  protected renderJSONMarkup(markup: Markup.JSONMarkup | Markup.JSONMarkup[]) {
    const ret = this.parseJSONMarkup(markup, this.container)
    this.selectors = ret.selectors
    this.container.appendChild(ret.fragment)
  }

  render() {
    this.empty()
    this.renderMarkup()

    this.resize()
    this.updateTransform()

    if (!Config.useCSSSelector) {
      this.renderPorts()
    }

    this.renderTools()

    return this
  }

  resize() {
    if (this.cell.getAngle()) {
      this.rotate()
    }

    this.update()
  }

  translate() {
    this.updateTransform()
  }

  rotate() {
    this.updateTransform()
  }

  protected getTranslationString() {
    const position = this.cell.getPosition()
    return `translate(${position.x},${position.y})`
  }

  protected getRotationString() {
    const angle = this.cell.getAngle()
    if (angle) {
      const size = this.cell.getSize()
      return `rotate(${angle},${size.width / 2},${size.height / 2})`
    }
  }

  protected updateTransform() {
    let transform = this.getTranslationString()
    const rot = this.getRotationString()
    if (rot) {
      transform += ` ${rot}`
    }
    this.container.setAttribute('transform', transform)
  }

  // #region ports

  findPortElem(portId?: string, selector?: string) {
    const cache = portId ? this.portsCache[portId] : null
    if (!cache) {
      return null
    }
    const portRoot = cache.portContentElement
    const portSelectors = cache.portContentSelectors || {}
    return this.findOne(selector, portRoot, portSelectors)
  }

  protected cleanPortsCache() {
    this.portsCache = {}
  }

  protected removePorts() {
    Object.values(this.portsCache).forEach((cached) => {
      Dom.remove(cached.portElement)
    })
  }

  protected renderPorts() {
    const container = this.container
    // References to rendered elements without z-index
    const references: Element[] = []
    container.childNodes.forEach((child) => {
      references.push(child as Element)
    })
    const parsedPorts = this.cell.getParsedPorts()
    const portsGropsByZ = ArrayExt.groupBy(parsedPorts, 'zIndex')
    const autoZIndexKey = 'auto'

    // render non-z first
    if (portsGropsByZ[autoZIndexKey]) {
      portsGropsByZ[autoZIndexKey].forEach((port) => {
        const portElement = this.getPortElement(port)
        container.append(portElement)
        references.push(portElement)
      })
    }

    Object.keys(portsGropsByZ).forEach((key) => {
      if (key !== autoZIndexKey) {
        const zIndex = parseInt(key, 10)
        this.appendPorts(portsGropsByZ[key], zIndex, references)
      }
    })

    this.updatePorts()
  }

  protected appendPorts(
    ports: PortManager.Port[],
    zIndex: number,
    refs: Element[],
  ) {
    const elems = ports.map((p) => this.getPortElement(p))
    if (refs[zIndex] || zIndex < 0) {
      Dom.before(refs[Math.max(zIndex, 0)], elems)
    } else {
      Dom.append(this.container, elems)
    }
  }

  protected getPortElement(port: PortManager.Port) {
    const cached = this.portsCache[port.id]
    if (cached) {
      return cached.portElement
    }

    return this.createPortElement(port)
  }

  protected createPortElement(port: PortManager.Port) {
    let renderResult = Markup.renderMarkup(this.cell.getPortContainerMarkup())
    const portElement = renderResult.elem
    if (portElement == null) {
      throw new Error('Invalid port container markup.')
    }

    renderResult = Markup.renderMarkup(this.getPortMarkup(port))
    const portContentElement = renderResult.elem
    const portContentSelectors = renderResult.selectors

    if (portContentElement == null) {
      throw new Error('Invalid port markup.')
    }

    this.setAttrs(
      {
        port: port.id,
        'port-group': port.group,
      },
      portContentElement,
    )

    let portClass = 'x6-port'
    if (port.group) {
      portClass += ` x6-port-${port.group}`
    }
    Dom.addClass(portElement, portClass)
    Dom.addClass(portElement, 'x6-port')
    Dom.addClass(portContentElement, 'x6-port-body')
    portElement.appendChild(portContentElement)

    let portSelectors: Markup.Selectors | undefined = portContentSelectors
    let portLabelElement: Element | undefined
    let portLabelSelectors: Markup.Selectors | null | undefined
    const existLabel = this.existPortLabel(port)
    if (existLabel) {
      renderResult = Markup.renderMarkup(this.getPortLabelMarkup(port.label))
      portLabelElement = renderResult.elem
      portLabelSelectors = renderResult.selectors
      if (portLabelElement == null) {
        throw new Error('Invalid port label markup.')
      }
      if (portContentSelectors && portLabelSelectors) {
        // eslint-disable-next-line
        for (const key in portLabelSelectors) {
          if (portContentSelectors[key] && key !== this.rootSelector) {
            throw new Error('Selectors within port must be unique.')
          }
        }
        portSelectors = {
          ...portContentSelectors,
          ...portLabelSelectors,
        }
      }
      Dom.addClass(portLabelElement, 'x6-port-label')
      portElement.appendChild(portLabelElement)
    }

    this.portsCache[port.id] = {
      portElement,
      portSelectors,
      portLabelElement,
      portLabelSelectors,
      portContentElement,
      portContentSelectors,
    }

    if (this.graph.options.onPortRendered) {
      this.graph.options.onPortRendered({
        port,
        node: this.cell,
        container: portElement,
        selectors: portSelectors,
        labelContainer: portLabelElement,
        labelSelectors: portLabelSelectors,
        contentContainer: portContentElement,
        contentSelectors: portContentSelectors,
      })
    }

    return portElement
  }

  protected updatePorts() {
    const groups = this.cell.getParsedGroups()
    const groupList = Object.keys(groups)
    if (groupList.length === 0) {
      this.updatePortGroup()
    } else {
      groupList.forEach((groupName) => this.updatePortGroup(groupName))
    }
  }

  protected updatePortGroup(groupName?: string) {
    const bbox = Rectangle.fromSize(this.cell.getSize())
    const metrics = this.cell.getPortsLayoutByGroup(groupName, bbox)

    for (let i = 0, n = metrics.length; i < n; i += 1) {
      const metric = metrics[i]
      const portId = metric.portId
      const cached = this.portsCache[portId] || {}
      const portLayout = metric.portLayout
      this.applyPortTransform(cached.portElement, portLayout)
      if (metric.portAttrs != null) {
        const options: Partial<AttrManager.UpdateOptions> = {
          selectors: cached.portSelectors || {},
        }

        if (metric.portSize) {
          options.rootBBox = Rectangle.fromSize(metric.portSize)
        }

        this.updateAttrs(cached.portElement, metric.portAttrs, options)
      }

      const labelLayout = metric.labelLayout
      if (labelLayout && cached.portLabelElement) {
        this.applyPortTransform(
          cached.portLabelElement,
          labelLayout,
          -(portLayout.angle || 0),
        )

        if (labelLayout.attrs) {
          const options: Partial<AttrManager.UpdateOptions> = {
            selectors: cached.portLabelSelectors || {},
          }

          if (metric.labelSize) {
            options.rootBBox = Rectangle.fromSize(metric.labelSize)
          }

          this.updateAttrs(cached.portLabelElement, labelLayout.attrs, options)
        }
      }
    }
  }

  protected applyPortTransform(
    element: Element,
    layout: PortLayout.Result,
    initialAngle = 0,
  ) {
    const angle = layout.angle
    const position = layout.position
    const matrix = Dom.createSVGMatrix()
      .rotate(initialAngle)
      .translate(position.x || 0, position.y || 0)
      .rotate(angle || 0)

    Dom.transform(element as SVGElement, matrix, { absolute: true })
  }

  protected getPortMarkup(port: PortManager.Port) {
    return port.markup || this.cell.portMarkup
  }

  protected getPortLabelMarkup(label: PortManager.Label) {
    return label.markup || this.cell.portLabelMarkup
  }

  protected existPortLabel(port: PortManager.Port) {
    return port.attrs && port.attrs.text
  }

  // #endregion

  // #region events

  protected getEventArgs<E>(e: E): NodeView.MouseEventArgs<E>
  protected getEventArgs<E>(
    e: E,
    x: number,
    y: number,
  ): NodeView.PositionEventArgs<E>
  protected getEventArgs<E>(e: E, x?: number, y?: number) {
    const view = this // eslint-disable-line
    const node = view.cell
    const cell = node
    if (x == null || y == null) {
      return { e, view, node, cell } as NodeView.MouseEventArgs<E>
    }
    return { e, x, y, view, node, cell } as NodeView.PositionEventArgs<E>
  }

  protected getPortEventArgs<E>(
    e: E,
    port: string,
    pos?: { x: number; y: number },
  ): NodeView.PositionEventArgs<E> | NodeView.MouseEventArgs<E> {
    const view = this // eslint-disable-line
    const node = view.cell
    const cell = node
    if (pos) {
      return {
        e,
        x: pos.x,
        y: pos.y,
        view,
        node,
        cell,
        port,
      } as NodeView.PositionEventArgs<E>
    }
    return { e, view, node, cell, port } as NodeView.MouseEventArgs<E>
  }

  notifyMouseDown(e: Dom.MouseDownEvent, x: number, y: number) {
    super.onMouseDown(e, x, y)
    this.notify('node:mousedown', this.getEventArgs(e, x, y))
  }

  notifyMouseMove(e: Dom.MouseMoveEvent, x: number, y: number) {
    super.onMouseMove(e, x, y)
    this.notify('node:mousemove', this.getEventArgs(e, x, y))
  }

  notifyMouseUp(e: Dom.MouseUpEvent, x: number, y: number) {
    super.onMouseUp(e, x, y)
    this.notify('node:mouseup', this.getEventArgs(e, x, y))
  }

  notifyPortEvent(
    name: string,
    e: Dom.EventObject,
    pos?: { x: number; y: number },
  ) {
    const port = this.findAttr('port', e.target)
    if (port) {
      const originType = e.type
      if (name === 'node:port:mouseenter') {
        e.type = 'mouseenter'
      } else if (name === 'node:port:mouseleave') {
        e.type = 'mouseleave'
      }
      this.notify(name, this.getPortEventArgs(e, port, pos))
      e.type = originType
    }
  }

  onClick(e: Dom.ClickEvent, x: number, y: number) {
    // 触发CellView的click事件 graph.on('cell:click')
    super.onClick(e, x, y)
    // 触发NodeView的click事件 graph.on('node:click')，这个监听会更具体
    this.notify('node:click', this.getEventArgs(e, x, y))
    // 触发连接桩点击事件
    this.notifyPortEvent('node:port:click', e, { x, y })
  }

  onDblClick(e: Dom.DoubleClickEvent, x: number, y: number) {
    super.onDblClick(e, x, y)
    this.notify('node:dblclick', this.getEventArgs(e, x, y))
    this.notifyPortEvent('node:port:dblclick', e, { x, y })
  }

  onContextMenu(e: Dom.ContextMenuEvent, x: number, y: number) {
    super.onContextMenu(e, x, y)
    this.notify('node:contextmenu', this.getEventArgs(e, x, y))
    this.notifyPortEvent('node:port:contextmenu', e, { x, y })
  }

  onMouseDown(e: Dom.MouseDownEvent, x: number, y: number) {
    if (this.isPropagationStopped(e)) {
      return
    }
    this.notifyMouseDown(e, x, y)
    this.notifyPortEvent('node:port:mousedown', e, { x, y })
    this.startNodeDragging(e, x, y)
  }

  onMouseMove(e: Dom.MouseMoveEvent, x: number, y: number) {
    const data = this.getEventData<EventData.Mousemove>(e)
    const action = data.action
    if (action === 'magnet') {
      this.dragMagnet(e, x, y)
    } else {
      if (action === 'move') {
        const meta = data as EventData.Moving
        const view = meta.targetView || this
        view.dragNode(e, x, y)
        view.notify('node:moving', {
          e,
          x,
          y,
          view,
          cell: view.cell,
          node: view.cell,
        })
      }
      this.notifyMouseMove(e, x, y)
      this.notifyPortEvent('node:port:mousemove', e, { x, y })
    }

    this.setEventData<EventData.Mousemove>(e, data)
  }

  onMouseUp(e: Dom.MouseUpEvent, x: number, y: number) {
    const data = this.getEventData<EventData.Mousemove>(e)
    const action = data.action
    if (action === 'magnet') {
      this.stopMagnetDragging(e, x, y)
    } else {
      this.notifyMouseUp(e, x, y)
      this.notifyPortEvent('node:port:mouseup', e, { x, y })
      if (action === 'move') {
        const meta = data as EventData.Moving
        const view = meta.targetView || this
        view.stopNodeDragging(e, x, y)
      }
    }

    const magnet = (data as EventData.Magnet).targetMagnet
    if (magnet) {
      this.onMagnetClick(e, magnet, x, y)
    }

    this.checkMouseleave(e)
  }

  onMouseOver(e: Dom.MouseOverEvent) {
    super.onMouseOver(e)
    this.notify('node:mouseover', this.getEventArgs(e))
    // mock mouseenter event,so we can get correct trigger time when move mouse from node to port
    // wo also need to change e.type for use get correct event args
    this.notifyPortEvent('node:port:mouseenter', e)
    this.notifyPortEvent('node:port:mouseover', e)
  }

  onMouseOut(e: Dom.MouseOutEvent) {
    super.onMouseOut(e)
    this.notify('node:mouseout', this.getEventArgs(e))
    // mock mouseleave event,so we can get correct trigger time when move mouse from port to node
    // wo also need to change e.type for use get correct event args
    this.notifyPortEvent('node:port:mouseleave', e)
    this.notifyPortEvent('node:port:mouseout', e)
  }

  onMouseEnter(e: Dom.MouseEnterEvent) {
    this.updateClassName(e)
    super.onMouseEnter(e)
    this.notify('node:mouseenter', this.getEventArgs(e))
  }

  onMouseLeave(e: Dom.MouseLeaveEvent) {
    super.onMouseLeave(e)
    this.notify('node:mouseleave', this.getEventArgs(e))
  }

  onMouseWheel(e: Dom.EventObject, x: number, y: number, delta: number) {
    super.onMouseWheel(e, x, y, delta)
    this.notify('node:mousewheel', {
      delta,
      ...this.getEventArgs(e, x, y),
    })
  }

  onMagnetClick(e: Dom.MouseUpEvent, magnet: Element, x: number, y: number) {
    const graph = this.graph
    const count = graph.view.getMouseMovedCount(e)
    if (count > graph.options.clickThreshold) {
      return
    }
    this.notify('node:magnet:click', {
      magnet,
      ...this.getEventArgs(e, x, y),
    })
  }

  onMagnetDblClick(
    e: Dom.DoubleClickEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {
    this.notify('node:magnet:dblclick', {
      magnet,
      ...this.getEventArgs(e, x, y),
    })
  }

  onMagnetContextMenu(
    e: Dom.ContextMenuEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {
    this.notify('node:magnet:contextmenu', {
      magnet,
      ...this.getEventArgs(e, x, y),
    })
  }

  onMagnetMouseDown(
    e: Dom.MouseDownEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {
    this.startMagnetDragging(e, x, y)
  }

  onCustomEvent(e: Dom.MouseDownEvent, name: string, x: number, y: number) {
    this.notify('node:customevent', { name, ...this.getEventArgs(e, x, y) })
    super.onCustomEvent(e, name, x, y)
  }

  protected prepareEmbedding(e: Dom.MouseMoveEvent) {
    const graph = this.graph
    const data = this.getEventData<EventData.MovingTargetNode>(e)
    const node = data.cell || this.cell
    const view = graph.findViewByCell(node)
    const localPoint = graph.snapToGrid(e.clientX, e.clientY)

    this.notify('node:embed', {
      e,
      node,
      view,
      cell: node,
      x: localPoint.x,
      y: localPoint.y,
      currentParent: node.getParent(),
    })
  }

  processEmbedding(e: Dom.MouseMoveEvent, data: EventData.MovingTargetNode) {
    const cell = data.cell || this.cell
    const graph = data.graph || this.graph
    const options = graph.options.embedding
    const findParent = options.findParent

    let candidates =
      typeof findParent === 'function'
        ? (
            FunctionExt.call(findParent, graph, {
              view: this,
              node: this.cell,
            }) as Cell[]
          ).filter((c) => {
            return (
              Cell.isCell(c) &&
              this.cell.id !== c.id &&
              !c.isDescendantOf(this.cell)
            )
          })
        : graph.model.getNodesUnderNode(cell, {
            by: findParent as Rectangle.KeyPoint,
          })

    // Picks the node with the highest `z` index
    if (options.frontOnly) {
      if (candidates.length > 0) {
        const zIndexMap = ArrayExt.groupBy(candidates, 'zIndex')
        const maxZIndex = ArrayExt.max(
          Object.keys(zIndexMap).map((z) => parseInt(z, 10)),
        )
        if (maxZIndex) {
          candidates = zIndexMap[maxZIndex]
        }
      }
    }

    // Filter the nodes which is invisiable
    candidates = candidates.filter((candidate) => candidate.visible)

    let newCandidateView = null
    const prevCandidateView = data.candidateEmbedView
    const validateEmbeding = options.validate
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const candidate = candidates[i]

      if (prevCandidateView && prevCandidateView.cell.id === candidate.id) {
        // candidate remains the same
        newCandidateView = prevCandidateView
        break
      } else {
        const view = candidate.findView(graph) as NodeView
        if (
          validateEmbeding &&
          FunctionExt.call(validateEmbeding, graph, {
            child: this.cell,
            parent: view.cell,
            childView: this,
            parentView: view,
          })
        ) {
          // flip to the new candidate
          newCandidateView = view
          break
        }
      }
    }

    this.clearEmbedding(data)
    if (newCandidateView) {
      newCandidateView.highlight(null, { type: 'embedding' })
    }
    data.candidateEmbedView = newCandidateView

    const localPoint = graph.snapToGrid(e.clientX, e.clientY)
    this.notify('node:embedding', {
      e,
      cell,
      node: cell,
      view: graph.findViewByCell(cell),
      x: localPoint.x,
      y: localPoint.y,
      currentParent: cell.getParent(),
      candidateParent: newCandidateView ? newCandidateView.cell : null,
    })
  }

  clearEmbedding(data: EventData.MovingTargetNode) {
    const candidateView = data.candidateEmbedView
    if (candidateView) {
      candidateView.unhighlight(null, { type: 'embedding' })
      data.candidateEmbedView = null
    }
  }

  finalizeEmbedding(e: Dom.MouseUpEvent, data: EventData.MovingTargetNode) {
    this.graph.startBatch('embedding')
    const cell = data.cell || this.cell
    const graph = data.graph || this.graph
    const view = graph.findViewByCell(cell)
    const parent = cell.getParent()
    const candidateView = data.candidateEmbedView
    if (candidateView) {
      // Candidate view is chosen to become the parent of the node.
      candidateView.unhighlight(null, { type: 'embedding' })
      data.candidateEmbedView = null
      if (parent == null || parent.id !== candidateView.cell.id) {
        candidateView.cell.insertChild(cell, undefined, { ui: true })
      }
    } else if (parent) {
      parent.unembed(cell, { ui: true })
    }

    graph.model.getConnectedEdges(cell, { deep: true }).forEach((edge) => {
      edge.updateParent({ ui: true })
    })

    if (view && candidateView) {
      const localPoint = graph.snapToGrid(e.clientX, e.clientY)
      view.notify('node:embedded', {
        e,
        cell,
        x: localPoint.x,
        y: localPoint.y,
        node: cell,
        view: graph.findViewByCell(cell),
        previousParent: parent,
        currentParent: cell.getParent(),
      })
    }

    this.graph.stopBatch('embedding')
  }

  getDelegatedView() {
    let cell = this.cell
    let view: NodeView = this // eslint-disable-line

    while (view) {
      if (cell.isEdge()) {
        break
      }
      if (!cell.hasParent() || view.can('stopDelegateOnDragging')) {
        return view
      }
      cell = cell.getParent() as Entity
      view = this.graph.findViewByCell(cell) as NodeView
    }

    return null
  }

  protected validateMagnet(
    cellView: CellView,
    magnet: Element,
    e: Dom.MouseDownEvent | Dom.MouseEnterEvent,
  ) {
    if (magnet.getAttribute('magnet') !== 'passive') {
      const validate = this.graph.options.connecting.validateMagnet
      if (validate) {
        return FunctionExt.call(validate, this.graph, {
          e,
          magnet,
          view: cellView,
          cell: cellView.cell,
        })
      }
      return true
    }
    return false
  }

  protected startMagnetDragging(e: Dom.MouseDownEvent, x: number, y: number) {
    if (!this.can('magnetConnectable')) {
      return
    }

    e.stopPropagation()

    const magnet = e.currentTarget
    const graph = this.graph

    this.setEventData<Partial<EventData.Magnet>>(e, {
      targetMagnet: magnet,
    })

    if (this.validateMagnet(this, magnet, e)) {
      if (graph.options.magnetThreshold <= 0) {
        this.startConnectting(e, magnet, x, y)
      }

      this.setEventData<Partial<EventData.Magnet>>(e, {
        action: 'magnet',
      })
      this.stopPropagation(e)
    } else {
      this.onMouseDown(e, x, y)
    }

    graph.view.delegateDragEvents(e, this)
  }

  protected startConnectting(
    e: Dom.MouseDownEvent,
    magnet: Element,
    x: number,
    y: number,
  ) {
    this.graph.model.startBatch('add-edge')
    const edgeView = this.createEdgeFromMagnet(magnet, x, y)
    edgeView.setEventData(
      e,
      edgeView.prepareArrowheadDragging('target', {
        x,
        y,
        isNewEdge: true,
        fallbackAction: 'remove',
      }),
    )
    this.setEventData<Partial<EventData.Magnet>>(e, { edgeView })
    edgeView.notifyMouseDown(e, x, y)
  }

  protected getDefaultEdge(sourceView: CellView, sourceMagnet: Element) {
    let edge: Edge | undefined | null | void

    const create = this.graph.options.connecting.createEdge
    if (create) {
      edge = FunctionExt.call(create, this.graph, {
        sourceMagnet,
        sourceView,
        sourceCell: sourceView.cell,
      })
    }

    return edge as Edge
  }

  protected createEdgeFromMagnet(magnet: Element, x: number, y: number) {
    const graph = this.graph
    const model = graph.model
    const edge = this.getDefaultEdge(this, magnet)

    edge.setSource({
      ...edge.getSource(),
      ...this.getEdgeTerminal(magnet, x, y, edge, 'source'),
    })
    edge.setTarget({ ...edge.getTarget(), x, y })
    edge.addTo(model, { async: false, ui: true })

    return edge.findView(graph) as EdgeView
  }

  protected dragMagnet(e: Dom.MouseMoveEvent, x: number, y: number) {
    const data = this.getEventData<EventData.Magnet>(e)
    const edgeView = data.edgeView
    if (edgeView) {
      edgeView.onMouseMove(e, x, y)
      this.autoScrollGraph(e.clientX, e.clientY)
    } else {
      const graph = this.graph
      const magnetThreshold = graph.options.magnetThreshold as any
      const currentTarget = this.getEventTarget(e)
      const targetMagnet = data.targetMagnet

      // magnetThreshold when the pointer leaves the magnet
      if (magnetThreshold === 'onleave') {
        if (
          targetMagnet === currentTarget ||
          targetMagnet.contains(currentTarget)
        ) {
          return
        }
        // eslint-disable-next-line no-lonely-if
      } else {
        // magnetThreshold defined as a number of movements
        if (graph.view.getMouseMovedCount(e) <= magnetThreshold) {
          return
        }
      }
      this.startConnectting(e as any, targetMagnet, x, y)
    }
  }

  protected stopMagnetDragging(e: Dom.MouseUpEvent, x: number, y: number) {
    const data = this.eventData<EventData.Magnet>(e)
    const edgeView = data.edgeView
    if (edgeView) {
      edgeView.onMouseUp(e, x, y)
      this.graph.model.stopBatch('add-edge')
    }
  }

  protected notifyUnhandledMouseDown(
    e: Dom.MouseDownEvent,
    x: number,
    y: number,
  ) {
    this.notify('node:unhandled:mousedown', {
      e,
      x,
      y,
      view: this,
      cell: this.cell,
      node: this.cell,
    })
  }

  protected notifyNodeMove<Key extends keyof NodeView.EventArgs>(
    name: Key,
    e: Dom.MouseMoveEvent | Dom.MouseUpEvent,
    x: number,
    y: number,
    cell: Cell,
  ) {
    let cells = [cell]

    const selection = this.graph.getPlugin<any>('selection')
    if (selection && selection.isSelectionMovable()) {
      const selectedCells = selection.getSelectedCells()
      if (selectedCells.includes(cell)) {
        cells = selectedCells.filter((c: Cell) => c.isNode())
      }
    }

    cells.forEach((c: Cell) => {
      this.notify(name, {
        e,
        x,
        y,
        cell: c,
        node: c,
        view: c.findView(this.graph),
      })
    })
  }

  protected getRestrictArea(view?: NodeView): Rectangle.RectangleLike | null {
    const restrict = this.graph.options.translating.restrict
    const area =
      typeof restrict === 'function'
        ? FunctionExt.call(restrict, this.graph, view!)
        : restrict

    if (typeof area === 'number') {
      return this.graph.transform.getGraphArea().inflate(area)
    }

    if (area === true) {
      return this.graph.transform.getGraphArea()
    }

    return area || null
  }
  /**
   * 开始节点拖拽
   * @param e 
   * @param x 
   * @param y 
   * @returns 
   */
  protected startNodeDragging(e: Dom.MouseDownEvent, x: number, y: number) {
    const targetView = this.getDelegatedView()
    if (targetView == null || !targetView.can('nodeMovable')) {
      return this.notifyUnhandledMouseDown(e, x, y)
    }
    // 往自定义event中传数据
    this.setEventData<EventData.Moving>(e, {
      targetView,
      action: 'move',
    })
    // 当前cell的位置
    const position = Point.create(targetView.cell.getPosition())
    targetView.setEventData<EventData.MovingTargetNode>(e, {
      moving: false,
      // 当前点击位置相对于cell的位置的偏移量
      offset: position.diff(x, y),
      restrict: this.getRestrictArea(targetView),
    })
  }

  protected dragNode(e: Dom.MouseMoveEvent, x: number, y: number) {
    const node = this.cell
    const graph = this.graph
    const gridSize = graph.getGridSize()
    const data = this.getEventData<EventData.MovingTargetNode>(e)
    const offset = data.offset
    const restrict = data.restrict

    if (!data.moving) {
      data.moving = true
      this.addClass('node-moving')
      this.notifyNodeMove('node:move', e, x, y, this.cell)
    }

    this.autoScrollGraph(e.clientX, e.clientY)

    const posX = GeometryUtil.snapToGrid(x + offset.x, gridSize)
    const posY = GeometryUtil.snapToGrid(y + offset.y, gridSize)
    node.setPosition(posX, posY, {
      restrict,
      deep: true,
      ui: true,
    })

    if (graph.options.embedding.enabled) {
      if (!data.embedding) {
        this.prepareEmbedding(e)
        data.embedding = true
      }
      this.processEmbedding(e, data)
    }
  }
  /**
   * 结束时间拖拽
   * @param e 
   * @param x 
   * @param y 
   */
  protected stopNodeDragging(e: Dom.MouseUpEvent, x: number, y: number) {
    const data = this.getEventData<EventData.MovingTargetNode>(e)
    if (data.embedding) {
      this.finalizeEmbedding(e, data)
    }

    if (data.moving) {
      this.removeClass('node-moving')
      this.notifyNodeMove('node:moved', e, x, y, this.cell)
    }

    data.moving = false
    data.embedding = false
  }

  // eslint-disable-next-line
  protected autoScrollGraph(x: number, y: number) {
    const scroller = this.graph.getPlugin<any>('scroller')
    if (scroller) {
      scroller.autoScroll(x, y)
    }
  }

  // #endregion
}

export namespace NodeView {
  export interface Options extends CellView.Options {}

  export interface PortCache {
    portElement: Element
    portSelectors?: Markup.Selectors | null
    portLabelElement?: Element
    portLabelSelectors?: Markup.Selectors | null
    portContentElement?: Element
    portContentSelectors?: Markup.Selectors | null
  }
}

export namespace NodeView {
  interface MagnetEventArgs {
    magnet: Element
  }
  export interface MouseEventArgs<E> {
    e: E
    node: Node
    cell: Node
    view: NodeView
    port?: string
  }
  export interface PositionEventArgs<E>
    extends MouseEventArgs<E>,
      CellView.PositionEventArgs {}

  export interface TranslateEventArgs<E> extends PositionEventArgs<E> {}

  export interface ResizeEventArgs<E> extends PositionEventArgs<E> {}

  export interface RotateEventArgs<E> extends PositionEventArgs<E> {}

  export interface EventArgs {
    'node:click': PositionEventArgs<Dom.ClickEvent>
    'node:dblclick': PositionEventArgs<Dom.DoubleClickEvent>
    'node:contextmenu': PositionEventArgs<Dom.ContextMenuEvent>
    'node:mousedown': PositionEventArgs<Dom.MouseDownEvent>
    'node:mousemove': PositionEventArgs<Dom.MouseMoveEvent>
    'node:mouseup': PositionEventArgs<Dom.MouseUpEvent>
    'node:mouseover': MouseEventArgs<Dom.MouseOverEvent>
    'node:mouseout': MouseEventArgs<Dom.MouseOutEvent>
    'node:mouseenter': MouseEventArgs<Dom.MouseEnterEvent>
    'node:mouseleave': MouseEventArgs<Dom.MouseLeaveEvent>
    'node:mousewheel': PositionEventArgs<Dom.EventObject> &
      CellView.MouseDeltaEventArgs

    'node:port:click': PositionEventArgs<Dom.ClickEvent>
    'node:port:dblclick': PositionEventArgs<Dom.DoubleClickEvent>
    'node:port:contextmenu': PositionEventArgs<Dom.ContextMenuEvent>
    'node:port:mousedown': PositionEventArgs<Dom.MouseDownEvent>
    'node:port:mousemove': PositionEventArgs<Dom.MouseMoveEvent>
    'node:port:mouseup': PositionEventArgs<Dom.MouseUpEvent>
    'node:port:mouseover': MouseEventArgs<Dom.MouseOverEvent>
    'node:port:mouseout': MouseEventArgs<Dom.MouseOutEvent>
    'node:port:mouseenter': MouseEventArgs<Dom.MouseEnterEvent>
    'node:port:mouseleave': MouseEventArgs<Dom.MouseLeaveEvent>

    'node:customevent': PositionEventArgs<Dom.MouseDownEvent> & {
      name: string
    }

    'node:unhandled:mousedown': PositionEventArgs<Dom.MouseDownEvent>

    'node:highlight': {
      magnet: Element
      view: NodeView
      node: Node
      cell: Node
      options: CellView.HighlightOptions
    }
    'node:unhighlight': EventArgs['node:highlight']

    'node:magnet:click': PositionEventArgs<Dom.MouseUpEvent> & MagnetEventArgs
    'node:magnet:dblclick': PositionEventArgs<Dom.DoubleClickEvent> &
      MagnetEventArgs
    'node:magnet:contextmenu': PositionEventArgs<Dom.ContextMenuEvent> &
      MagnetEventArgs

    'node:move': TranslateEventArgs<Dom.MouseMoveEvent>
    'node:moving': TranslateEventArgs<Dom.MouseMoveEvent>
    'node:moved': TranslateEventArgs<Dom.MouseUpEvent>

    'node:embed': PositionEventArgs<Dom.MouseMoveEvent> & {
      currentParent: Node | null
    }
    'node:embedding': PositionEventArgs<Dom.MouseMoveEvent> & {
      currentParent: Node | null
      candidateParent: Node | null
    }
    'node:embedded': PositionEventArgs<Dom.MouseUpEvent> & {
      currentParent: Node | null
      previousParent: Node | null
    }
  }
}

export namespace NodeView {
  export const toStringTag = `X6.${NodeView.name}`

  export function isNodeView(instance: any): instance is NodeView {
    if (instance == null) {
      return false
    }

    if (instance instanceof NodeView) {
      return true
    }

    const tag = instance[Symbol.toStringTag]
    const view = instance as NodeView

    if (
      (tag == null || tag === toStringTag) &&
      typeof view.isNodeView === 'function' &&
      typeof view.isEdgeView === 'function' &&
      typeof view.confirmUpdate === 'function' &&
      typeof view.update === 'function' &&
      typeof view.findPortElem === 'function' &&
      typeof view.resize === 'function' &&
      typeof view.rotate === 'function' &&
      typeof view.translate === 'function'
    ) {
      return true
    }

    return false
  }
}

namespace EventData {
  export type Mousemove = Moving | Magnet

  export interface Magnet {
    action: 'magnet'
    targetMagnet: Element
    edgeView?: EdgeView
  }

  export interface Moving {
    action: 'move'
    targetView: NodeView
  }

  export interface MovingTargetNode {
    moving: boolean
    offset: Point.PointLike
    restrict?: Rectangle.RectangleLike | null
    embedding?: boolean
    candidateEmbedView?: NodeView | null
    cell?: Node
    graph?: Graph
  }
}

NodeView.config({
  isSvgElement: true,
  priority: 0,
  bootstrap: ['render'],
  actions: {
    view: ['render'],
    markup: ['render'],
    attrs: ['update'],
    size: ['resize', 'ports', 'tools'],
    angle: ['rotate', 'tools'],
    position: ['translate', 'tools'],
    ports: ['ports'],
    tools: ['tools'],
  },
})

NodeView.registry.register('node', NodeView, true)

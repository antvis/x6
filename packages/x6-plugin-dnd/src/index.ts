import {
  GeometryUtil,
  Rectangle,
  Point,
  FunctionExt,
  Dom,
  CssLoader,
  Cell,
  Node,
  View,
  NodeView,
  Graph,
  EventArgs,
} from '@antv/x6'
import { alignPoint } from 'dom-align'
import { content } from './style/raw'

/**
 * 拖拽键入画布插件
 * drag and drop => dnd
 */
export class Dnd extends View implements Graph.Plugin {
  public name = 'dnd'

  protected sourceNode: Node | null
  protected draggingNode: Node | null
  protected draggingView: NodeView | null
  protected draggingBBox: Rectangle
  protected geometryBBox: Rectangle
  protected candidateEmbedView: NodeView | null
  protected delta: Point | null
  protected padding: number | null
  protected snapOffset: Point.PointLike | null

  public options: Dnd.Options
  public draggingGraph: Graph

  protected get targetScroller() {
    const target = this.options.target
    const scroller = target.getPlugin<any>('scroller')
    return scroller
  }

  protected get targetGraph() {
    return this.options.target
  }

  protected get targetModel() {
    return this.targetGraph.model
  }

  protected get snapline() {
    const target = this.options.target
    const snapline = target.getPlugin<any>('snapline')
    return snapline
  }

  constructor(options: Partial<Dnd.Options> & { target: Graph }) {
    super()
    this.options = {
      ...Dnd.defaults,
      ...options,
    } as Dnd.Options
    this.init()
  }

  init() {
    CssLoader.ensure(this.name, content)

    this.container = document.createElement('div')
    Dom.addClass(this.container, this.prefixClassName('widget-dnd'))

    this.draggingGraph = new Graph({
      ...this.options.delegateGraphOptions,
      container: document.createElement('div'),
      width: 1,
      height: 1,
      async: false,
    })

    Dom.append(this.container, this.draggingGraph.container)
  }

  start(node: Node, evt: Dom.MouseDownEvent | MouseEvent) {
    const e = evt as Dom.MouseDownEvent

    e.preventDefault()

    this.targetModel.startBatch('dnd')
    Dom.addClass(this.container, 'dragging')
    Dom.appendTo(
      this.container,
      this.options.draggingContainer || document.body,
    )

    this.sourceNode = node
    this.prepareDragging(node, e.clientX, e.clientY)

    const local = this.updateNodePosition(e.clientX, e.clientY)

    if (this.isSnaplineEnabled()) {
      this.snapline.captureCursorOffset({
        e,
        node,
        cell: node,
        view: this.draggingView!,
        x: local.x,
        y: local.y,
      })
      this.draggingNode!.on('change:position', this.snap, this)
    }

    this.delegateDocumentEvents(Dnd.documentEvents, e.data)
  }

  protected isSnaplineEnabled() {
    return this.snapline && this.snapline.isEnabled()
  }

  protected prepareDragging(
    sourceNode: Node,
    clientX: number,
    clientY: number,
  ) {
    const draggingGraph = this.draggingGraph
    const draggingModel = draggingGraph.model
    const draggingNode = this.options.getDragNode(sourceNode, {
      sourceNode,
      draggingGraph,
      targetGraph: this.targetGraph,
    })

    draggingNode.position(0, 0)

    let padding = 5
    if (this.isSnaplineEnabled()) {
      padding += this.snapline.options.tolerance || 0
    }

    if (this.isSnaplineEnabled() || this.options.scaled) {
      const scale = this.targetGraph.transform.getScale()
      draggingGraph.scale(scale.sx, scale.sy)
      padding *= Math.max(scale.sx, scale.sy)
    } else {
      draggingGraph.scale(1, 1)
    }

    this.clearDragging()

    // if (this.options.animation) {
    //   this.$container.stop(true, true)
    // }

    draggingModel.resetCells([draggingNode])

    const delegateView = draggingGraph.findViewByCell(draggingNode) as NodeView
    delegateView.undelegateEvents()
    delegateView.cell.off('changed')
    draggingGraph.fitToContent({
      padding,
      allowNewOrigin: 'any',
      useCellGeometry: false,
    })

    const bbox = delegateView.getBBox()
    this.geometryBBox = delegateView.getBBox({ useCellGeometry: true })
    this.delta = this.geometryBBox.getTopLeft().diff(bbox.getTopLeft())
    this.draggingNode = draggingNode
    this.draggingView = delegateView
    this.draggingBBox = draggingNode.getBBox()
    this.padding = padding
    this.updateGraphPosition(clientX, clientY)
  }

  protected updateGraphPosition(clientX: number, clientY: number) {
    const delta = this.delta!
    const nodeBBox = this.geometryBBox
    const padding = this.padding || 5
    const offset = {
      left: clientX - delta.x - nodeBBox.width / 2 - padding,
      top: clientY - delta.y - nodeBBox.height / 2 - padding,
    }

    if (this.draggingGraph) {
      alignPoint(
        this.container,
        {
          clientX: offset.left,
          clientY: offset.top,
        },
        {
          points: ['tl'],
        },
      )
    }
  }

  protected updateNodePosition(x: number, y: number) {
    const local = this.targetGraph.clientToLocal(x, y)
    const bbox = this.draggingBBox!
    local.x -= bbox.width / 2
    local.y -= bbox.height / 2
    this.draggingNode!.position(local.x, local.y)
    return local
  }

  protected snap({
    cell,
    current,
    options,
  }: Cell.EventArgs['change:position']) {
    const node = cell as Node
    if (options.snapped) {
      const bbox = this.draggingBBox
      node.position(bbox.x + options.tx, bbox.y + options.ty, { silent: true })
      this.draggingView!.translate()
      node.position(current!.x, current!.y, { silent: true })

      this.snapOffset = {
        x: options.tx,
        y: options.ty,
      }
    } else {
      this.snapOffset = null
    }
  }

  protected onDragging(evt: Dom.MouseMoveEvent) {
    const draggingView = this.draggingView
    if (draggingView) {
      evt.preventDefault()
      const e = this.normalizeEvent(evt)
      const clientX = e.clientX
      const clientY = e.clientY

      this.updateGraphPosition(clientX, clientY)
      const local = this.updateNodePosition(clientX, clientY)
      const embeddingMode = this.targetGraph.options.embedding.enabled
      const isValidArea =
        (embeddingMode || this.isSnaplineEnabled()) &&
        this.isInsideValidArea({
          x: clientX,
          y: clientY,
        })

      if (embeddingMode) {
        draggingView.setEventData(e, {
          graph: this.targetGraph,
          candidateEmbedView: this.candidateEmbedView,
        })
        const data = draggingView.getEventData<any>(e)
        if (isValidArea) {
          draggingView.processEmbedding(e, data)
        } else {
          draggingView.clearEmbedding(data)
        }
        this.candidateEmbedView = data.candidateEmbedView
      }

      // update snapline
      if (this.isSnaplineEnabled()) {
        if (isValidArea) {
          this.snapline.snapOnMoving({
            e,
            view: draggingView!,
            x: local.x,
            y: local.y,
          } as EventArgs['node:mousemove'])
        } else {
          this.snapline.hide()
        }
      }
    }
  }

  protected onDragEnd(evt: Dom.MouseUpEvent) {
    const draggingNode = this.draggingNode
    if (draggingNode) {
      const e = this.normalizeEvent(evt)
      const draggingView = this.draggingView
      const draggingBBox = this.draggingBBox
      const snapOffset = this.snapOffset
      let x = draggingBBox.x
      let y = draggingBBox.y

      if (snapOffset) {
        x += snapOffset.x
        y += snapOffset.y
      }

      draggingNode.position(x, y, { silent: true })

      const ret = this.drop(draggingNode, { x: e.clientX, y: e.clientY })
      const callback = (node: null | Node) => {
        if (node) {
          this.onDropped(draggingNode)
          if (this.targetGraph.options.embedding.enabled && draggingView) {
            draggingView.setEventData(e, {
              cell: node,
              graph: this.targetGraph,
              candidateEmbedView: this.candidateEmbedView,
            })
            draggingView.finalizeEmbedding(e, draggingView.getEventData<any>(e))
          }
        } else {
          this.onDropInvalid()
        }

        this.candidateEmbedView = null
        this.targetModel.stopBatch('dnd')
      }

      if (FunctionExt.isAsync(ret)) {
        // stop dragging
        this.undelegateDocumentEvents()
        ret.then(callback) // eslint-disable-line
      } else {
        callback(ret)
      }
    }
  }

  protected clearDragging() {
    if (this.draggingNode) {
      this.sourceNode = null
      this.draggingNode.remove()
      this.draggingNode = null
      this.draggingView = null
      this.delta = null
      this.padding = null
      this.snapOffset = null
      this.undelegateDocumentEvents()
    }
  }

  protected onDropped(draggingNode: Node) {
    if (this.draggingNode === draggingNode) {
      this.clearDragging()
      Dom.removeClass(this.container, 'dragging')
      Dom.remove(this.container)
    }
  }

  protected onDropInvalid() {
    const draggingNode = this.draggingNode
    if (draggingNode) {
      this.onDropped(draggingNode)
      // todo
      // const anim = this.options.animation
      // if (anim) {
      //   const duration = (typeof anim === 'object' && anim.duration) || 150
      //   const easing = (typeof anim === 'object' && anim.easing) || 'swing'

      //   this.draggingView = null

      //   this.$container.animate(this.originOffset!, duration, easing, () =>
      //     this.onDropped(draggingNode),
      //   )
      // } else {
      //   this.onDropped(draggingNode)
      // }
    }
  }

  protected isInsideValidArea(p: Point.PointLike) {
    let targetRect: Rectangle
    let dndRect: Rectangle | null = null
    const targetGraph = this.targetGraph
    const targetScroller = this.targetScroller

    if (this.options.dndContainer) {
      dndRect = this.getDropArea(this.options.dndContainer)
    }
    const isInsideDndRect = dndRect && dndRect.containsPoint(p)

    if (targetScroller) {
      if (targetScroller.options.autoResize) {
        targetRect = this.getDropArea(targetScroller.container)
      } else {
        const outter = this.getDropArea(targetScroller.container)
        targetRect = this.getDropArea(targetGraph.container).intersectsWithRect(
          outter,
        )!
      }
    } else {
      targetRect = this.getDropArea(targetGraph.container)
    }

    return !isInsideDndRect && targetRect && targetRect.containsPoint(p)
  }

  protected getDropArea(elem: Element) {
    const offset = Dom.offset(elem)!
    const scrollTop =
      document.body.scrollTop || document.documentElement.scrollTop
    const scrollLeft =
      document.body.scrollLeft || document.documentElement.scrollLeft

    return Rectangle.create({
      x:
        offset.left +
        parseInt(Dom.css(elem, 'border-left-width')!, 10) -
        scrollLeft,
      y:
        offset.top +
        parseInt(Dom.css(elem, 'border-top-width')!, 10) -
        scrollTop,
      width: elem.clientWidth,
      height: elem.clientHeight,
    })
  }

  protected drop(draggingNode: Node, pos: Point.PointLike) {
    if (this.isInsideValidArea(pos)) {
      const targetGraph = this.targetGraph
      const targetModel = targetGraph.model
      const local = targetGraph.clientToLocal(pos)
      const sourceNode = this.sourceNode!
      const droppingNode = this.options.getDropNode(draggingNode, {
        sourceNode,
        draggingNode,
        targetGraph: this.targetGraph,
        draggingGraph: this.draggingGraph,
      })
      const bbox = droppingNode.getBBox()
      local.x += bbox.x - bbox.width / 2
      local.y += bbox.y - bbox.height / 2
      const gridSize = this.snapOffset ? 1 : targetGraph.getGridSize()

      droppingNode.position(
        GeometryUtil.snapToGrid(local.x, gridSize),
        GeometryUtil.snapToGrid(local.y, gridSize),
      )

      droppingNode.removeZIndex()

      const validateNode = this.options.validateNode
      const ret = validateNode
        ? validateNode(droppingNode, {
            sourceNode,
            draggingNode,
            droppingNode,
            targetGraph,
            draggingGraph: this.draggingGraph,
          })
        : true

      if (typeof ret === 'boolean') {
        if (ret) {
          targetModel.addCell(droppingNode, { stencil: this.cid })
          return droppingNode
        }
        return null
      }

      return FunctionExt.toDeferredBoolean(ret).then((valid) => {
        if (valid) {
          targetModel.addCell(droppingNode, { stencil: this.cid })
          return droppingNode
        }
        return null
      })
    }

    return null
  }

  protected onRemove() {
    if (this.draggingGraph) {
      this.draggingGraph.view.remove()
      this.draggingGraph.dispose()
    }
  }

  @View.dispose()
  dispose() {
    this.remove()
    CssLoader.clean(this.name)
  }
}

export namespace Dnd {
  export interface Options {
    target: Graph
    /**
     * Should scale the dragging node or not.
     */
    scaled?: boolean
    delegateGraphOptions?: Graph.Options
    // animation?:
    //   | boolean
    //   | {
    //       duration?: number
    //       easing?: string
    //     }
    draggingContainer?: HTMLElement
    /**
     * dnd tool box container.
     */
    dndContainer?: HTMLElement
    getDragNode: (sourceNode: Node, options: GetDragNodeOptions) => Node
    getDropNode: (draggingNode: Node, options: GetDropNodeOptions) => Node
    validateNode?: (
      droppingNode: Node,
      options: ValidateNodeOptions,
    ) => boolean | Promise<boolean>
  }

  export interface GetDragNodeOptions {
    sourceNode: Node
    targetGraph: Graph
    draggingGraph: Graph
  }

  export interface GetDropNodeOptions extends GetDragNodeOptions {
    draggingNode: Node
  }

  export interface ValidateNodeOptions extends GetDropNodeOptions {
    droppingNode: Node
  }

  export const defaults: Partial<Options> = {
    // animation: false,
    getDragNode: (sourceNode) => sourceNode.clone(),
    getDropNode: (draggingNode) => draggingNode.clone(),
  }

  export const documentEvents = {
    mousemove: 'onDragging',
    touchmove: 'onDragging',
    mouseup: 'onDragEnd',
    touchend: 'onDragEnd',
    touchcancel: 'onDragEnd',
  }
}

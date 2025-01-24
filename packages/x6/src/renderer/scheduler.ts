import { KeyValue, Dom, Disposable, FunctionExt } from '@antv/x6-common'
import { Rectangle } from '@antv/x6-geometry'
import { Model, Cell } from '../model'
import { View, CellView, NodeView, EdgeView } from '../view'
import { JobQueue, JOB_PRIORITY } from './queueJob'
import { FlagManager } from '../view/flag'
import { Graph } from '../graph'

export class Scheduler extends Disposable {
  // 存储所有的NodeView、EdgeView
  public views: KeyValue<Scheduler.View> = {}
  public willRemoveViews: KeyValue<Scheduler.View> = {}
  protected zPivots: KeyValue<Comment>
  private graph: Graph
  private renderArea?: Rectangle
  private queue: JobQueue

  get model() {
    return this.graph.model
  }

  get container() {
    return this.graph.view.stage
  }

  constructor(graph: Graph) {
    super()
    this.queue = new JobQueue()
    this.graph = graph
    this.init()
  }

  protected init() {
    this.startListening()
    this.renderViews(this.model.getCells())
  }

  protected startListening() {
    this.model.on('reseted', this.onModelReseted, this)
    this.model.on('cell:added', this.onCellAdded, this)
    this.model.on('cell:removed', this.onCellRemoved, this)
    this.model.on('cell:change:zIndex', this.onCellZIndexChanged, this)
    this.model.on('cell:change:visible', this.onCellVisibleChanged, this)
  }

  protected stopListening() {
    this.model.off('reseted', this.onModelReseted, this)
    this.model.off('cell:added', this.onCellAdded, this)
    this.model.off('cell:removed', this.onCellRemoved, this)
    this.model.off('cell:change:zIndex', this.onCellZIndexChanged, this)
    this.model.off('cell:change:visible', this.onCellVisibleChanged, this)
  }

  protected onModelReseted({ options }: Model.EventArgs['reseted']) {
    this.queue.clearJobs()
    this.removeZPivots()
    this.resetViews()
    const cells = this.model.getCells()
    this.renderViews(cells, { ...options, queue: cells.map((cell) => cell.id) })
  }

  protected onCellAdded({ cell, options }: Model.EventArgs['cell:added']) {
    this.renderViews([cell], options)
  }

  protected onCellRemoved({ cell }: Model.EventArgs['cell:removed']) {
    this.removeViews([cell])
  }

  protected onCellZIndexChanged({
    cell,
    options,
  }: Model.EventArgs['cell:change:zIndex']) {
    const viewItem = this.views[cell.id]
    if (viewItem) {
      this.requestViewUpdate(
        viewItem.view,
        Scheduler.FLAG_INSERT,
        options,
        JOB_PRIORITY.Update,
        true,
      )
    }
  }

  protected onCellVisibleChanged({
    cell,
    current,
  }: Model.EventArgs['cell:change:visible']) {
    this.toggleVisible(cell, !!current)
  }

  requestViewUpdate(
    view: CellView,
    flag: number,
    options: any = {},
    priority: JOB_PRIORITY = JOB_PRIORITY.Update,
    flush = true,
  ) {
    const id = view.cell.id
    const viewItem = this.views[id]

    if (!viewItem) {
      return
    }

    viewItem.flag = flag
    viewItem.options = options

    const priorAction = view.hasAction(flag, ['translate', 'resize', 'rotate'])
    if (priorAction || options.async === false) {
      priority = JOB_PRIORITY.PRIOR // eslint-disable-line
      flush = false // eslint-disable-line
    }

    this.queue.queueJob({
      id,
      priority,
      cb: () => {
        this.renderViewInArea(view, flag, options)
        const queue = options.queue
        if (queue) {
          const index = queue.indexOf(view.cell.id)
          if (index >= 0) {
            queue.splice(index, 1)
          }
          if (queue.length === 0) {
            this.graph.trigger('render:done')
          }
        }
      },
    })

    const effectedEdges = this.getEffectedEdges(view)
    effectedEdges.forEach((edge) => {
      this.requestViewUpdate(edge.view, edge.flag, options, priority, false)
    })

    if (flush) {
      this.flush()
    }
  }

  setRenderArea(area?: Rectangle) {
    this.renderArea = area
    this.flushWaitingViews()
  }

  isViewMounted(view: CellView) {
    if (view == null) {
      return false
    }

    const viewItem = this.views[view.cell.id]

    if (!viewItem) {
      return false
    }

    return viewItem.state === Scheduler.ViewState.MOUNTED
  }

  protected renderViews(cells: Cell[], options: any = {}) {
    cells.sort((c1, c2) => {
      if (c1.isNode() && c2.isEdge()) {
        return -1
      }
      return 0
    })

    cells.forEach((cell) => {
      const id = cell.id
      const views = this.views
      let flag = 0
      let viewItem = views[id]

      if (viewItem) {
        flag = Scheduler.FLAG_INSERT
      } else {
        const cellView = this.createCellView(cell)
        if (cellView) {
          cellView.graph = this.graph
          flag = Scheduler.FLAG_INSERT | cellView.getBootstrapFlag()
          viewItem = {
            view: cellView,
            flag,
            options,
            state: Scheduler.ViewState.CREATED,
          }
          // scheduler中的views,存储所有的CellView(NodeView、EdgeView)
          this.views[id] = viewItem
        }
      }

      if (viewItem) {
        this.requestViewUpdate(
          viewItem.view,
          flag,
          options,
          this.getRenderPriority(viewItem.view),
          false,
        )
      }
    })

    this.flush()
  }

  protected renderViewInArea(view: CellView, flag: number, options: any = {}) {
    const cell = view.cell
    const id = cell.id
    const viewItem = this.views[id]

    if (!viewItem) {
      return
    }

    let result = 0
    if (this.isUpdatable(view)) {
      result = this.updateView(view, flag, options)
      viewItem.flag = result
    } else {
      if (viewItem.state === Scheduler.ViewState.MOUNTED) {
        result = this.updateView(view, flag, options)
        viewItem.flag = result
      } else {
        viewItem.state = Scheduler.ViewState.WAITING
      }
    }

    if (result) {
      if (
        cell.isEdge() &&
        (result & view.getFlag(['source', 'target'])) === 0
      ) {
        this.queue.queueJob({
          id,
          priority: JOB_PRIORITY.RenderEdge,
          cb: () => {
            this.updateView(view, flag, options)
          },
        })
      }
    }
  }

  protected removeViews(cells: Cell[]) {
    cells.forEach((cell) => {
      const id = cell.id
      const viewItem = this.views[id]

      if (viewItem) {
        this.willRemoveViews[id] = viewItem
        delete this.views[id]

        this.queue.queueJob({
          id,
          priority: this.getRenderPriority(viewItem.view),
          cb: () => {
            this.removeView(viewItem.view)
          },
        })
      }
    })

    this.flush()
  }

  protected flush() {
    this.graph.options.async
      ? this.queue.queueFlush()
      : this.queue.queueFlushSync()
  }

  protected flushWaitingViews() {
    Object.values(this.views).forEach((viewItem) => {
      if (viewItem && viewItem.state === Scheduler.ViewState.WAITING) {
        const { view, flag, options } = viewItem
        this.requestViewUpdate(
          view,
          flag,
          options,
          this.getRenderPriority(view),
          false,
        )
      }
    })

    this.flush()
  }

  protected updateView(view: View, flag: number, options: any = {}) {
    if (view == null) {
      return 0
    }

    if (CellView.isCellView(view)) {
      if (flag & Scheduler.FLAG_REMOVE) {
        this.removeView(view.cell as any)
        return 0
      }

      if (flag & Scheduler.FLAG_INSERT) {
        this.insertView(view)
        flag ^= Scheduler.FLAG_INSERT // eslint-disable-line
      }
    }

    if (!flag) {
      return 0
    }

    return view.confirmUpdate(flag, options)
  }

  protected insertView(view: CellView) {
    const viewItem = this.views[view.cell.id]
    if (viewItem) {
      const zIndex = view.cell.getZIndex()
      const pivot = this.addZPivot(zIndex)
      // 先将view(NodeView/EdgeView)的Dom框架内容插入到container
      this.container.insertBefore(view.container, pivot)

      if (!view.cell.isVisible()) {
        this.toggleVisible(view.cell, false)
      }

      viewItem.state = Scheduler.ViewState.MOUNTED
      this.graph.trigger('view:mounted', { view })
    }
  }

  protected resetViews() {
    this.willRemoveViews = { ...this.views, ...this.willRemoveViews }
    Object.values(this.willRemoveViews).forEach((viewItem) => {
      if (viewItem) {
        this.removeView(viewItem.view)
      }
    })
    this.views = {}
    this.willRemoveViews = {}
  }

  protected removeView(view: CellView) {
    const cell = view.cell
    const viewItem = this.willRemoveViews[cell.id]
    if (viewItem && view) {
      viewItem.view.remove()
      delete this.willRemoveViews[cell.id]
      this.graph.trigger('view:unmounted', { view })
    }
  }

  protected toggleVisible(cell: Cell, visible: boolean) {
    const edges = this.model.getConnectedEdges(cell)

    for (let i = 0, len = edges.length; i < len; i += 1) {
      const edge = edges[i]
      if (visible) {
        const source = edge.getSourceCell()
        const target = edge.getTargetCell()
        if (
          (source && !source.isVisible()) ||
          (target && !target.isVisible())
        ) {
          continue
        }
        this.toggleVisible(edge, true)
      } else {
        this.toggleVisible(edge, false)
      }
    }

    const viewItem = this.views[cell.id]
    if (viewItem) {
      Dom.css(viewItem.view.container, {
        display: visible ? 'unset' : 'none',
      })
    }
  }

  protected addZPivot(zIndex = 0) {
    if (this.zPivots == null) {
      this.zPivots = {}
    }

    const pivots = this.zPivots
    let pivot = pivots[zIndex]
    if (pivot) {
      return pivot
    }

    pivot = pivots[zIndex] = document.createComment(`z-index:${zIndex + 1}`)
    let neighborZ = -Infinity
    // eslint-disable-next-line
    for (const key in pivots) {
      const currentZ = +key
      if (currentZ < zIndex && currentZ > neighborZ) {
        neighborZ = currentZ
        if (neighborZ === zIndex - 1) {
          continue
        }
      }
    }

    const layer = this.container
    if (neighborZ !== -Infinity) {
      const neighborPivot = pivots[neighborZ]
      layer.insertBefore(pivot, neighborPivot.nextSibling)
    } else {
      layer.insertBefore(pivot, layer.firstChild)
    }
    return pivot
  }

  protected removeZPivots() {
    if (this.zPivots) {
      Object.values(this.zPivots).forEach((elem) => {
        if (elem && elem.parentNode) {
          elem.parentNode.removeChild(elem)
        }
      })
    }
    this.zPivots = {}
  }

  protected createCellView(cell: Cell) {
    const options = { graph: this.graph }

    const createViewHook = this.graph.options.createCellView
    if (createViewHook) {
      const ret = FunctionExt.call(createViewHook, this.graph, cell)
      if (ret) {
        return new ret(cell, options) // eslint-disable-line new-cap
      }
      if (ret === null) {
        // null means not render
        return null
      }
    }

    const view = cell.view

    if (view != null && typeof view === 'string') {
      const def = CellView.registry.get(view)
      if (def) {
        return new def(cell, options) // eslint-disable-line new-cap
      }
      return CellView.registry.onNotFound(view)
    }

    if (cell.isNode()) {
      return new NodeView(cell, options)
    }

    if (cell.isEdge()) {
      return new EdgeView(cell, options)
    }

    return null
  }

  protected getEffectedEdges(view: CellView) {
    const effectedEdges: { id: string; view: CellView; flag: number }[] = []
    const cell = view.cell
    const edges = this.model.getConnectedEdges(cell)

    for (let i = 0, n = edges.length; i < n; i += 1) {
      const edge = edges[i]
      const viewItem = this.views[edge.id]

      if (!viewItem) {
        continue
      }

      const edgeView = viewItem.view
      if (!this.isViewMounted(edgeView)) {
        continue
      }

      const flagLabels: FlagManager.Action[] = ['update']
      if (edge.getTargetCell() === cell) {
        flagLabels.push('target')
      }
      if (edge.getSourceCell() === cell) {
        flagLabels.push('source')
      }
      effectedEdges.push({
        id: edge.id,
        view: edgeView,
        flag: edgeView.getFlag(flagLabels),
      })
    }

    return effectedEdges
  }

  protected isUpdatable(view: CellView) {
    if (view.isNodeView()) {
      if (this.renderArea) {
        return this.renderArea.isIntersectWithRect(view.cell.getBBox())
      }
      return true
    }

    if (view.isEdgeView()) {
      const edge = view.cell
      const sourceCell = edge.getSourceCell()
      const targetCell = edge.getTargetCell()
      if (this.renderArea && sourceCell && targetCell) {
        return (
          this.renderArea.isIntersectWithRect(sourceCell.getBBox()) ||
          this.renderArea.isIntersectWithRect(targetCell.getBBox())
        )
      }
    }

    return true
  }

  protected getRenderPriority(view: CellView) {
    return view.cell.isNode()
      ? JOB_PRIORITY.RenderNode
      : JOB_PRIORITY.RenderEdge
  }

  @Disposable.dispose()
  dispose() {
    this.stopListening()
    // clear views
    Object.keys(this.views).forEach((id) => {
      this.views[id].view.dispose()
    })
    this.views = {}
  }
}
export namespace Scheduler {
  export const FLAG_INSERT = 1 << 30
  export const FLAG_REMOVE = 1 << 29
  export const FLAG_RENDER = (1 << 26) - 1
}

export namespace Scheduler {
  export enum ViewState {
    CREATED,
    MOUNTED,
    WAITING,
  }
  export interface View {
    view: CellView
    flag: number
    options: any
    state: ViewState
  }

  export interface EventArgs {
    'view:mounted': { view: CellView }
    'view:unmounted': { view: CellView }
    'render:done': null
  }
}

import {
  Rectangle,
  Point,
  ModifierKey,
  FunctionExt,
  Dom,
  KeyValue,
  Cell,
  Node,
  Edge,
  Model,
  Collection,
  View,
  CellView,
  Graph,
} from '@antv/x6'

export class SelectionImpl extends View<SelectionImpl.EventArgs> {
  public readonly options: SelectionImpl.Options
  protected readonly collection: Collection
  protected selectionContainer: HTMLElement
  protected selectionContent: HTMLElement
  protected boxCount: number
  protected boxesUpdated: boolean
  private stopSelectionBoxMouseDownEventTimer?: NodeJS.Timeout

  public get graph() {
    return this.options.graph
  }

  protected get boxClassName() {
    return this.prefixClassName(Private.classNames.box)
  }

  protected get $boxes() {
    return Dom.children(this.container, this.boxClassName)
  }

  protected get handleOptions() {
    return this.options
  }

  constructor(options: SelectionImpl.Options) {
    super()
    this.options = options

    if (this.options.model) {
      this.options.collection = this.options.model.collection
    }

    if (this.options.collection) {
      this.collection = this.options.collection
    } else {
      this.collection = new Collection([], {
        comparator: Private.depthComparator,
      })
      this.options.collection = this.collection
    }

    this.boxCount = 0

    this.createContainer()
    this.startListening()
  }

  protected startListening() {
    const graph = this.graph
    const collection = this.collection

    this.delegateEvents(
      {
        [`mousedown .${this.boxClassName}`]: 'onSelectionBoxMouseDown',
        [`touchstart .${this.boxClassName}`]: 'onSelectionBoxMouseDown',
      },
      true,
    )

    graph.on('scale', this.onGraphTransformed, this)
    graph.on('translate', this.onGraphTransformed, this)
    graph.model.on('updated', this.onModelUpdated, this)

    collection.on('added', this.onCellAdded, this)
    collection.on('removed', this.onCellRemoved, this)
    collection.on('reseted', this.onReseted, this)
    collection.on('updated', this.onCollectionUpdated, this)
    collection.on('node:change:position', this.onNodePositionChanged, this)
    collection.on('cell:changed', this.onCellChanged, this)
  }

  protected stopListening() {
    const graph = this.graph
    const collection = this.collection

    this.undelegateEvents()

    graph.off('scale', this.onGraphTransformed, this)
    graph.off('translate', this.onGraphTransformed, this)
    graph.model.off('updated', this.onModelUpdated, this)

    collection.off('added', this.onCellAdded, this)
    collection.off('removed', this.onCellRemoved, this)
    collection.off('reseted', this.onReseted, this)
    collection.off('updated', this.onCollectionUpdated, this)
    collection.off('node:change:position', this.onNodePositionChanged, this)
    collection.off('cell:changed', this.onCellChanged, this)
  }

  protected onRemove() {
    this.stopListening()
  }

  protected onGraphTransformed() {
    this.updateSelectionBoxes()
  }

  protected onCellChanged() {
    this.updateSelectionBoxes()
  }

  protected translating: boolean

  protected onNodePositionChanged({
    node,
    options,
  }: Collection.EventArgs['node:change:position']) {
    const { showNodeSelectionBox, pointerEvents } = this.options
    const { ui, selection, translateBy, snapped } = options

    const allowTranslating =
      (showNodeSelectionBox !== true ||
        (pointerEvents &&
          this.getPointerEventsValue(pointerEvents) === 'none')) &&
      !this.translating &&
      !selection

    const translateByUi = ui && translateBy && node.id === translateBy

    if (allowTranslating && (translateByUi || snapped)) {
      this.translating = true
      const current = node.position()
      const previous = node.previous('position')!
      const dx = current.x - previous.x
      const dy = current.y - previous.y

      if (dx !== 0 || dy !== 0) {
        this.translateSelectedNodes(dx, dy, node, options)
      }
      this.translating = false
    }
  }

  protected onModelUpdated({ removed }: Collection.EventArgs['updated']) {
    if (removed && removed.length) {
      this.unselect(removed)
    }
  }

  isEmpty() {
    return this.length <= 0
  }

  isSelected(cell: Cell | string) {
    return this.collection.has(cell)
  }

  get length() {
    return this.collection.length
  }

  get cells() {
    return this.collection.toArray()
  }

  select(cells: Cell | Cell[], options: SelectionImpl.AddOptions = {}) {
    options.dryrun = true
    const items = this.filter(Array.isArray(cells) ? cells : [cells])
    this.collection.add(items, options)
    return this
  }

  unselect(cells: Cell | Cell[], options: SelectionImpl.RemoveOptions = {}) {
    // dryrun to prevent cell be removed from graph
    options.dryrun = true
    this.collection.remove(Array.isArray(cells) ? cells : [cells], options)
    return this
  }

  reset(cells?: Cell | Cell[], options: SelectionImpl.SetOptions = {}) {
    if (cells) {
      if (options.batch) {
        const filterCells = this.filter(Array.isArray(cells) ? cells : [cells])
        this.collection.reset(filterCells, { ...options, ui: true })
        return this
      }

      const prev = this.cells
      const next = this.filter(Array.isArray(cells) ? cells : [cells])
      const prevMap: KeyValue<Cell> = {}
      const nextMap: KeyValue<Cell> = {}
      prev.forEach((cell) => (prevMap[cell.id] = cell))
      next.forEach((cell) => (nextMap[cell.id] = cell))
      const added: Cell[] = []
      const removed: Cell[] = []
      next.forEach((cell) => {
        if (!prevMap[cell.id]) {
          added.push(cell)
        }
      })
      prev.forEach((cell) => {
        if (!nextMap[cell.id]) {
          removed.push(cell)
        }
      })

      if (removed.length) {
        this.unselect(removed, { ...options, ui: true })
      }

      if (added.length) {
        this.select(added, { ...options, ui: true })
      }

      if (removed.length === 0 && added.length === 0) {
        this.updateContainer()
      }

      return this
    }

    return this.clean(options)
  }

  clean(options: SelectionImpl.SetOptions = {}) {
    if (this.length) {
      if (options.batch === false) {
        this.unselect(this.cells, options)
      } else {
        this.collection.reset([], { ...options, ui: true })
      }
    }
    return this
  }

  setFilter(filter?: SelectionImpl.Filter) {
    this.options.filter = filter
  }

  setContent(content?: SelectionImpl.Content) {
    this.options.content = content
  }

  startSelecting(evt: Dom.MouseDownEvent) {
    // Flow: startSelecting => adjustSelection => stopSelecting

    evt = this.normalizeEvent(evt) // eslint-disable-line
    this.clean()
    let x
    let y
    const graphContainer = this.graph.container
    if (
      evt.offsetX != null &&
      evt.offsetY != null &&
      graphContainer.contains(evt.target)
    ) {
      x = evt.offsetX
      y = evt.offsetY
    } else {
      const offset = Dom.offset(graphContainer)
      const scrollLeft = graphContainer.scrollLeft
      const scrollTop = graphContainer.scrollTop
      x = evt.clientX - offset.left + window.pageXOffset + scrollLeft
      y = evt.clientY - offset.top + window.pageYOffset + scrollTop
    }

    Dom.css(this.container, {
      top: y,
      left: x,
      width: 1,
      height: 1,
    })

    this.setEventData<EventData.Selecting>(evt, {
      action: 'selecting',
      clientX: evt.clientX,
      clientY: evt.clientY,
      offsetX: x,
      offsetY: y,
      scrollerX: 0,
      scrollerY: 0,
      moving: false,
    })

    // this.delegateDocumentEvents(Private.documentEvents, evt.data)
    this.addEventListeners(
      this.graph.container,
      Private.documentEvents,
      evt.data,
    )
  }

  filter(cells: Cell[]) {
    const filter = this.options.filter

    return cells.filter((cell) => {
      if (Array.isArray(filter)) {
        return filter.some((item) => {
          if (typeof item === 'string') {
            return cell.shape === item
          }
          return cell.id === item.id
        })
      }
      if (typeof filter === 'function') {
        return FunctionExt.call(filter, this.graph, cell)
      }

      return true
    })
  }

  protected stopSelecting(evt: Dom.MouseUpEvent) {
    const graph = this.graph
    const eventData = this.getEventData<EventData.Common>(evt)
    const action = eventData.action
    switch (action) {
      case 'selecting': {
        let width = Dom.width(this.container)
        let height = Dom.height(this.container)
        const offset = Dom.offset(this.container)
        const origin = graph.pageToLocal(offset.left, offset.top)
        const scale = graph.transform.getScale()
        width /= scale.sx
        height /= scale.sy
        const rect = new Rectangle(origin.x, origin.y, width, height)
        const cells = this.getCellViewsInArea(rect).map((view) => view.cell)
        this.reset(cells, { batch: true })
        this.hideRubberband()
        break
      }

      case 'translating': {
        if (evt.clientX == null || evt.clientY == null) break
        const client = graph.snapToGrid(evt.clientX, evt.clientY)
        if (!this.options.following) {
          const data = eventData as EventData.Translating
          this.updateSelectedNodesPosition({
            dx: data.clientX - data.originX,
            dy: data.clientY - data.originY,
          })
        }
        this.graph.model.stopBatch('move-selection')
        this.notifyBoxEvent('box:mouseup', evt, client.x, client.y)
        break
      }

      default: {
        this.clean()
        break
      }
    }
  }

  protected onMouseUp(evt: Dom.MouseUpEvent) {
    const action = this.getEventData<EventData.Common>(evt).action
    if (action) {
      this.stopSelecting(evt)
      // this.undelegateDocumentEvents()
      this.removeEventListeners(this.graph.container)
    }
  }

  protected onSelectionBoxMouseDown(evt: Dom.MouseDownEvent) {
    if (!this.options.following) {
      evt.stopPropagation()
    }
    if (this.stopSelectionBoxMouseDownEventTimer) {
      return
    }

    const e = this.normalizeEvent(evt)

    if (this.options.movable) {
      this.startTranslating(e)
    }

    const activeView = this.getCellViewFromElem(e.target)!
    this.setEventData<EventData.SelectionBox>(e, { activeView })
    const client = this.graph.snapToGrid(e.clientX, e.clientY)
    this.notifyBoxEvent('box:mousedown', e, client.x, client.y)
    // this.delegateDocumentEvents(Private.documentEvents, e.data)
    this.addEventListeners(this.graph.container, Private.documentEvents, e.data)
  }

  protected startTranslating(evt: Dom.MouseDownEvent) {
    this.graph.model.startBatch('move-selection')
    const client = this.graph.snapToGrid(evt.clientX, evt.clientY)
    this.setEventData<EventData.Translating>(evt, {
      action: 'translating',
      clientX: client.x,
      clientY: client.y,
      originX: client.x,
      originY: client.y,
    })
  }

  private getRestrictArea(): Rectangle.RectangleLike | null {
    const restrict = this.graph.options.translating.restrict
    const area =
      typeof restrict === 'function'
        ? FunctionExt.call(restrict, this.graph, null)
        : restrict

    if (typeof area === 'number') {
      return this.graph.transform.getGraphArea().inflate(area)
    }

    if (area === true) {
      return this.graph.transform.getGraphArea()
    }

    return area || null
  }

  protected getSelectionOffset(client: Point, data: EventData.Translating) {
    let dx = client.x - data.clientX
    let dy = client.y - data.clientY
    const restrict = this.getRestrictArea()
    if (restrict) {
      const cells = this.collection.toArray()
      const totalBBox =
        Cell.getCellsBBox(cells, { deep: true }) || Rectangle.create()
      const minDx = restrict.x - totalBBox.x
      const minDy = restrict.y - totalBBox.y
      const maxDx =
        restrict.x + restrict.width - (totalBBox.x + totalBBox.width)
      const maxDy =
        restrict.y + restrict.height - (totalBBox.y + totalBBox.height)

      if (dx < minDx) {
        dx = minDx
      }
      if (dy < minDy) {
        dy = minDy
      }
      if (maxDx < dx) {
        dx = maxDx
      }
      if (maxDy < dy) {
        dy = maxDy
      }

      if (!this.options.following) {
        const offsetX = client.x - data.originX
        const offsetY = client.y - data.originY
        dx = offsetX <= minDx || offsetX >= maxDx ? 0 : dx
        dy = offsetY <= minDy || offsetY >= maxDy ? 0 : dy
      }
    }

    return {
      dx,
      dy,
    }
  }

  private updateElementPosition(elem: Element, dLeft: number, dTop: number) {
    const strLeft = Dom.css(elem, 'left')
    const strTop = Dom.css(elem, 'top')
    const left = strLeft ? parseFloat(strLeft) : 0
    const top = strTop ? parseFloat(strTop) : 0

    Dom.css(elem, 'left', left + dLeft)
    Dom.css(elem, 'top', top + dTop)
  }

  protected updateSelectedNodesPosition(offset: { dx: number; dy: number }) {
    const { dx, dy } = offset
    if (dx || dy) {
      if ((this.translateSelectedNodes(dx, dy), this.boxesUpdated)) {
        if (this.collection.length > 1) {
          this.updateSelectionBoxes()
        }
      } else {
        const scale = this.graph.transform.getScale()
        for (
          let i = 0, $boxes = this.$boxes, len = $boxes.length;
          i < len;
          i += 1
        ) {
          this.updateElementPosition($boxes[i], dx * scale.sx, dy * scale.sy)
        }
        this.updateElementPosition(
          this.selectionContainer,
          dx * scale.sx,
          dy * scale.sy,
        )
      }
    }
  }

  protected autoScrollGraph(x: number, y: number) {
    const scroller = this.graph.getPlugin<any>('scroller')
    if (scroller) {
      return scroller.autoScroll(x, y)
    }
    return { scrollerX: 0, scrollerY: 0 }
  }

  protected adjustSelection(evt: Dom.MouseMoveEvent | Dom.TouchMoveEvent) {
    // 过滤双指触摸事件，避免跟其它插件冲突，这是单指框选方法，不需要双指事件的
    if (evt.touches?.length && evt.touches?.length >= 2) {
      return
    }
    const e = this.normalizeEvent(evt)
    if (e.clientX == null || e.clientY == null) {
      return
    }
    const eventData = this.getEventData<EventData.Common>(e)
    const action = eventData.action
    switch (action) {
      case 'selecting': {
        const data = eventData as EventData.Selecting
        if (data.moving !== true) {
          Dom.appendTo(this.container, this.graph.container)
          this.showRubberband()
          data.moving = true
        }

        const { scrollerX, scrollerY } = this.autoScrollGraph(
          e.clientX,
          e.clientY,
        )
        data.scrollerX += scrollerX
        data.scrollerY += scrollerY

        const dx = e.clientX - data.clientX + data.scrollerX
        const dy = e.clientY - data.clientY + data.scrollerY

        const left = parseInt(Dom.css(this.container, 'left') || '0', 10)
        const top = parseInt(Dom.css(this.container, 'top') || '0', 10)
        Dom.css(this.container, {
          left: dx < 0 ? data.offsetX + dx : left,
          top: dy < 0 ? data.offsetY + dy : top,
          width: Math.abs(dx),
          height: Math.abs(dy),
        })
        break
      }

      case 'translating': {
        const client = this.graph.snapToGrid(e.clientX, e.clientY)
        const data = eventData as EventData.Translating
        const offset = this.getSelectionOffset(client, data)
        if (this.options.following) {
          this.updateSelectedNodesPosition(offset)
        } else {
          this.updateContainerPosition(offset)
        }
        if (offset.dx) {
          data.clientX = client.x
        }
        if (offset.dy) {
          data.clientY = client.y
        }
        this.notifyBoxEvent('box:mousemove', evt, client.x, client.y)
        break
      }

      default:
        break
    }

    this.boxesUpdated = false
  }

  protected translateSelectedNodes(
    dx: number,
    dy: number,
    exclude?: Cell,
    otherOptions?: KeyValue,
  ) {
    const map: { [id: string]: boolean } = {}
    const excluded: Cell[] = []

    if (exclude) {
      map[exclude.id] = true
    }

    this.collection.toArray().forEach((cell) => {
      cell.getDescendants({ deep: true }).forEach((child) => {
        map[child.id] = true
      })
    })
    if (otherOptions && otherOptions.translateBy) {
      const currentCell = this.graph.getCellById(otherOptions.translateBy)
      if (currentCell) {
        map[currentCell.id] = true
        currentCell.getDescendants({ deep: true }).forEach((child) => {
          map[child.id] = true
        })
        excluded.push(currentCell)
      }
    }

    this.collection.toArray().forEach((cell) => {
      if (!map[cell.id]) {
        const options = {
          ...otherOptions,
          selection: this.cid,
          exclude: excluded,
        }
        cell.translate(dx, dy, options)
        this.graph.model.getConnectedEdges(cell).forEach((edge) => {
          if (!map[edge.id]) {
            edge.translate(dx, dy, options)
            map[edge.id] = true
          }
        })
      }
    })
  }

  protected getCellViewsInArea(rect: Rectangle) {
    const graph = this.graph
    const options = {
      strict: this.options.strict,
    }
    let views: CellView[] = []

    if (this.options.rubberNode) {
      views = views.concat(
        graph.model
          .getNodesInArea(rect, options)
          .map((node) => graph.renderer.findViewByCell(node))
          .filter((view) => view != null) as CellView[],
      )
    }

    if (this.options.rubberEdge) {
      views = views.concat(
        graph.model
          .getEdgesInArea(rect, options)
          .map((edge) => graph.renderer.findViewByCell(edge))
          .filter((view) => view != null) as CellView[],
      )
    }

    return views
  }

  protected notifyBoxEvent<
    K extends keyof SelectionImpl.BoxEventArgs,
    T extends Dom.EventObject,
  >(name: K, e: T, x: number, y: number) {
    const data = this.getEventData<EventData.SelectionBox>(e)
    const view = data.activeView
    this.trigger(name, { e, view, x, y, cell: view.cell })
  }

  protected getSelectedClassName(cell: Cell) {
    return this.prefixClassName(`${cell.isNode() ? 'node' : 'edge'}-selected`)
  }

  protected addCellSelectedClassName(cell: Cell) {
    const view = this.graph.renderer.findViewByCell(cell)
    if (view) {
      view.addClass(this.getSelectedClassName(cell))
    }
  }

  protected removeCellUnSelectedClassName(cell: Cell) {
    const view = this.graph.renderer.findViewByCell(cell)
    if (view) {
      view.removeClass(this.getSelectedClassName(cell))
    }
  }

  protected destroySelectionBox(cell: Cell) {
    this.removeCellUnSelectedClassName(cell)

    if (this.canShowSelectionBox(cell)) {
      Dom.remove(this.container.querySelector(`[data-cell-id="${cell.id}"]`))
      if (this.$boxes.length === 0) {
        this.hide()
      }
      this.boxCount = Math.max(0, this.boxCount - 1)
    }
  }

  protected destroyAllSelectionBoxes(cells: Cell[]) {
    cells.forEach((cell) => this.removeCellUnSelectedClassName(cell))

    this.hide()
    Dom.remove(this.$boxes)
    this.boxCount = 0
  }

  hide() {
    Dom.removeClass(
      this.container,
      this.prefixClassName(Private.classNames.rubberband),
    )
    Dom.removeClass(
      this.container,
      this.prefixClassName(Private.classNames.selected),
    )
  }

  protected showRubberband() {
    Dom.addClass(
      this.container,
      this.prefixClassName(Private.classNames.rubberband),
    )
  }

  protected hideRubberband() {
    Dom.removeClass(
      this.container,
      this.prefixClassName(Private.classNames.rubberband),
    )
  }

  protected showSelected() {
    Dom.removeAttribute(this.container, 'style')
    Dom.addClass(
      this.container,
      this.prefixClassName(Private.classNames.selected),
    )
  }

  protected createContainer() {
    this.container = document.createElement('div')
    Dom.addClass(this.container, this.prefixClassName(Private.classNames.root))
    if (this.options.className) {
      Dom.addClass(this.container, this.options.className)
    }

    this.selectionContainer = document.createElement('div')
    Dom.addClass(
      this.selectionContainer,
      this.prefixClassName(Private.classNames.inner),
    )

    this.selectionContent = document.createElement('div')
    Dom.addClass(
      this.selectionContent,
      this.prefixClassName(Private.classNames.content),
    )

    Dom.append(this.selectionContainer, this.selectionContent)
    Dom.attr(
      this.selectionContainer,
      'data-selection-length',
      this.collection.length,
    )

    Dom.prepend(this.container, this.selectionContainer)
  }

  protected updateContainerPosition(offset: { dx: number; dy: number }) {
    if (offset.dx || offset.dy) {
      this.updateElementPosition(this.selectionContainer, offset.dx, offset.dy)
    }
  }

  protected updateContainer() {
    const origin = { x: Infinity, y: Infinity }
    const corner = { x: 0, y: 0 }
    const cells = this.collection
      .toArray()
      .filter((cell) => this.canShowSelectionBox(cell))

    cells.forEach((cell) => {
      const view = this.graph.renderer.findViewByCell(cell)
      if (view) {
        const bbox = view.getBBox({
          useCellGeometry: true,
        })
        origin.x = Math.min(origin.x, bbox.x)
        origin.y = Math.min(origin.y, bbox.y)
        corner.x = Math.max(corner.x, bbox.x + bbox.width)
        corner.y = Math.max(corner.y, bbox.y + bbox.height)
      }
    })

    Dom.css(this.selectionContainer, {
      position: 'absolute',
      pointerEvents: 'none',
      left: origin.x,
      top: origin.y,
      width: corner.x - origin.x,
      height: corner.y - origin.y,
    })
    Dom.attr(
      this.selectionContainer,
      'data-selection-length',
      this.collection.length,
    )

    const boxContent = this.options.content
    if (boxContent) {
      if (typeof boxContent === 'function') {
        const content = FunctionExt.call(
          boxContent,
          this.graph,
          this,
          this.selectionContent,
        )
        if (content) {
          this.selectionContent.innerHTML = content
        }
      } else {
        this.selectionContent.innerHTML = boxContent
      }
    }

    if (this.collection.length > 0 && !this.container.parentNode) {
      Dom.appendTo(this.container, this.graph.container)
    } else if (this.collection.length <= 0 && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }
  }

  protected canShowSelectionBox(cell: Cell) {
    return (
      (cell.isNode() && this.options.showNodeSelectionBox === true) ||
      (cell.isEdge() && this.options.showEdgeSelectionBox === true)
    )
  }

  protected getPointerEventsValue(
    pointerEvents: 'none' | 'auto' | ((cells: Cell[]) => 'none' | 'auto'),
  ) {
    return typeof pointerEvents === 'string'
      ? pointerEvents
      : pointerEvents(this.cells)
  }

  protected createSelectionBox(cell: Cell) {
    this.addCellSelectedClassName(cell)

    if (this.canShowSelectionBox(cell)) {
      const view = this.graph.renderer.findViewByCell(cell)
      if (view) {
        // 因为移动端的触摸事件触发频率太高了，导致新创建的矩形一渲染就被触发了触摸按下的事件，所以需要加冷却
        if (this.stopSelectionBoxMouseDownEventTimer) {
          clearTimeout(this.stopSelectionBoxMouseDownEventTimer)
        }
        this.stopSelectionBoxMouseDownEventTimer = setTimeout(() => {
          this.stopSelectionBoxMouseDownEventTimer = undefined
        }, 250)
        const className = this.boxClassName
        const box = document.createElement('div')
        Dom.addClass(box, className)
        Dom.addClass(box, `${className}-${cell.isNode() ? 'node' : 'edge'}`)
        Dom.attr(box, 'data-cell-id', cell.id)
        this.updateBoxPosition(box, cell)
        Dom.appendTo(box, this.container)
        this.showSelected()
        this.boxCount += 1
      }
    }
  }

  protected updateBoxPosition(box: Element, cell: Cell) {
    const view = this.graph.renderer.findViewByCell(cell)
    if (view) {
      const bbox = view.getBBox({
        useCellGeometry: true,
      })
      const pointerEvents = this.options.pointerEvents
      Dom.css(box, {
        position: 'absolute',
        left: bbox.x,
        top: bbox.y,
        width: bbox.width,
        height: bbox.height,
        pointerEvents: pointerEvents
          ? this.getPointerEventsValue(pointerEvents)
          : 'auto',
      })
    }
  }

  protected updateSelectionBoxes() {
    if (this.collection.length > 0) {
      this.boxesUpdated = true
      this.confirmUpdate()
      // this.graph.renderer.requestViewUpdate(this as any, 1, options)
    }
  }

  confirmUpdate() {
    if (this.boxCount) {
      for (
        let i = 0, $boxes = this.$boxes, len = $boxes.length;
        i < len;
        i += 1
      ) {
        const box = $boxes[i]
        const cellId = Dom.attr(box, 'data-cell-id')
        const cell = this.collection.get(cellId)

        if (cell) this.updateBoxPosition(box, cell)
      }

      this.updateContainer()
    }
    return 0
  }

  protected getCellViewFromElem(elem: Element) {
    const id = elem.getAttribute('data-cell-id')
    if (id) {
      const cell = this.collection.get(id)
      if (cell) {
        return this.graph.renderer.findViewByCell(cell)
      }
    }
    return null
  }

  protected onCellRemoved({ cell }: Collection.EventArgs['removed']) {
    this.destroySelectionBox(cell)
    this.updateContainer()
  }

  protected onReseted({ previous, current }: Collection.EventArgs['reseted']) {
    this.destroyAllSelectionBoxes(previous)
    current.forEach((cell) => {
      this.listenCellRemoveEvent(cell)
      this.createSelectionBox(cell)
    })
    this.updateContainer()
  }

  protected onCellAdded({ cell }: Collection.EventArgs['added']) {
    // The collection do not known the cell was removed when cell was
    // removed by interaction(such as, by "delete" shortcut), so we should
    // manually listen to cell's remove event.
    this.listenCellRemoveEvent(cell)
    this.createSelectionBox(cell)
    this.updateContainer()
  }

  protected listenCellRemoveEvent(cell: Cell) {
    cell.off('removed', this.onCellRemoved, this)
    cell.on('removed', this.onCellRemoved, this)
  }

  protected onCollectionUpdated({
    added,
    removed,
    options,
  }: Collection.EventArgs['updated']) {
    added.forEach((cell) => {
      this.trigger('cell:selected', { cell, options })
      if (cell.isNode()) {
        this.trigger('node:selected', { cell, options, node: cell })
      } else if (cell.isEdge()) {
        this.trigger('edge:selected', { cell, options, edge: cell })
      }
    })

    removed.forEach((cell) => {
      this.trigger('cell:unselected', { cell, options })
      if (cell.isNode()) {
        this.trigger('node:unselected', { cell, options, node: cell })
      } else if (cell.isEdge()) {
        this.trigger('edge:unselected', { cell, options, edge: cell })
      }
    })

    const args = {
      added,
      removed,
      options,
      selected: this.cells.filter((cell) => !!this.graph.getCellById(cell.id)),
    }
    this.trigger('selection:changed', args)
  }

  // #endregion

  @View.dispose()
  dispose() {
    this.clean()
    this.remove()
    this.off()
  }
}

export namespace SelectionImpl {
  type SelectionEventType = 'leftMouseDown' | 'mouseWheelDown'

  export interface CommonOptions {
    model?: Model
    collection?: Collection
    className?: string
    strict?: boolean
    filter?: Filter
    modifiers?: string | ModifierKey[] | null
    multiple?: boolean
    multipleSelectionModifiers?: string | ModifierKey[] | null

    selectCellOnMoved?: boolean
    selectNodeOnMoved?: boolean
    selectEdgeOnMoved?: boolean

    showEdgeSelectionBox?: boolean
    showNodeSelectionBox?: boolean
    movable?: boolean
    following?: boolean
    content?: Content

    // Can select node or edge when rubberband
    rubberband?: boolean
    rubberNode?: boolean
    rubberEdge?: boolean

    // Whether to respond event on the selectionBox
    pointerEvents?: 'none' | 'auto' | ((cells: Cell[]) => 'none' | 'auto')

    // with which mouse button the selection can be started
    eventTypes?: SelectionEventType[]
  }

  export interface Options extends CommonOptions {
    graph: Graph
  }

  export type Content =
    | null
    | false
    | string
    | ((
        this: Graph,
        selection: SelectionImpl,
        contentElement: HTMLElement,
      ) => string)

  export type Filter =
    | null
    | (string | { id: string })[]
    | ((this: Graph, cell: Cell) => boolean)

  export interface SetOptions extends Collection.SetOptions {
    batch?: boolean
  }

  export interface AddOptions extends Collection.AddOptions {}

  export interface RemoveOptions extends Collection.RemoveOptions {}
}

export namespace SelectionImpl {
  interface SelectionBoxEventArgs<T> {
    e: T
    view: CellView
    cell: Cell
    x: number
    y: number
  }

  export interface BoxEventArgs {
    'box:mousedown': SelectionBoxEventArgs<Dom.MouseDownEvent>
    'box:mousemove': SelectionBoxEventArgs<Dom.MouseMoveEvent>
    'box:mouseup': SelectionBoxEventArgs<Dom.MouseUpEvent>
  }

  export interface SelectionEventArgs {
    'cell:selected': { cell: Cell; options: Model.SetOptions }
    'node:selected': { cell: Cell; node: Node; options: Model.SetOptions }
    'edge:selected': { cell: Cell; edge: Edge; options: Model.SetOptions }
    'cell:unselected': { cell: Cell; options: Model.SetOptions }
    'node:unselected': { cell: Cell; node: Node; options: Model.SetOptions }
    'edge:unselected': { cell: Cell; edge: Edge; options: Model.SetOptions }
    'selection:changed': {
      added: Cell[]
      removed: Cell[]
      selected: Cell[]
      options: Model.SetOptions
    }
  }

  export interface EventArgs extends BoxEventArgs, SelectionEventArgs {}
}

// private
// -------
namespace Private {
  const base = 'widget-selection'

  export const classNames = {
    root: base,
    inner: `${base}-inner`,
    box: `${base}-box`,
    content: `${base}-content`,
    rubberband: `${base}-rubberband`,
    selected: `${base}-selected`,
  }

  export const documentEvents = {
    mousemove: 'adjustSelection',
    touchmove: 'adjustSelection',
    mouseup: 'onMouseUp',
    touchend: 'onMouseUp',
    touchcancel: 'onMouseUp',
  }

  export function depthComparator(cell: Cell) {
    return cell.getAncestors().length
  }
}

namespace EventData {
  export interface Common {
    action: 'selecting' | 'translating'
  }

  export interface Selecting extends Common {
    action: 'selecting'
    moving?: boolean
    clientX: number
    clientY: number
    offsetX: number
    offsetY: number
    scrollerX: number
    scrollerY: number
  }

  export interface Translating extends Common {
    action: 'translating'
    clientX: number
    clientY: number
    originX: number
    originY: number
  }

  export interface SelectionBox {
    activeView: CellView
  }

  export interface Rotation {
    rotated?: boolean
    center: Point.PointLike
    start: number
    angles: { [id: string]: number }
  }

  export interface Resizing {
    resized?: boolean
    bbox: Rectangle
    cells: Cell[]
    minWidth: number
    minHeight: number
  }
}

import {
  Platform,
  NumberExt,
  ObjectExt,
  Dom,
  FunctionExt,
  Point,
  Rectangle,
  Cell,
  View,
  Graph,
  GraphView,
  EventArgs,
  TransformManager,
  BackgroundManager,
  Util,
} from '@antv/x6'

export class ScrollerImpl extends View<ScrollerImpl.EventArgs> {
  private readonly content: HTMLDivElement
  protected pageBreak: HTMLDivElement | null
  public readonly options: ScrollerImpl.Options
  public readonly container: HTMLDivElement
  public readonly background: HTMLDivElement
  public readonly backgroundManager: ScrollerImpl.Background

  public get graph() {
    return this.options.graph
  }

  private get model() {
    return this.graph.model
  }

  protected sx: number
  protected sy: number
  protected clientX: number
  protected clientY: number
  protected padding = { left: 0, top: 0, right: 0, bottom: 0 }
  protected cachedScrollLeft: number | null
  protected cachedScrollTop: number | null
  protected cachedCenterPoint: Point.PointLike | null
  protected cachedClientSize: { width: number; height: number } | null
  protected delegatedHandlers: { [name: string]: (...args: any) => any }

  constructor(options: ScrollerImpl.Options) {
    super()

    this.options = ScrollerImpl.getOptions(options)
    this.onUpdate = FunctionExt.debounce(this.onUpdate, 200)

    const scale = this.graph.transform.getScale()
    this.sx = scale.sx
    this.sy = scale.sy

    const width = this.options.width || this.graph.options.width
    const height = this.options.height || this.graph.options.height
    this.container = document.createElement('div')
    Dom.addClass(
      this.container,
      this.prefixClassName(ScrollerImpl.containerClass),
    )
    Dom.css(this.container, { width, height })

    if (this.options.pageVisible) {
      Dom.addClass(
        this.container,
        this.prefixClassName(ScrollerImpl.pagedClass),
      )
    }

    if (this.options.className) {
      Dom.addClass(this.container, this.options.className)
    }

    const graphContainer = this.graph.container

    if (graphContainer.parentNode) {
      Dom.before(graphContainer, this.container)
    }

    this.content = document.createElement('div')
    Dom.addClass(this.content, this.prefixClassName(ScrollerImpl.contentClass))
    Dom.css(this.content, {
      width: this.graph.options.width,
      height: this.graph.options.height,
    })

    // custom background
    this.background = document.createElement('div')
    Dom.addClass(
      this.background,
      this.prefixClassName(ScrollerImpl.backgroundClass),
    )
    Dom.append(this.content, this.background)

    if (!this.options.pageVisible) {
      Dom.append(this.content, this.graph.view.grid)
    }
    Dom.append(this.content, graphContainer)
    Dom.appendTo(this.content, this.container)

    this.backgroundManager = new ScrollerImpl.Background(this)
  }

  init() {
    if (!this.options.pageVisible) {
      this.graph.grid.update()
    }
    if (!this.options.autoResize) {
      this.update()
    }
    this.startListening()
  }

  protected startListening() {
    const graph = this.graph
    const model = this.model

    graph.on('scale', this.onScale, this)
    graph.on('resize', this.onResize, this)
    graph.on('before:print', this.storeScrollPosition, this)
    graph.on('before:export', this.storeScrollPosition, this)
    graph.on('after:print', this.restoreScrollPosition, this)
    graph.on('after:export', this.restoreScrollPosition, this)

    model.on('reseted', this.onUpdate, this)
    model.on('cell:added', this.onUpdate, this)
    model.on('cell:removed', this.onUpdate, this)
    model.on('cell:changed', this.onUpdate, this)

    this.delegateBackgroundEvents()
  }

  protected stopListening() {
    const graph = this.graph
    const model = this.model

    graph.off('scale', this.onScale, this)
    graph.off('resize', this.onResize, this)
    graph.off('beforeprint', this.storeScrollPosition, this)
    graph.off('beforeexport', this.storeScrollPosition, this)
    graph.off('afterprint', this.restoreScrollPosition, this)
    graph.off('afterexport', this.restoreScrollPosition, this)

    model.off('reseted', this.onUpdate, this)
    model.off('cell:added', this.onUpdate, this)
    model.off('cell:removed', this.onUpdate, this)
    model.off('cell:changed', this.onUpdate, this)

    this.undelegateBackgroundEvents()
  }

  public enableAutoResize() {
    this.options.autoResize = true
  }

  public disableAutoResize() {
    this.options.autoResize = false
  }

  protected onUpdate() {
    if (this.options.autoResize) {
      this.update()
    }
  }

  protected delegateBackgroundEvents(events?: View.Events) {
    const evts = events || GraphView.events
    this.delegatedHandlers = Object.keys(evts).reduce<{
      [name: string]: (...args: any) => any
    }>((memo, name) => {
      const handler = evts[name]
      if (name.indexOf(' ') === -1) {
        if (typeof handler === 'function') {
          memo[name] = handler as (...args: any) => any
        } else {
          let method = this.graph.view[handler as keyof GraphView]
          if (typeof method === 'function') {
            method = method.bind(this.graph.view)
            memo[name] = method as (...args: any) => any
          }
        }
      }
      return memo
    }, {})

    this.onBackgroundEvent = this.onBackgroundEvent.bind(this)
    Object.keys(this.delegatedHandlers).forEach((name) => {
      this.delegateEvent(
        name,
        {
          guarded: false,
        },
        this.onBackgroundEvent,
      )
    })
  }

  protected undelegateBackgroundEvents() {
    Object.keys(this.delegatedHandlers).forEach((name) => {
      this.undelegateEvent(name, this.onBackgroundEvent)
    })
  }

  protected onBackgroundEvent(e: Dom.EventObject) {
    let valid = false
    const target = e.target

    if (!this.options.pageVisible) {
      const view = this.graph.view
      valid = view.background === target || view.grid === target
    } else if (this.options.background) {
      valid = this.background === target
    } else {
      valid = this.content === target
    }

    if (valid) {
      const handler = this.delegatedHandlers[e.type]
      if (typeof handler === 'function') {
        handler.apply(this.graph, arguments) // eslint-disable-line
      }
    }
  }

  protected onResize() {
    if (this.cachedCenterPoint) {
      this.centerPoint(this.cachedCenterPoint.x, this.cachedCenterPoint.y)
      this.updatePageBreak()
    }
  }

  protected onScale({ sx, sy, ox, oy }: EventArgs['scale']) {
    this.updateScale(sx, sy)

    if (ox || oy) {
      this.centerPoint(ox, oy)
      this.updatePageBreak()
    }

    const autoResizeOptions = this.options.autoResizeOptions

    if (typeof autoResizeOptions === 'function') {
      this.update()
    }
  }

  protected storeScrollPosition() {
    this.cachedScrollLeft = this.container.scrollLeft
    this.cachedScrollTop = this.container.scrollTop
  }

  protected restoreScrollPosition() {
    this.container.scrollLeft = this.cachedScrollLeft!
    this.container.scrollTop = this.cachedScrollTop!
    this.cachedScrollLeft = null
    this.cachedScrollTop = null
  }

  protected storeClientSize() {
    this.cachedClientSize = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    }
  }

  protected restoreClientSize() {
    this.cachedClientSize = null
  }

  protected beforeManipulation() {
    if (Platform.IS_IE || Platform.IS_EDGE) {
      Dom.css(this.container, { visibility: 'hidden' })
    }
  }

  protected afterManipulation() {
    if (Platform.IS_IE || Platform.IS_EDGE) {
      Dom.css(this.container, { visibility: 'visible' })
    }
  }

  public updatePageSize(width?: number, height?: number) {
    if (width != null) {
      this.options.pageWidth = width
    }

    if (height != null) {
      this.options.pageHeight = height
    }

    this.updatePageBreak()
  }

  protected updatePageBreak() {
    if (this.pageBreak && this.pageBreak.parentNode) {
      this.pageBreak.parentNode.removeChild(this.pageBreak)
    }

    this.pageBreak = null

    if (this.options.pageVisible && this.options.pageBreak) {
      const graphWidth = this.graph.options.width
      const graphHeight = this.graph.options.height
      const pageWidth = this.options.pageWidth! * this.sx
      const pageHeight = this.options.pageHeight! * this.sy

      if (pageWidth === 0 || pageHeight === 0) {
        return
      }

      if (graphWidth > pageWidth || graphHeight > pageHeight) {
        let hasPageBreak = false
        const container = document.createElement('div')

        for (let i = 1, l = Math.floor(graphWidth / pageWidth); i < l; i += 1) {
          const div = document.createElement('div')
          Dom.addClass(div, this.prefixClassName(`graph-pagebreak-vertical`))
          Dom.css(div, { left: i * pageWidth })
          Dom.appendTo(div, container)
          hasPageBreak = true
        }

        for (
          let i = 1, l = Math.floor(graphHeight / pageHeight);
          i < l;
          i += 1
        ) {
          const div = document.createElement('div')
          Dom.addClass(div, this.prefixClassName(`graph-pagebreak-horizontal`))
          Dom.css(div, { top: i * pageHeight })
          Dom.appendTo(div, container)
          hasPageBreak = true
        }

        if (hasPageBreak) {
          Dom.addClass(container, this.prefixClassName('graph-pagebreak'))
          Dom.after(this.graph.view.grid, container)
          this.pageBreak = container
        }
      }
    }
  }

  update() {
    const size = this.getClientSize()
    this.cachedCenterPoint = this.clientToLocalPoint(
      size.width / 2,
      size.height / 2,
    )

    let resizeOptions = this.options.autoResizeOptions
    if (typeof resizeOptions === 'function') {
      resizeOptions = FunctionExt.call(resizeOptions, this, this)
    }

    const options: TransformManager.FitToContentFullOptions = {
      gridWidth: this.options.pageWidth,
      gridHeight: this.options.pageHeight,
      allowNewOrigin: 'negative',
      ...resizeOptions,
    }

    this.graph.fitToContent(this.getFitToContentOptions(options))
  }

  protected getFitToContentOptions(
    options: TransformManager.FitToContentFullOptions,
  ) {
    const sx = this.sx
    const sy = this.sy

    options.gridWidth && (options.gridWidth *= sx)
    options.gridHeight && (options.gridHeight *= sy)
    options.minWidth && (options.minWidth *= sx)
    options.minHeight && (options.minHeight *= sy)

    if (typeof options.padding === 'object') {
      options.padding = {
        left: (options.padding.left || 0) * sx,
        right: (options.padding.right || 0) * sx,
        top: (options.padding.top || 0) * sy,
        bottom: (options.padding.bottom || 0) * sy,
      }
    } else if (typeof options.padding === 'number') {
      options.padding *= sx
    }

    if (!this.options.autoResize) {
      options.contentArea = Rectangle.create()
    }

    return options
  }

  protected updateScale(sx: number, sy: number) {
    const options = this.graph.options

    const dx = sx / this.sx
    const dy = sy / this.sy

    this.sx = sx
    this.sy = sy

    this.graph.translate(options.x * dx, options.y * dy)
    this.graph.transform.resize(options.width * dx, options.height * dy)
  }

  scrollbarPosition(): { left: number; top: number }
  scrollbarPosition(left?: number, top?: number): this
  scrollbarPosition(left?: number, top?: number) {
    if (left == null && top == null) {
      return {
        left: this.container.scrollLeft,
        top: this.container.scrollTop,
      }
    }

    const prop: { [key: string]: number } = {}
    if (typeof left === 'number') {
      prop.scrollLeft = left
    }

    if (typeof top === 'number') {
      prop.scrollTop = top
    }

    Dom.prop(this.container, prop)

    return this
  }

  /**
   * Try to scroll to ensure that the position (x,y) on the graph (in local
   * coordinates) is at the center of the viewport. If only one of the
   * coordinates is specified, only scroll in the specified dimension and
   * keep the other coordinate unchanged.
   */
  scrollToPoint(x: number | null | undefined, y: number | null | undefined) {
    const size = this.getClientSize()
    const ctm = this.graph.matrix()
    const prop: { [key: string]: number } = {}

    if (typeof x === 'number') {
      prop.scrollLeft = x - size.width / 2 + ctm.e + (this.padding.left || 0)
    }

    if (typeof y === 'number') {
      prop.scrollTop = y - size.height / 2 + ctm.f + (this.padding.top || 0)
    }

    Dom.prop(this.container, prop)

    return this
  }

  /**
   * Try to scroll to ensure that the center of graph content is at the
   * center of the viewport.
   */
  scrollToContent() {
    const sx = this.sx
    const sy = this.sy
    const center = this.graph.getContentArea().getCenter()
    return this.scrollToPoint(center.x * sx, center.y * sy)
  }

  /**
   * Try to scroll to ensure that the center of cell is at the center of
   * the viewport.
   */
  scrollToCell(cell: Cell) {
    const sx = this.sx
    const sy = this.sy
    const center = cell.getBBox().getCenter()
    return this.scrollToPoint(center.x * sx, center.y * sy)
  }

  /**
   * The center methods are more aggressive than the scroll methods. These
   * methods position the graph so that a specific point on the graph lies
   * at the center of the viewport, adding paddings around the paper if
   * necessary (e.g. if the requested point lies in a corner of the paper).
   * This means that the requested point will always move into the center
   * of the viewport. (Use the scroll functions to avoid adding paddings
   * and only scroll the viewport as far as the graph boundary.)
   */

  /**
   * Position the center of graph to the center of the viewport.
   */
  center(options?: ScrollerImpl.CenterOptions) {
    return this.centerPoint(options)
  }

  /**
   * Position the point (x,y) on the graph (in local coordinates) to the
   * center of the viewport. If only one of the coordinates is specified,
   * only center along the specified dimension and keep the other coordinate
   * unchanged.
   */
  centerPoint(
    x: number,
    y: null | number,
    options?: ScrollerImpl.CenterOptions,
  ): this
  centerPoint(
    x: null | number,
    y: number,
    options?: ScrollerImpl.CenterOptions,
  ): this
  centerPoint(options?: ScrollerImpl.CenterOptions): this
  centerPoint(
    x?: number | null | ScrollerImpl.CenterOptions,
    y?: number | null,
    options?: ScrollerImpl.CenterOptions,
  ) {
    const ctm = this.graph.matrix()
    const sx = ctm.a
    const sy = ctm.d
    const tx = -ctm.e
    const ty = -ctm.f
    const tWidth = tx + this.graph.options.width
    const tHeight = ty + this.graph.options.height

    let localOptions: ScrollerImpl.CenterOptions | null | undefined

    this.storeClientSize() // avoid multilple reflow

    if (typeof x === 'number' || typeof y === 'number') {
      localOptions = options
      const visibleCenter = this.getVisibleArea().getCenter()
      if (typeof x === 'number') {
        x *= sx // eslint-disable-line
      } else {
        x = visibleCenter.x // eslint-disable-line
      }

      if (typeof y === 'number') {
        y *= sy // eslint-disable-line
      } else {
        y = visibleCenter.y // eslint-disable-line
      }
    } else {
      localOptions = x
      x = (tx + tWidth) / 2 // eslint-disable-line
      y = (ty + tHeight) / 2 // eslint-disable-line
    }

    if (localOptions && localOptions.padding) {
      return this.positionPoint({ x, y }, '50%', '50%', localOptions)
    }

    const padding = this.getPadding()
    const clientSize = this.getClientSize()
    const cx = clientSize.width / 2
    const cy = clientSize.height / 2
    const left = cx - padding.left - x + tx
    const right = cx - padding.right + x - tWidth
    const top = cy - padding.top - y + ty
    const bottom = cy - padding.bottom + y - tHeight

    this.addPadding(
      Math.max(left, 0),
      Math.max(right, 0),
      Math.max(top, 0),
      Math.max(bottom, 0),
    )

    const result = this.scrollToPoint(x, y)

    this.restoreClientSize()

    return result
  }

  centerContent(options?: ScrollerImpl.PositionContentOptions) {
    return this.positionContent('center', options)
  }

  centerCell(cell: Cell, options?: ScrollerImpl.CenterOptions) {
    return this.positionCell(cell, 'center', options)
  }

  /**
   * The position methods are a more general version of the center methods.
   * They position the graph so that a specific point on the graph lies at
   * requested coordinates inside the viewport.
   */

  /**
   *
   */
  positionContent(
    pos: ScrollerImpl.Direction,
    options?: ScrollerImpl.PositionContentOptions,
  ) {
    const rect = this.graph.getContentArea(options)
    return this.positionRect(rect, pos, options)
  }

  positionCell(
    cell: Cell,
    pos: ScrollerImpl.Direction,
    options?: ScrollerImpl.CenterOptions,
  ) {
    const bbox = cell.getBBox()
    return this.positionRect(bbox, pos, options)
  }

  positionRect(
    rect: Rectangle.RectangleLike,
    pos: ScrollerImpl.Direction,
    options?: ScrollerImpl.CenterOptions,
  ) {
    const bbox = Rectangle.create(rect)
    switch (pos) {
      case 'center':
        return this.positionPoint(bbox.getCenter(), '50%', '50%', options)
      case 'top':
        return this.positionPoint(bbox.getTopCenter(), '50%', 0, options)
      case 'top-right':
        return this.positionPoint(bbox.getTopRight(), '100%', 0, options)
      case 'right':
        return this.positionPoint(bbox.getRightMiddle(), '100%', '50%', options)
      case 'bottom-right':
        return this.positionPoint(
          bbox.getBottomRight(),
          '100%',
          '100%',
          options,
        )
      case 'bottom':
        return this.positionPoint(
          bbox.getBottomCenter(),
          '50%',
          '100%',
          options,
        )
      case 'bottom-left':
        return this.positionPoint(bbox.getBottomLeft(), 0, '100%', options)
      case 'left':
        return this.positionPoint(bbox.getLeftMiddle(), 0, '50%', options)
      case 'top-left':
        return this.positionPoint(bbox.getTopLeft(), 0, 0, options)
      default:
        return this
    }
  }

  positionPoint(
    point: Point.PointLike,
    x: number | string,
    y: number | string,
    options: ScrollerImpl.CenterOptions = {},
  ) {
    const { padding: pad, ...localOptions } = options
    const padding = NumberExt.normalizeSides(pad)
    const clientRect = Rectangle.fromSize(this.getClientSize())
    const targetRect = clientRect.clone().moveAndExpand({
      x: padding.left,
      y: padding.top,
      width: -padding.right - padding.left,
      height: -padding.top - padding.bottom,
    })

    // eslint-disable-next-line
    x = NumberExt.normalizePercentage(x, Math.max(0, targetRect.width))
    if (x < 0) {
      x = targetRect.width + x // eslint-disable-line
    }

    // eslint-disable-next-line
    y = NumberExt.normalizePercentage(y, Math.max(0, targetRect.height))
    if (y < 0) {
      y = targetRect.height + y // eslint-disable-line
    }

    const origin = targetRect.getTopLeft().translate(x, y)
    const diff = clientRect.getCenter().diff(origin)
    const scale = this.zoom()
    const rawDiff = diff.scale(1 / scale, 1 / scale)
    const result = Point.create(point).translate(rawDiff)
    return this.centerPoint(result.x, result.y, localOptions)
  }

  zoom(): number
  zoom(factor: number, options?: TransformManager.ZoomOptions): this
  zoom(factor?: number, options?: TransformManager.ZoomOptions) {
    if (factor == null) {
      return this.sx
    }

    options = options || {} // eslint-disable-line

    let cx
    let cy
    const clientSize = this.getClientSize()
    const center = this.clientToLocalPoint(
      clientSize.width / 2,
      clientSize.height / 2,
    )

    let sx = factor
    let sy = factor

    if (!options.absolute) {
      sx += this.sx
      sy += this.sy
    }

    if (options.scaleGrid) {
      sx = Math.round(sx / options.scaleGrid) * options.scaleGrid
      sy = Math.round(sy / options.scaleGrid) * options.scaleGrid
    }

    if (options.maxScale) {
      sx = Math.min(options.maxScale, sx)
      sy = Math.min(options.maxScale, sy)
    }

    if (options.minScale) {
      sx = Math.max(options.minScale, sx)
      sy = Math.max(options.minScale, sy)
    }

    sx = this.graph.transform.clampScale(sx)
    sy = this.graph.transform.clampScale(sy)

    if (options.center) {
      const fx = sx / this.sx
      const fy = sy / this.sy
      cx = options.center.x - (options.center.x - center.x) / fx
      cy = options.center.y - (options.center.y - center.y) / fy
    } else {
      cx = center.x
      cy = center.y
    }

    this.beforeManipulation()
    this.graph.transform.scale(sx, sy)
    this.centerPoint(cx, cy)
    this.afterManipulation()

    return this
  }

  zoomToRect(
    rect: Rectangle.RectangleLike,
    options: TransformManager.ScaleContentToFitOptions = {},
  ) {
    const area = Rectangle.create(rect)
    const graph = this.graph

    options.contentArea = area
    if (options.viewportArea == null) {
      const bound = this.container.getBoundingClientRect()
      options.viewportArea = {
        x: graph.options.x,
        y: graph.options.y,
        width: bound.width,
        height: bound.height,
      }
    }

    this.beforeManipulation()
    graph.transform.scaleContentToFitImpl(options, false)
    const center = area.getCenter()
    this.centerPoint(center.x, center.y)
    this.afterManipulation()

    return this
  }

  zoomToFit(
    options: TransformManager.GetContentAreaOptions &
      TransformManager.ScaleContentToFitOptions = {},
  ) {
    return this.zoomToRect(this.graph.getContentArea(options), options)
  }

  transitionToPoint(
    p: Point.PointLike,
    options?: ScrollerImpl.TransitionOptions,
  ): this
  transitionToPoint(
    x: number,
    y: number,
    options?: ScrollerImpl.TransitionOptions,
  ): this
  transitionToPoint(
    x: number | Point.PointLike,
    y?: number | ScrollerImpl.TransitionOptions,
    options?: ScrollerImpl.TransitionOptions,
  ) {
    if (typeof x === 'object') {
      options = y as ScrollerImpl.TransitionOptions // eslint-disable-line
      y = x.y // eslint-disable-line
      x = x.x // eslint-disable-line
    } else {
      y = y as number // eslint-disable-line
    }

    if (options == null) {
      options = {} // eslint-disable-line
    }

    let transform
    let transformOrigin
    const scale = this.sx
    const targetScale = Math.max(options.scale || scale, 0.000001)
    const clientSize = this.getClientSize()
    const targetPoint = new Point(x, y)
    const localPoint = this.clientToLocalPoint(
      clientSize.width / 2,
      clientSize.height / 2,
    )

    if (scale === targetScale) {
      const translate = localPoint.diff(targetPoint).scale(scale, scale).round()
      transform = `translate(${translate.x}px,${translate.y}px)`
    } else {
      const delta =
        (targetScale / (scale - targetScale)) * targetPoint.distance(localPoint)
      const range = localPoint.clone().move(targetPoint, delta)
      const origin = this.localToBackgroundPoint(range).round()
      transform = `scale(${targetScale / scale})`
      transformOrigin = `${origin.x}px ${origin.y}px`
    }

    const onTransitionEnd = options.onTransitionEnd
    Dom.addClass(this.container, ScrollerImpl.transitionClassName)
    Dom.Event.off(this.content, ScrollerImpl.transitionEventName)
    Dom.Event.on(this.content, ScrollerImpl.transitionEventName, (e) => {
      this.syncTransition(targetScale, { x: x as number, y: y as number })
      if (typeof onTransitionEnd === 'function') {
        FunctionExt.call(
          onTransitionEnd,
          this,
          e.originalEvent as TransitionEvent,
        )
      }
    })
    Dom.css(this.content, {
      transform,
      transformOrigin,
      transition: 'transform',
      transitionDuration: options.duration || '1s',
      transitionDelay: options.delay,
      transitionTimingFunction: options.timing,
    } as Record<string, string>)

    return this
  }

  protected syncTransition(scale: number, p: Point.PointLike) {
    this.beforeManipulation()
    this.graph.scale(scale)
    this.removeTransition()
    this.centerPoint(p.x, p.y)
    this.afterManipulation()
    return this
  }

  protected removeTransition() {
    Dom.removeClass(this.container, ScrollerImpl.transitionClassName)
    Dom.Event.off(this.content, ScrollerImpl.transitionEventName)
    Dom.css(this.content, {
      transform: '',
      transformOrigin: '',
      transition: '',
      transitionDuration: '',
      transitionDelay: '',
      transitionTimingFunction: '',
    })
    return this
  }

  transitionToRect(
    rectangle: Rectangle.RectangleLike,
    options: ScrollerImpl.TransitionToRectOptions = {},
  ) {
    const rect = Rectangle.create(rectangle)
    const maxScale = options.maxScale || Infinity
    const minScale = options.minScale || Number.MIN_VALUE
    const scaleGrid = options.scaleGrid || null
    const PIXEL_SIZE = options.visibility || 1
    const center = options.center
      ? Point.create(options.center)
      : rect.getCenter()
    const clientSize = this.getClientSize()
    const w = clientSize.width * PIXEL_SIZE
    const h = clientSize.height * PIXEL_SIZE
    let scale = new Rectangle(
      center.x - w / 2,
      center.y - h / 2,
      w,
      h,
    ).getMaxUniformScaleToFit(rect, center)

    scale = Math.min(scale, maxScale)
    if (scaleGrid) {
      scale = Math.floor(scale / scaleGrid) * scaleGrid
    }
    scale = Math.max(minScale, scale)

    return this.transitionToPoint(center, {
      scale,
      ...options,
    })
  }

  startPanning(evt: Dom.MouseDownEvent) {
    const e = this.normalizeEvent(evt)
    this.clientX = e.clientX
    this.clientY = e.clientY
    this.trigger('pan:start', { e })
    Dom.Event.on(document.body, {
      'mousemove.panning touchmove.panning': this.pan.bind(this),
      'mouseup.panning touchend.panning': this.stopPanning.bind(this),
      'mouseleave.panning': this.stopPanning.bind(this),
    })
    Dom.Event.on(window as any, 'mouseup.panning', this.stopPanning.bind(this))
  }

  pan(evt: Dom.MouseMoveEvent) {
    const e = this.normalizeEvent(evt)
    const dx = e.clientX - this.clientX
    const dy = e.clientY - this.clientY
    this.container.scrollTop -= dy
    this.container.scrollLeft -= dx
    this.clientX = e.clientX
    this.clientY = e.clientY
    this.trigger('panning', { e })
  }

  stopPanning(e: Dom.MouseUpEvent) {
    Dom.Event.off(document.body, '.panning')
    Dom.Event.off(window as any, '.panning')
    this.trigger('pan:stop', { e })
  }

  clientToLocalPoint(p: Point.PointLike): Point
  clientToLocalPoint(x: number, y: number): Point
  clientToLocalPoint(a: number | Point.PointLike, b?: number) {
    let x = typeof a === 'object' ? a.x : a
    let y = typeof a === 'object' ? a.y : (b as number)

    const ctm = this.graph.matrix()

    x += this.container.scrollLeft - this.padding.left - ctm.e
    y += this.container.scrollTop - this.padding.top - ctm.f

    return new Point(x / ctm.a, y / ctm.d)
  }

  localToBackgroundPoint(p: Point.PointLike): Point
  localToBackgroundPoint(x: number, y: number): Point
  localToBackgroundPoint(x: number | Point.PointLike, y?: number) {
    const p = typeof x === 'object' ? Point.create(x) : new Point(x, y)
    const ctm = this.graph.matrix()
    const padding = this.padding
    return Util.transformPoint(p, ctm).translate(padding.left, padding.top)
  }

  resize(width?: number, height?: number) {
    let w = width != null ? width : this.container.offsetWidth
    let h = height != null ? height : this.container.offsetHeight

    if (typeof w === 'number') {
      w = Math.round(w)
    }
    if (typeof h === 'number') {
      h = Math.round(h)
    }

    this.options.width = w
    this.options.height = h
    Dom.css(this.container, { width: w, height: h })
    this.update()
  }

  getClientSize() {
    if (this.cachedClientSize) {
      return this.cachedClientSize
    }
    return {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    }
  }

  autoScroll(clientX: number, clientY: number) {
    const buffer = 10
    const container = this.container
    const rect = container.getBoundingClientRect()

    let dx = 0
    let dy = 0
    if (clientX <= rect.left + buffer) {
      dx = -buffer
    }

    if (clientY <= rect.top + buffer) {
      dy = -buffer
    }

    if (clientX >= rect.right - buffer) {
      dx = buffer
    }

    if (clientY >= rect.bottom - buffer) {
      dy = buffer
    }

    if (dx !== 0) {
      container.scrollLeft += dx
    }

    if (dy !== 0) {
      container.scrollTop += dy
    }

    return {
      scrollerX: dx,
      scrollerY: dy,
    }
  }

  protected addPadding(
    left?: number,
    right?: number,
    top?: number,
    bottom?: number,
  ) {
    let padding = this.getPadding()
    this.padding = {
      left: Math.round(padding.left + (left || 0)),
      top: Math.round(padding.top + (top || 0)),
      bottom: Math.round(padding.bottom + (bottom || 0)),
      right: Math.round(padding.right + (right || 0)),
    }

    padding = this.padding

    Dom.css(this.content, {
      width: padding.left + this.graph.options.width + padding.right,
      height: padding.top + this.graph.options.height + padding.bottom,
    })

    const container = this.graph.container
    container.style.left = `${this.padding.left}px`
    container.style.top = `${this.padding.top}px`

    return this
  }

  protected getPadding() {
    const padding = this.options.padding
    if (typeof padding === 'function') {
      return NumberExt.normalizeSides(FunctionExt.call(padding, this, this))
    }

    return NumberExt.normalizeSides(padding)
  }

  /**
   * Returns the untransformed size and origin of the current viewport.
   */
  getVisibleArea() {
    const ctm = this.graph.matrix()
    const size = this.getClientSize()
    const box = {
      x: this.container.scrollLeft || 0,
      y: this.container.scrollTop || 0,
      width: size.width,
      height: size.height,
    }
    const area = Util.transformRectangle(box, ctm.inverse())
    area.x -= (this.padding.left || 0) / this.sx
    area.y -= (this.padding.top || 0) / this.sy
    return area
  }

  isCellVisible(cell: Cell, options: { strict?: boolean } = {}) {
    const bbox = cell.getBBox()
    const area = this.getVisibleArea()
    return options.strict
      ? area.containsRect(bbox)
      : area.isIntersectWithRect(bbox)
  }

  isPointVisible(point: Point.PointLike) {
    return this.getVisibleArea().containsPoint(point)
  }

  /**
   * Lock the current viewport by disabling user scrolling.
   */
  lock() {
    Dom.css(this.container, { overflow: 'hidden' })
    return this
  }

  /**
   * Enable user scrolling if previously locked.
   */
  unlock() {
    Dom.css(this.container, { overflow: 'scroll' })
    return this
  }

  protected onRemove() {
    this.stopListening()
  }

  @View.dispose()
  dispose() {
    Dom.before(this.container, this.graph.container)
    this.remove()
  }
}

export namespace ScrollerImpl {
  export interface EventArgs {
    'pan:start': { e: Dom.MouseDownEvent }
    panning: { e: Dom.MouseMoveEvent }
    'pan:stop': { e: Dom.MouseUpEvent }
  }
  export interface Options {
    graph: Graph
    enabled?: boolean
    className?: string
    width?: number
    height?: number
    pageWidth?: number
    pageHeight?: number
    pageVisible?: boolean
    pageBreak?: boolean
    minVisibleWidth?: number
    minVisibleHeight?: number
    background?: false | BackgroundManager.Options
    autoResize?: boolean
    padding?:
      | NumberExt.SideOptions
      | ((this: ScrollerImpl, scroller: ScrollerImpl) => NumberExt.SideOptions)
    autoResizeOptions?:
      | TransformManager.FitToContentFullOptions
      | ((
          this: ScrollerImpl,
          scroller: ScrollerImpl,
        ) => TransformManager.FitToContentFullOptions)
  }
  export interface CenterOptions {
    padding?: NumberExt.SideOptions
  }

  export type PositionContentOptions = TransformManager.GetContentAreaOptions &
    ScrollerImpl.CenterOptions

  export type Direction =
    | 'center'
    | 'top'
    | 'top-right'
    | 'top-left'
    | 'right'
    | 'bottom-right'
    | 'bottom'
    | 'bottom-left'
    | 'left'

  export interface TransitionOptions {
    /**
     * The zoom level to reach at the end of the transition.
     */
    scale?: number
    duration?: string
    delay?: string
    timing?: string
    onTransitionEnd?: (this: ScrollerImpl, e: TransitionEvent) => void
  }

  export interface TransitionToRectOptions extends TransitionOptions {
    minScale?: number
    maxScale?: number
    scaleGrid?: number
    visibility?: number
    center?: Point.PointLike
  }

  export type AutoResizeDirection = 'top' | 'right' | 'bottom' | 'left'
}

export namespace ScrollerImpl {
  export class Background extends BackgroundManager {
    protected readonly scroller: ScrollerImpl

    protected get elem() {
      return this.scroller.background
    }

    constructor(scroller: ScrollerImpl) {
      super(scroller.graph)

      this.scroller = scroller
      if (scroller.options.background) {
        this.draw(scroller.options.background)
      }
    }

    protected init() {
      this.graph.on('scale', this.update, this)
      this.graph.on('translate', this.update, this)
    }

    protected updateBackgroundOptions(options?: BackgroundManager.Options) {
      this.scroller.options.background = options
    }
  }
}

export namespace ScrollerImpl {
  export const containerClass = 'graph-scroller'
  export const panningClass = `${containerClass}-panning`
  export const pannableClass = `${containerClass}-pannable`
  export const pagedClass = `${containerClass}-paged`
  export const contentClass = `${containerClass}-content`
  export const backgroundClass = `${containerClass}-background`
  export const transitionClassName = 'transition-in-progress'
  export const transitionEventName = 'transitionend.graph-scroller-transition'

  export const defaultOptions: Partial<ScrollerImpl.Options> = {
    padding() {
      const size = this.getClientSize()
      const minWidth = Math.max(this.options.minVisibleWidth || 0, 1) || 1
      const minHeight = Math.max(this.options.minVisibleHeight || 0, 1) || 1
      const left = Math.max(size.width - minWidth, 0)
      const top = Math.max(size.height - minHeight, 0)
      return { left, top, right: left, bottom: top }
    },
    minVisibleWidth: 50,
    minVisibleHeight: 50,
    pageVisible: false,
    pageBreak: false,
    autoResize: true,
  }

  export function getOptions(options: ScrollerImpl.Options) {
    const result = ObjectExt.merge({}, defaultOptions, options)

    if (result.pageWidth == null) {
      result.pageWidth = options.graph.options.width
    }
    if (result.pageHeight == null) {
      result.pageHeight = options.graph.options.height
    }

    const graphOptions = options.graph.options
    if (
      graphOptions.background &&
      result.enabled &&
      result.background == null
    ) {
      result.background = graphOptions.background
      options.graph.background.clear()
    }

    return result as ScrollerImpl.Options
  }
}

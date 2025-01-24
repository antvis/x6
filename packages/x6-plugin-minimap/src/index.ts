import { FunctionExt, CssLoader, Dom, View, Graph, EventArgs } from '../../x6/src/index'
import { content } from './style/raw'

export class MiniMap extends View implements Graph.Plugin {
  public name = 'minimap'
  private graph: Graph
  public readonly options: MiniMap.Options
  public container: HTMLDivElement
  protected zoomHandle: HTMLDivElement
  protected viewport: HTMLElement
  protected sourceGraph: Graph
  protected targetGraph: Graph
  protected geometry: Util.ViewGeometry
  protected ratio: number
  // Marks whether targetGraph is being transformed or scaled
  // If yes we update updateViewport only
  private targetGraphTransforming: boolean

  protected get scroller() {
    return this.graph.getPlugin<any>('scroller')
  }

  protected get graphContainer() {
    if (this.scroller) {
      return this.scroller.container
    }
    return this.graph.container
  }

  constructor(options: Partial<MiniMap.Options>) {
    super()

    this.options = {
      ...Util.defaultOptions,
      ...options,
    } as MiniMap.Options

    CssLoader.ensure(this.name, content)
  }

  public init(graph: Graph) {
    this.graph = graph

    this.updateViewport = FunctionExt.debounce(
      this.updateViewport.bind(this),
      0,
    )

    this.container = document.createElement('div')
    Dom.addClass(this.container, this.prefixClassName(ClassName.root))

    const graphContainer = document.createElement('div')
    this.container.appendChild(graphContainer)

    this.viewport = document.createElement('div')
    Dom.addClass(this.viewport, this.prefixClassName(ClassName.viewport))

    if (this.options.scalable) {
      this.zoomHandle = document.createElement('div')
      Dom.addClass(this.zoomHandle, this.prefixClassName(ClassName.zoom))
      Dom.appendTo(this.zoomHandle, this.viewport)
    }

    Dom.append(this.container, this.viewport)
    Dom.css(this.container, {
      width: this.options.width,
      height: this.options.height,
      padding: this.options.padding,
    })

    if (this.options.container) {
      this.options.container.appendChild(this.container)
    }

    this.sourceGraph = this.graph
    const targetGraphOptions: Graph.Options = {
      ...this.options.graphOptions,
      container: graphContainer,
      model: this.sourceGraph.model,
      interacting: false,
      grid: false,
      background: false,
      embedding: false,
    }

    this.targetGraph = this.options.createGraph
      ? this.options.createGraph(targetGraphOptions)
      : new Graph(targetGraphOptions)

    this.updatePaper(
      this.sourceGraph.options.width,
      this.sourceGraph.options.height,
    )

    this.startListening()
  }

  protected startListening() {
    if (this.scroller) {
      Dom.Event.on(
        this.graphContainer,
        `scroll${this.getEventNamespace()}`,
        this.updateViewport,
      )
    } else {
      this.sourceGraph.on('translate', this.onTransform, this)
      this.sourceGraph.on('scale', this.onTransform, this)
      this.sourceGraph.on('model:updated', this.onModelUpdated, this)
    }
    this.sourceGraph.on('resize', this.updatePaper, this)
    // 当前container委托mousedown、touchstart事件到startAction事件;只有小地图容器被点击，才开始在startAction中监听mousemove等拖拽事件
    this.delegateEvents({
      mousedown: 'startAction',
      touchstart: 'startAction',
      [`mousedown .${this.prefixClassName('graph')}`]: 'scrollTo',
      [`touchstart .${this.prefixClassName('graph')}`]: 'scrollTo',
    })
  }

  protected stopListening() {
    if (this.scroller) {
      Dom.Event.off(this.graphContainer, this.getEventNamespace())
    } else {
      this.sourceGraph.off('translate', this.onTransform, this)
      this.sourceGraph.off('scale', this.onTransform, this)
      this.sourceGraph.off('model:updated', this.onModelUpdated, this)
    }
    this.sourceGraph.off('resize', this.updatePaper, this)
    this.undelegateEvents()
  }

  protected onRemove() {
    this.stopListening()
    this.targetGraph.dispose(false)
  }

  protected onTransform(options: { ui: boolean }) {
    if (options.ui || this.targetGraphTransforming || !this.scroller) {
      this.updateViewport()
    }
  }

  protected onModelUpdated() {
    // 模型每次更新，都调用小地图的targetGraph 缩放到合适位置
    this.targetGraph.zoomToFit()
  }

  protected updatePaper(width: number, height: number): this
  protected updatePaper({ width, height }: EventArgs['resize']): this
  protected updatePaper(w: number | EventArgs['resize'], h?: number) {
    // Graph 中指定的是viewPort 视口宽高，contentArea会根据内容撑开
    // MiniMap option中的宽高也是指定的 viewPort 视口宽高
    // 置于为什么contentArea 比viewPortArea小，并且全部显示了；还能拖拽移动，是svg的transform: matrix的作用

    let width: number
    let height: number
    if (typeof w === 'object') {
      width = w.width
      height = w.height
    } else {
      width = w
      height = h as number
    }

    // ratio:宽高比、scale:缩放比

    const origin = this.sourceGraph.options
    const scale = this.sourceGraph.transform.getScale()
    // 小地图的最大宽高 = 宽高 - 2 * padding
    const maxWidth = this.options.width - 2 * this.options.padding
    const maxHeight = this.options.height - 2 * this.options.padding
    // 主视图的实际宽高  = 宽高 / 缩放比
    width /= scale.sx // eslint-disable-line
    height /= scale.sy // eslint-disable-line

    // 小地图宽|高比 = min(小地图viewArea宽/主视图viewArea宽, 小地图viewArea高/主地图viewArea高)
    this.ratio = Math.min(maxWidth / width, maxHeight / height)

    const ratio = this.ratio
    const x = (origin.x * ratio) / scale.sx
    const y = (origin.y * ratio) / scale.sy

    width *= ratio // eslint-disable-line
    height *= ratio // eslint-disable-line
    // 小地图图形实际宽高 = 主视图宽高 * 小地图宽|高比
    this.targetGraph.resize(width, height)
    this.targetGraph.translate(x, y)

    if (this.scroller) {
      // 有Scroller插件，直接使用宽高比作为缩放比
      this.targetGraph.scale(ratio, ratio)
    } else {
      // 没有使用Scroller插件，自适应缩放；并且计算小地图的缩放比
      this.targetGraph.zoomToFit()
    }

    this.updateViewport()
    return this
  }
  // 更新小地图视口的框选区域
  protected updateViewport() {
    

    // 缩放比例
    const sourceGraphScale = this.sourceGraph.transform.getScale()
    const targetGraphScale = this.targetGraph.transform.getScale()

    let origin = null
    if (this.scroller) {
      origin = this.scroller.clientToLocalPoint(0, 0)
    } else {
      origin = this.graph.graphToLocal(0, 0)
    }

    const position = Dom.position(this.targetGraph.container)

    const translation = this.targetGraph.translate()
    translation.ty = translation.ty || 0

 
    // 小地图框选div(整体区域)位置
    this.geometry = {
      // viewPort元素本身的top/left(不变) + 大窗口x.y位置 * 小地图缩放比例 + 小地图matrix矩阵偏移 x.y(不变)
      top: position.top + origin.y * targetGraphScale.sy + translation.ty,
      left: position.left + origin.x * targetGraphScale.sx + translation.tx,
      // 小地图区域宽度 = 大窗口宽度 * 小地图缩放比例 / 大窗口缩放比例
      // 依据公式：小地图区域宽度 / 小地图缩放比例 = 大窗口宽度 / 大窗口缩放比例
      // 小地图缩放比例越小，小地图区域宽度也就越小
      
      // 缩放比 = 视口宽高 / 画布内容区域宽高
      width:
        (this.graphContainer.clientWidth! * targetGraphScale.sx) /
        sourceGraphScale.sx,
      height:
        (this.graphContainer.clientHeight! * targetGraphScale.sy) /
        sourceGraphScale.sy,
    }
    Dom.css(this.viewport, this.geometry)
  }

  protected startAction(evt: Dom.MouseDownEvent) {
    const e = this.normalizeEvent(evt)
    // 缩放还是平移
    const action = e.target === this.zoomHandle ? 'zooming' : 'panning'
    const { tx, ty } = this.sourceGraph.translate()

    const eventData: Util.EventData = {
      action,
      clientX: e.clientX,
      clientY: e.clientY,
      scrollLeft: this.graphContainer.scrollLeft,
      scrollTop: this.graphContainer.scrollTop,
      zoom: this.sourceGraph.zoom(),
      scale: this.sourceGraph.transform.getScale(),
      geometry: this.geometry,
      translateX: tx,
      translateY: ty,
    }
    this.targetGraphTransforming = true
    this.delegateDocumentEvents(Util.documentEvents, eventData)
  }
  // 拖动
  protected doAction(evt: Dom.MouseMoveEvent) {
    const e = this.normalizeEvent(evt)
    const clientX = e.clientX
    const clientY = e.clientY
    const data = e.data as Util.EventData
    switch (data.action) {
      // 平移
      case 'panning': {
        const scale = this.sourceGraph.transform.getScale()
        const targetScale = this.targetGraph.transform.getScale()
    
        // 相对于起始位置偏移了多少px
        const rx = (clientX - data.clientX) * scale.sx
        const ry = (clientY - data.clientY) * scale.sy

        if (this.scroller) {
          this.graphContainer.scrollLeft = data.scrollLeft + rx / this.ratio
          this.graphContainer.scrollTop = data.scrollTop + ry / this.ratio
        } else {
          // this.sourceGraph.translate(
          //   data.translateX - rx / this.ratio,
          //   data.translateY - ry / this.ratio,
          // )

          // 计算每次的偏移距离
          const x = (rx ) / targetScale.sx
          const y = (ry ) / targetScale.sy

          // 现有偏移位置 - 每次偏移距离
          this.sourceGraph.translate(
            data.translateX - x,
            data.translateY - y,
          )
        }
        break
      }
      // 缩放
      case 'zooming': {
        const startScale = data.scale
        const startGeometry = data.geometry
        const delta =
          1 + (data.clientX - clientX) / startGeometry.width / startScale.sx

        if (data.frameId) {
          cancelAnimationFrame(data.frameId)
        }

        data.frameId = requestAnimationFrame(() => {
          this.sourceGraph.zoom(delta * data.zoom, {
            absolute: true,
            minScale: this.options.minScale,
            maxScale: this.options.maxScale,
          })
        })
        break
      }

      default:
        break
    }
  }

  protected stopAction() {
    this.undelegateDocumentEvents()
    this.targetGraphTransforming = false
  }
  // 点击滚动
  protected scrollTo(evt: Dom.MouseDownEvent) {
    const e = this.normalizeEvent(evt)

    let x
    let y

    const ts = this.targetGraph.translate()
    ts.ty = ts.ty || 0

    console.log('scrollTo ts', ts)

    if (e.offsetX == null) {
      const offset = Dom.offset(this.targetGraph.container)
      x = e.pageX - offset.left
      y = e.pageY - offset.top
    } else {
      x = e.offsetX
      y = e.offsetY
    }

    const sourceScale = this.sourceGraph.transform.getScale()
    const targetScale = this.targetGraph.transform.getScale()

    // // const cx = (x - ts.tx) / this.ratio
    // // const cy = (y - ts.ty) / this.ratio

    // const originX =  (x - ts.tx) 
    // const originY = (y - ts.ty)
    // console.log('scrollTo', this.ratio, originX, originY)
    // // 小地图scale缩小，大地图scale被放大， cx就越大；偏移差距也就越大
    // // 小地图scale放大，大地图scale被缩小， cx就越小；偏移差距也就越小
    // const cx = (originX * sourceScale.sx)/ targetScale.sx
    // const cy = (originY * sourceScale.sy)/ targetScale.sy

    // console.log('big position', cx, cy)

    const position = Dom.position(this.viewport)
    const containerPosition = Dom.position(this.targetGraph.container)
    const {width, height} = this.viewport.getBoundingClientRect()
    const start = {
      x: position.left + width/2,
      y: position.top - containerPosition.top + height/2,
    }
    const cx = (x - start.x) * sourceScale.sx / targetScale.sx
    const cy = (y - start.y) * sourceScale.sy / targetScale.sy

    const { tx, ty } = this.sourceGraph.translate()

    this.sourceGraph.translate(tx - cx, ty - cy)




    // this.sourceGraph.centerPoint(cx, cy)
  }

  @View.dispose()
  dispose() {
    this.remove()
    CssLoader.clean(this.name)
  }
}

namespace ClassName {
  export const root = 'widget-minimap'
  export const viewport = `${root}-viewport`
  export const zoom = `${viewport}-zoom`
}
export namespace MiniMap {
  export interface Options {
    container: HTMLElement
    width: number
    height: number
    padding: number
    scalable?: boolean
    minScale?: number
    maxScale?: number
    createGraph?: (options: Graph.Options) => Graph
    graphOptions?: Graph.Options
  }
}

namespace Util {
  export const defaultOptions: Partial<MiniMap.Options> = {
    width: 300,
    height: 200,
    padding: 10,
    scalable: true,
    minScale: 0.01,
    maxScale: 16,
    graphOptions: {},
    createGraph: (options) => new Graph(options),
  }

  export const documentEvents = {
    mousemove: 'doAction',
    touchmove: 'doAction',
    mouseup: 'stopAction',
    touchend: 'stopAction',
  }

  export interface ViewGeometry extends Record<string, number> {
    top: number
    left: number
    width: number
    height: number
  }

  export interface EventData {
    frameId?: number
    action: 'zooming' | 'panning'
    clientX: number
    clientY: number
    scrollLeft: number
    scrollTop: number
    zoom: number
    scale: { sx: number; sy: number }
    geometry: ViewGeometry
    translateX: number
    translateY: number
  }
}

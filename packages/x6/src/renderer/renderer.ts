/* eslint-disable @typescript-eslint/no-unused-vars */
import { Point, Rectangle } from '@antv/x6-geometry'
import { Base } from '../graph/base'
import { Cell } from '../model'
import { Scheduler } from './scheduler'
import { CellView, EdgeView } from '../view'
import { Util } from '../util'

export class Renderer extends Base {
  // 初始化Renderer时，传入graph；再Renderer中的Scheduler调度器中，监听graph的相关事件，注意这里监听的是model的事件（例如添加节点cell:added），然后进行渲染更新
  private readonly schedule: Scheduler = new Scheduler(this.graph)

  requestViewUpdate(view: CellView, flag: number, options: any = {}) {
    this.schedule.requestViewUpdate(view, flag, options)
  }

  isViewMounted(view: CellView) {
    return this.schedule.isViewMounted(view)
  }

  setRenderArea(area?: Rectangle) {
    this.schedule.setRenderArea(area)
  }

  findViewByElem(elem: string | Element | undefined | null) {
    if (elem == null) {
      return null
    }
    const container = this.options.container
    const target =
      typeof elem === 'string'
        ? container.querySelector(elem)
        : elem instanceof Element
        ? elem
        : elem[0]

    if (target) {
      // 通过当前target元素，一直向上查找元素，直到找到拥有data-cell-id属性的元素，获取id值，在schedule中的views中，通过id找到对应的view
      const id = this.graph.view.findAttr('data-cell-id', target)
      if (id) {
        const views = this.schedule.views
        if (views[id]) {
          // 返回view
          return views[id].view
        }
      }
    }

    return null
  }

  findViewByCell(cellId: string | number): CellView | null
  findViewByCell(cell: Cell | null): CellView | null
  findViewByCell(
    cell: Cell | string | number | null | undefined,
  ): CellView | null {
    if (cell == null) {
      return null
    }
    const id = Cell.isCell(cell) ? cell.id : cell
    const views = this.schedule.views
    if (views[id]) {
      return views[id].view
    }

    return null
  }

  findViewsFromPoint(p: Point.PointLike) {
    const ref = { x: p.x, y: p.y }
    return this.model
      .getCells()
      .map((cell) => this.findViewByCell(cell))
      .filter((view) => {
        if (view != null) {
          return Util.getBBox(view.container as SVGElement, {
            target: this.view.stage,
          }).containsPoint(ref)
        }
        return false
      }) as CellView[]
  }

  findEdgeViewsFromPoint(p: Point.PointLike, threshold = 5) {
    return this.model
      .getEdges()
      .map((edge) => this.findViewByCell(edge))
      .filter((view: EdgeView) => {
        if (view != null) {
          const point = view.getClosestPoint(p)
          if (point) {
            return point.distance(p) <= threshold
          }
        }
        return false
      }) as EdgeView[]
  }

  findViewsInArea(
    rect: Rectangle.RectangleLike,
    options: { strict?: boolean; nodeOnly?: boolean } = {},
  ) {
    const area = Rectangle.create(rect)
    return this.model
      .getCells()
      .map((cell) => this.findViewByCell(cell))
      .filter((view) => {
        if (view) {
          if (options.nodeOnly && !view.isNodeView()) {
            return false
          }

          const bbox = Util.getBBox(view.container as SVGElement, {
            target: this.view.stage,
          })
          if (bbox.width === 0) {
            bbox.inflate(1, 0)
          } else if (bbox.height === 0) {
            bbox.inflate(0, 1)
          }
          return options.strict
            ? area.containsRect(bbox)
            : area.isIntersectWithRect(bbox)
        }
        return false
      }) as CellView[]
  }

  @Base.dispose()
  dispose() {
    this.schedule.dispose()
  }
}

export namespace Renderer {
  export interface FindViewsInAreaOptions {
    strict?: boolean
  }
}

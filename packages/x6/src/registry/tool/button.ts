import { Point } from '@antv/x6-geometry'
import { Dom, NumberExt, FunctionExt } from '@antv/x6-common'
import { CellView } from '../../view/cell'
import { NodeView } from '../../view/node'
import { EdgeView } from '../../view/edge'
import { ToolsView } from '../../view/tool'
import * as Util from './util'
import { Cell } from '../../model'

export class Button extends ToolsView.ToolItem<
  EdgeView | NodeView,
  Button.Options
> {
  protected onRender() {
    Dom.addClass(this.container, this.prefixClassName('cell-tool-button'))
    this.update()
  }

  update() {
    this.updatePosition()
    return this
  }

  protected updatePosition() {
    const view = this.cellView
    const matrix = view.cell.isEdge()
      ? this.getEdgeMatrix()
      : this.getNodeMatrix()
    Dom.transform(this.container as SVGElement, matrix, { absolute: true })
  }

  protected getNodeMatrix() {
    const view = this.cellView as NodeView
    const options = this.options

    let { x = 0, y = 0 } = options
    const { offset, useCellGeometry, rotate } = options

    let bbox = Util.getViewBBox(view, useCellGeometry)
    const angle = view.cell.getAngle()
    if (!rotate) {
      bbox = bbox.bbox(angle)
    }

    let offsetX = 0
    let offsetY = 0
    if (typeof offset === 'number') {
      offsetX = offset
      offsetY = offset
    } else if (typeof offset === 'object') {
      offsetX = offset.x
      offsetY = offset.y
    }

    x = NumberExt.normalizePercentage(x, bbox.width)
    y = NumberExt.normalizePercentage(y, bbox.height)

    const origin = this.parent.options.local ? [bbox.width / 2, bbox.height / 2] : [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2];

    let matrix = Dom.createSVGMatrix().translate(origin[0], origin[1])

    if (rotate) {
      matrix = matrix.rotate(angle)
    }

    matrix = matrix.translate(
      x + offsetX - bbox.width / 2,
      y + offsetY - bbox.height / 2,
    )

    return matrix
  }

  protected getEdgeMatrix() {
    const view = this.cellView as EdgeView
    const options = this.options
    const { offset = 0, distance = 0, rotate } = options

    let tangent
    let position
    let angle

    const d = NumberExt.normalizePercentage(distance, 1)
    if (d >= 0 && d <= 1) {
      tangent = view.getTangentAtRatio(d)
    } else {
      tangent = view.getTangentAtLength(d)
    }

    if (tangent) {
      position = tangent.start
      angle = tangent.vector().vectorAngle(new Point(1, 0)) || 0
    } else {
      position = view.getConnection()!.start!
      angle = 0
    }

    let matrix = Dom.createSVGMatrix()
      .translate(position.x, position.y)
      .rotate(angle)

    if (typeof offset === 'object') {
      matrix = matrix.translate(offset.x || 0, offset.y || 0)
    } else {
      matrix = matrix.translate(0, offset)
    }

    if (!rotate) {
      matrix = matrix.rotate(-angle)
    }

    return matrix
  }

  protected onMouseDown(e: Dom.MouseDownEvent) {
    if (this.guard(e)) {
      return
    }

    e.stopPropagation()
    e.preventDefault()

    const onClick = this.options.onClick
    if (typeof onClick === 'function') {
      FunctionExt.call(onClick, this.cellView, {
        e,
        view: this.cellView,
        cell: this.cellView.cell,
        btn: this,
      })
    }
  }
}

export namespace Button {
  export interface Options extends ToolsView.ToolItem.Options {
    x?: number | string
    y?: number | string
    distance?: number | string
    offset?: number | Point.PointLike
    rotate?: boolean
    useCellGeometry?: boolean
    onClick?: (
      this: CellView,
      args: {
        e: Dom.MouseDownEvent
        cell: Cell
        view: CellView
        btn: Button
      },
    ) => any
  }
}

export namespace Button {
  Button.config<Button.Options>({
    name: 'button',
    useCellGeometry: true,
    events: {
      mousedown: 'onMouseDown',
      touchstart: 'onMouseDown',
    },
  })
}

export namespace Button {
  export const Remove = Button.define<Button.Options>({
    name: 'button-remove',
    markup: [
      {
        tagName: 'circle',
        selector: 'button',
        attrs: {
          r: 7,
          fill: '#FF1D00',
          cursor: 'pointer',
        },
      },
      {
        tagName: 'path',
        selector: 'icon',
        attrs: {
          d: 'M -3 -3 3 3 M -3 3 3 -3',
          fill: 'none',
          stroke: '#FFFFFF',
          'stroke-width': 2,
          'pointer-events': 'none',
        },
      },
    ],
    distance: 60,
    offset: 0,
    useCellGeometry: true,
    onClick({ view, btn }) {
      btn.parent.remove()
      view.cell.remove({ ui: true, toolId: btn.cid })
    },
  })
}

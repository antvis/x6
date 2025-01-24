import {
  Point,
  Line,
  Rectangle,
  Polyline,
  Ellipse,
  Path,
} from '../../../x6-geometry/src/index'
import { Dom, PointData, PointLike } from '../../../x6-common/src/index'
import { normalize } from '../registry/marker/util'

export namespace Util {
  export const normalizeMarker = normalize
  /**
   * Transforms point by an SVG transformation represented by `matrix`.
   */
  export function transformPoint(point: Point.PointLike, matrix: DOMMatrix) {
    // 构建一个svg point对象之后，并基于matrix矩阵进行矩阵转换
    const ret = Dom.createSVGPoint(point.x, point.y).matrixTransform(matrix)
    return new Point(ret.x, ret.y)
  }

  /**
   * Transforms line by an SVG transformation represented by `matrix`.
   */
  export function transformLine(line: Line, matrix: DOMMatrix) {
    return new Line(
      transformPoint(line.start, matrix),
      transformPoint(line.end, matrix),
    )
  }

  /**
   * Transforms polyline by an SVG transformation represented by `matrix`.
   */
  export function transformPolyline(polyline: Polyline, matrix: DOMMatrix) {
    let points = polyline instanceof Polyline ? polyline.points : polyline
    if (!Array.isArray(points)) {
      points = []
    }

    return new Polyline(points.map((p) => transformPoint(p, matrix)))
  }

  export function transformRectangle(
    rect: Rectangle.RectangleLike,
    matrix: DOMMatrix,
  ) {
    const svgDocument = Dom.createSvgElement('svg') as SVGSVGElement
    const p = svgDocument.createSVGPoint()

    p.x = rect.x
    p.y = rect.y
    const corner1 = p.matrixTransform(matrix)

    p.x = rect.x + rect.width
    p.y = rect.y
    const corner2 = p.matrixTransform(matrix)

    p.x = rect.x + rect.width
    p.y = rect.y + rect.height
    const corner3 = p.matrixTransform(matrix)

    p.x = rect.x
    p.y = rect.y + rect.height
    const corner4 = p.matrixTransform(matrix)

    const minX = Math.min(corner1.x, corner2.x, corner3.x, corner4.x)
    const maxX = Math.max(corner1.x, corner2.x, corner3.x, corner4.x)
    const minY = Math.min(corner1.y, corner2.y, corner3.y, corner4.y)
    const maxY = Math.max(corner1.y, corner2.y, corner3.y, corner4.y)

    return new Rectangle(minX, minY, maxX - minX, maxY - minY)
  }

  /**
   * Returns the bounding box of the element after transformations are
   * applied. If `withoutTransformations` is `true`, transformations of
   * the element will not be considered when computing the bounding box.
   * If `target` is specified, bounding box will be computed relatively
   * to the `target` element.
   */
  export function bbox(
    elem: SVGElement,
    withoutTransformations?: boolean,
    target?: SVGElement,
  ): Rectangle {
    let box
    const ownerSVGElement = elem.ownerSVGElement

    // If the element is not in the live DOM, it does not have a bounding
    // box defined and so fall back to 'zero' dimension element.
    if (!ownerSVGElement) {
      return new Rectangle(0, 0, 0, 0)
    }

    try {
      box = (elem as SVGGraphicsElement).getBBox()
    } catch (e) {
      // Fallback for IE.
      box = {
        x: elem.clientLeft,
        y: elem.clientTop,
        width: elem.clientWidth,
        height: elem.clientHeight,
      }
    }

    if (withoutTransformations) {
      return Rectangle.create(box)
    }

    const matrix = Dom.getTransformToElement(elem, target || ownerSVGElement)
    return transformRectangle(box, matrix)
  }

  /**
   * Returns the bounding box of the element after transformations are
   * applied. Unlike `bbox()`, this function fixes a browser implementation
   * bug to return the correct bounding box if this elemenent is a group of
   * svg elements (if `options.recursive` is specified).
   */
  export function getBBox(
    elem: SVGElement,
    options: {
      target?: SVGElement | null
      recursive?: boolean
    } = {},
  ): Rectangle {
    let outputBBox
    const ownerSVGElement = elem.ownerSVGElement

    // If the element is not in the live DOM, it does not have a bounding box
    // defined and so fall back to 'zero' dimension element.
    // If the element is not an SVGGraphicsElement, we could not measure the
    // bounding box either
    if (!ownerSVGElement || !Dom.isSVGGraphicsElement(elem)) {
      if (Dom.isHTMLElement(elem)) {
        // If the element is a HTMLElement, return the position relative to the body
        const { left, top, width, height } = getBoundingOffsetRect(elem as any)
        return new Rectangle(left, top, width, height)
      }
      return new Rectangle(0, 0, 0, 0)
    }

    let target = options.target
    const recursive = options.recursive

    if (!recursive) {
      try {
        outputBBox = elem.getBBox()
      } catch (e) {
        outputBBox = {
          x: elem.clientLeft,
          y: elem.clientTop,
          width: elem.clientWidth,
          height: elem.clientHeight,
        }
      }

      if (!target) {
        return Rectangle.create(outputBBox)
      }

      // transform like target
      const matrix = Dom.getTransformToElement(elem, target)
      return transformRectangle(outputBBox, matrix)
    }

    // recursive
    {
      const children = elem.childNodes
      const n = children.length

      if (n === 0) {
        return getBBox(elem, {
          target,
        })
      }

      if (!target) {
        target = elem // eslint-disable-line
      }

      for (let i = 0; i < n; i += 1) {
        const child = children[i] as SVGElement
        let childBBox

        if (child.childNodes.length === 0) {
          childBBox = getBBox(child, {
            target,
          })
        } else {
          // if child is a group element, enter it with a recursive call
          childBBox = getBBox(child, {
            target,
            recursive: true,
          })
        }

        if (!outputBBox) {
          outputBBox = childBBox
        } else {
          outputBBox = outputBBox.union(childBBox)
        }
      }

      return outputBBox as Rectangle
    }
  }

  export function getBoundingOffsetRect(elem: HTMLElement) {
    let left = 0
    let top = 0
    let width = 0
    let height = 0
    if (elem) {
      let current = elem as any
      while (current) {
        left += current.offsetLeft
        top += current.offsetTop
        current = current.offsetParent
        if (current) {
          left += parseInt(Dom.getComputedStyle(current, 'borderLeft'), 10)
          top += parseInt(Dom.getComputedStyle(current, 'borderTop'), 10)
        }
      }
      width = elem.offsetWidth
      height = elem.offsetHeight
    }
    return {
      left,
      top,
      width,
      height,
    }
  }

  /**
   * Convert the SVGElement to an equivalent geometric shape. The element's
   * transformations are not taken into account.
   *
   * SVGRectElement      => Rectangle
   *
   * SVGLineElement      => Line
   *
   * SVGCircleElement    => Ellipse
   *
   * SVGEllipseElement   => Ellipse
   *
   * SVGPolygonElement   => Polyline
   *
   * SVGPolylineElement  => Polyline
   *
   * SVGPathElement      => Path
   *
   * others              => Rectangle
   */
  export function toGeometryShape(elem: SVGElement) {
    const attr = (name: string) => {
      const s = elem.getAttribute(name)
      const v = s ? parseFloat(s) : 0
      return Number.isNaN(v) ? 0 : v
    }

    switch (elem instanceof SVGElement && elem.nodeName.toLowerCase()) {
      case 'rect':
        return new Rectangle(
          attr('x'),
          attr('y'),
          attr('width'),
          attr('height'),
        )
      case 'circle':
        return new Ellipse(attr('cx'), attr('cy'), attr('r'), attr('r'))
      case 'ellipse':
        return new Ellipse(attr('cx'), attr('cy'), attr('rx'), attr('ry'))
      case 'polyline': {
        const points = Dom.getPointsFromSvgElement(elem as SVGPolylineElement)
        return new Polyline(points)
      }
      case 'polygon': {
        const points = Dom.getPointsFromSvgElement(elem as SVGPolygonElement)
        if (points.length > 1) {
          points.push(points[0])
        }
        return new Polyline(points)
      }
      case 'path': {
        let d = elem.getAttribute('d') as string
        if (!Path.isValid(d)) {
          d = Path.normalize(d)
        }
        return Path.parse(d)
      }
      case 'line': {
        return new Line(attr('x1'), attr('y1'), attr('x2'), attr('y2'))
      }
      default:
        break
    }

    // Anything else is a rectangle
    return getBBox(elem)
  }

  export function translateAndAutoOrient(
    elem: SVGElement,
    position: PointLike | PointData,
    reference: PointLike | PointData,
    target?: SVGElement,
  ) {
    const pos = Point.create(position)
    const ref = Point.create(reference)

    if (!target) {
      const svg = elem instanceof SVGSVGElement ? elem : elem.ownerSVGElement!
      target = svg // eslint-disable-line
    }

    // Clean-up previously set transformations except the scale.
    // If we didn't clean up the previous transformations then they'd
    // add up with the old ones. Scale is an exception as it doesn't
    // add up, consider: `this.scale(2).scale(2).scale(2)`. The result
    // is that the element is scaled by the factor 2, not 8.
    const s = Dom.scale(elem)
    elem.setAttribute('transform', '')
    const bbox = getBBox(elem, {
      target,
    }).scale(s.sx, s.sy)

    // 1. Translate to origin.
    const translateToOrigin = Dom.createSVGTransform()
    translateToOrigin.setTranslate(
      -bbox.x - bbox.width / 2,
      -bbox.y - bbox.height / 2,
    )

    // 2. Rotate around origin.
    const rotateAroundOrigin = Dom.createSVGTransform()
    const angle = pos.angleBetween(ref, pos.clone().translate(1, 0))
    if (angle) rotateAroundOrigin.setRotate(angle, 0, 0)

    // 3. Translate to the `position` + the offset (half my width)
    //    towards the `reference` point.
    const translateFromOrigin = Dom.createSVGTransform()
    const finalPosition = pos.clone().move(ref, bbox.width / 2)
    translateFromOrigin.setTranslate(
      2 * pos.x - finalPosition.x,
      2 * pos.y - finalPosition.y,
    )

    // 4. Get the current transformation matrix of this node
    const ctm = Dom.getTransformToElement(elem, target)

    // 5. Apply transformations and the scale
    const transform = Dom.createSVGTransform()
    transform.setMatrix(
      translateFromOrigin.matrix.multiply(
        rotateAroundOrigin.matrix.multiply(
          translateToOrigin.matrix.multiply(ctm.scale(s.sx, s.sy)),
        ),
      ),
    )

    elem.setAttribute(
      'transform',
      Dom.matrixToTransformString(transform.matrix),
    )
  }

  export function findShapeNode(magnet: Element) {
    if (magnet == null) {
      return null
    }

    let node = magnet
    do {
      let tagName = node.tagName
      if (typeof tagName !== 'string') return null
      tagName = tagName.toUpperCase()
      if (Dom.hasClass(node, 'x6-port')) {
        node = node.nextElementSibling as Element
      } else if (tagName === 'G') {
        node = node.firstElementChild as Element
      } else if (tagName === 'TITLE') {
        node = node.nextElementSibling as Element
      } else break
    } while (node)

    return node
  }

  // BBox is calculated by the attribute and shape of the node.
  // Because of the reduction in DOM API calls, there is a significant performance improvement.
  export function getBBoxV2(elem: SVGElement) {
    const node = findShapeNode(elem)

    if (!Dom.isSVGGraphicsElement(node)) {
      if (Dom.isHTMLElement(elem)) {
        const { left, top, width, height } = getBoundingOffsetRect(elem as any)
        return new Rectangle(left, top, width, height)
      }
      return new Rectangle(0, 0, 0, 0)
    }

    const shape = toGeometryShape(node)
    const bbox = shape.bbox() || Rectangle.create()

    // const transform = node.getAttribute('transform')
    // if (transform) {
    //   const nodeMatrix = Dom.transformStringToMatrix(transform)
    //   return transformRectangle(bbox, nodeMatrix)
    // }

    return bbox
  }
}

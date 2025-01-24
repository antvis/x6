import { GeometryUtil } from './util'
import { Angle } from './angle'
import { Line } from './line'
import { Point } from './point'
import { Geometry } from './geometry'
import { Ellipse } from './ellipse'

export class Rectangle extends Geometry implements Rectangle.RectangleLike {
  public x: number
  public y: number
  public width: number
  public height: number

  public get left() {
    return this.x
  }

  public get top() {
    return this.y
  }

  public get right() {
    return this.x + this.width
  }

  public get bottom() {
    return this.y + this.height
  }

  public get origin() {
    return new Point(this.x, this.y)
  }

  public get topLeft() {
    return new Point(this.x, this.y)
  }

  public get topCenter() {
    return new Point(this.x + this.width / 2, this.y)
  }

  public get topRight() {
    return new Point(this.x + this.width, this.y)
  }

  public get center() {
    return new Point(this.x + this.width / 2, this.y + this.height / 2)
  }

  public get bottomLeft() {
    return new Point(this.x, this.y + this.height)
  }

  public get bottomCenter() {
    return new Point(this.x + this.width / 2, this.y + this.height)
  }

  public get bottomRight() {
    return new Point(this.x + this.width, this.y + this.height)
  }

  public get corner() {
    return new Point(this.x + this.width, this.y + this.height)
  }

  public get rightMiddle() {
    return new Point(this.x + this.width, this.y + this.height / 2)
  }

  public get leftMiddle() {
    return new Point(this.x, this.y + this.height / 2)
  }

  public get topLine() {
    return new Line(this.topLeft, this.topRight)
  }

  public get rightLine() {
    return new Line(this.topRight, this.bottomRight)
  }

  public get bottomLine() {
    return new Line(this.bottomLeft, this.bottomRight)
  }

  public get leftLine() {
    return new Line(this.topLeft, this.bottomLeft)
  }

  constructor(x?: number, y?: number, width?: number, height?: number) {
    super()
    this.x = x == null ? 0 : x
    this.y = y == null ? 0 : y
    this.width = width == null ? 0 : width
    this.height = height == null ? 0 : height
  }

  getOrigin() {
    return this.origin
  }

  getTopLeft() {
    return this.topLeft
  }

  getTopCenter() {
    return this.topCenter
  }

  getTopRight() {
    return this.topRight
  }

  getCenter() {
    return this.center
  }

  getCenterX() {
    return this.x + this.width / 2
  }

  getCenterY() {
    return this.y + this.height / 2
  }

  getBottomLeft() {
    return this.bottomLeft
  }

  getBottomCenter() {
    return this.bottomCenter
  }

  getBottomRight() {
    return this.bottomRight
  }

  getCorner() {
    return this.corner
  }

  getRightMiddle() {
    return this.rightMiddle
  }

  getLeftMiddle() {
    return this.leftMiddle
  }

  getTopLine() {
    return this.topLine
  }

  getRightLine() {
    return this.rightLine
  }

  getBottomLine() {
    return this.bottomLine
  }

  getLeftLine() {
    return this.leftLine
  }

  /**
   * Returns a rectangle that is the bounding box of the rectangle.
   *
   * If `angle` is specified, the bounding box calculation will take into
   * account the rotation of the rectangle by angle degrees around its center.
   */
  bbox(angle?: number) {
    if (!angle) {
      return this.clone()
    }

    const rad = Angle.toRad(angle)
    const st = Math.abs(Math.sin(rad))
    const ct = Math.abs(Math.cos(rad))
    const w = this.width * ct + this.height * st
    const h = this.width * st + this.height * ct
    return new Rectangle(
      this.x + (this.width - w) / 2,
      this.y + (this.height - h) / 2,
      w,
      h,
    )
  }

  round(precision = 0) {
    this.x = GeometryUtil.round(this.x, precision)
    this.y = GeometryUtil.round(this.y, precision)
    this.width = GeometryUtil.round(this.width, precision)
    this.height = GeometryUtil.round(this.height, precision)
    return this
  }

  add(x: number, y: number, width: number, height: number): this
  add(rect: Rectangle.RectangleLike | Rectangle.RectangleData): this
  add(
    x: number | Rectangle.RectangleLike | Rectangle.RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ): this {
    const rect = Rectangle.create(x, y, width, height)
    const minX = Math.min(this.x, rect.x)
    const minY = Math.min(this.y, rect.y)
    const maxX = Math.max(this.x + this.width, rect.x + rect.width)
    const maxY = Math.max(this.y + this.height, rect.y + rect.height)

    this.x = minX
    this.y = minY
    this.width = maxX - minX
    this.height = maxY - minY

    return this
  }

  update(x: number, y: number, width: number, height: number): this
  update(rect: Rectangle.RectangleLike | Rectangle.RectangleData): this
  update(
    x: number | Rectangle.RectangleLike | Rectangle.RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ): this {
    const rect = Rectangle.create(x, y, width, height)
    this.x = rect.x
    this.y = rect.y
    this.width = rect.width
    this.height = rect.height
    return this
  }

  inflate(amount: number): this
  /**
   * Returns a rectangle inflated in axis-x by `2*dx` and in axis-y by `2*dy`.
   */
  inflate(dx: number, dy: number): this
  inflate(dx: number, dy?: number): this {
    const w = dx
    const h = dy != null ? dy : dx
    this.x -= w
    this.y -= h
    this.width += 2 * w
    this.height += 2 * h

    return this
  }

  /**
   * Adjust the position and dimensions of the rectangle such that its edges
   * are on the nearest increment of `gx` on the x-axis and `gy` on the y-axis.
   */
  snapToGrid(gridSize: number): this
  snapToGrid(gx: number, gy: number): this
  snapToGrid(gx: number, gy?: number): this
  snapToGrid(gx: number, gy?: number): this {
    const origin = this.origin.snapToGrid(gx, gy)
    const corner = this.corner.snapToGrid(gx, gy)
    this.x = origin.x
    this.y = origin.y
    this.width = corner.x - origin.x
    this.height = corner.y - origin.y
    return this
  }

  translate(tx: number, ty: number): this
  translate(p: Point.PointLike | Point.PointData): this
  translate(tx: number | Point.PointLike | Point.PointData, ty?: number): this {
    const p = Point.create(tx, ty)
    this.x += p.x
    this.y += p.y
    return this
  }

  scale(
    sx: number,
    sy: number,
    origin: Point.PointLike | Point.PointData = new Point(),
  ) {
    const pos = this.origin.scale(sx, sy, origin)
    this.x = pos.x
    this.y = pos.y
    this.width *= sx
    this.height *= sy
    return this
  }

  rotate(
    degree: number,
    center: Point.PointLike | Point.PointData = this.getCenter(),
  ) {
    if (degree !== 0) {
      const rad = Angle.toRad(degree)
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)

      let p1 = this.getOrigin()
      let p2 = this.getTopRight()
      let p3 = this.getBottomRight()
      let p4 = this.getBottomLeft()

      p1 = Point.rotateEx(p1, cos, sin, center)
      p2 = Point.rotateEx(p2, cos, sin, center)
      p3 = Point.rotateEx(p3, cos, sin, center)
      p4 = Point.rotateEx(p4, cos, sin, center)

      const rect = new Rectangle(p1.x, p1.y, 0, 0)
      rect.add(p2.x, p2.y, 0, 0)
      rect.add(p3.x, p3.y, 0, 0)
      rect.add(p4.x, p4.y, 0, 0)

      this.update(rect)
    }
    return this
  }

  rotate90() {
    const t = (this.width - this.height) / 2
    this.x += t
    this.y -= t
    const tmp = this.width
    this.width = this.height
    this.height = tmp

    return this
  }

  /**
   * Translates the rectangle by `rect.x` and `rect.y` and expand it by
   * `rect.width` and `rect.height`.
   */
  moveAndExpand(rect: Rectangle.RectangleLike | Rectangle.RectangleData) {
    const ref = Rectangle.clone(rect)
    this.x += ref.x || 0
    this.y += ref.y || 0
    this.width += ref.width || 0
    this.height += ref.height || 0
    return this
  }

  /**
   * Returns an object where `sx` and `sy` give the maximum scaling that can be
   * applied to the rectangle so that it would still fit into `limit`. If
   * `origin` is specified, the rectangle is scaled around it; otherwise, it is
   * scaled around its center.
   */
  getMaxScaleToFit(
    limit: Rectangle.RectangleLike | Rectangle.RectangleData,
    origin: Point = this.center,
  ) {
    const rect = Rectangle.clone(limit)
    const ox = origin.x
    const oy = origin.y

    // Find the maximal possible scale for all corners, so when the scale
    // is applied the point is still inside the rectangle.
    let sx1 = Infinity
    let sx2 = Infinity
    let sx3 = Infinity
    let sx4 = Infinity
    let sy1 = Infinity
    let sy2 = Infinity
    let sy3 = Infinity
    let sy4 = Infinity

    // Top Left
    const p1 = rect.topLeft
    if (p1.x < ox) {
      sx1 = (this.x - ox) / (p1.x - ox)
    }
    if (p1.y < oy) {
      sy1 = (this.y - oy) / (p1.y - oy)
    }

    // Bottom Right
    const p2 = rect.bottomRight
    if (p2.x > ox) {
      sx2 = (this.x + this.width - ox) / (p2.x - ox)
    }
    if (p2.y > oy) {
      sy2 = (this.y + this.height - oy) / (p2.y - oy)
    }

    // Top Right
    const p3 = rect.topRight
    if (p3.x > ox) {
      sx3 = (this.x + this.width - ox) / (p3.x - ox)
    }
    if (p3.y < oy) {
      sy3 = (this.y - oy) / (p3.y - oy)
    }

    // Bottom Left
    const p4 = rect.bottomLeft
    if (p4.x < ox) {
      sx4 = (this.x - ox) / (p4.x - ox)
    }
    if (p4.y > oy) {
      sy4 = (this.y + this.height - oy) / (p4.y - oy)
    }

    return {
      sx: Math.min(sx1, sx2, sx3, sx4),
      sy: Math.min(sy1, sy2, sy3, sy4),
    }
  }

  /**
   * Returns a number that specifies the maximum scaling that can be applied to
   * the rectangle along both axes so that it would still fit into `limit`. If
   * `origin` is specified, the rectangle is scaled around it; otherwise, it is
   * scaled around its center.
   */
  getMaxUniformScaleToFit(
    limit: Rectangle.RectangleLike | Rectangle.RectangleData,
    origin: Point = this.center,
  ) {
    const scale = this.getMaxScaleToFit(limit, origin)
    return Math.min(scale.sx, scale.sy)
  }

  /**
   * Returns `true` if the point is inside the rectangle (inclusive).
   * Returns `false` otherwise.
   */
  containsPoint(x: number, y: number): boolean
  containsPoint(point: Point.PointLike | Point.PointData): boolean
  containsPoint(
    x: number | Point.PointLike | Point.PointData,
    y?: number,
  ): boolean {
    return GeometryUtil.containsPoint(this, Point.create(x, y))
  }

  /**
   * Returns `true` if the rectangle is (completely) inside the
   * rectangle (inclusive). Returns `false` otherwise.
   */
  containsRect(x: number, y: number, w: number, h: number): boolean
  containsRect(rect: Rectangle.RectangleLike | Rectangle.RectangleData): boolean
  containsRect(
    x: number | Rectangle.RectangleLike | Rectangle.RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const b = Rectangle.create(x, y, width, height)
    const x1 = this.x
    const y1 = this.y
    const w1 = this.width
    const h1 = this.height

    const x2 = b.x
    const y2 = b.y
    const w2 = b.width
    const h2 = b.height

    // one of the dimensions is 0
    if (w1 === 0 || h1 === 0 || w2 === 0 || h2 === 0) {
      return false
    }

    return x2 >= x1 && y2 >= y1 && x2 + w2 <= x1 + w1 && y2 + h2 <= y1 + h1
  }

  /**
   * Returns an array of the intersection points of the rectangle and the line.
   * Return `null` if no intersection exists.
   */
  intersectsWithLine(line: Line) {
    const rectLines = [
      this.topLine,
      this.rightLine,
      this.bottomLine,
      this.leftLine,
    ]
    const points: Point[] = []
    const dedupeArr: string[] = []
    rectLines.forEach((l) => {
      const p = line.intersectsWithLine(l)
      if (p !== null && dedupeArr.indexOf(p.toString()) < 0) {
        points.push(p)
        dedupeArr.push(p.toString())
      }
    })

    return points.length > 0 ? points : null
  }

  /**
   * Returns the point on the boundary of the rectangle that is the intersection
   * of the rectangle with a line starting in the center the rectangle ending in
   * the point `p`.
   *
   * If `angle` is specified, the intersection will take into account the
   * rotation of the rectangle by `angle` degrees around its center.
   */
  intersectsWithLineFromCenterToPoint(
    p: Point.PointLike | Point.PointData,
    angle?: number,
  ) {
    const ref = Point.clone(p)
    const center = this.center
    let result: Point | null = null

    if (angle != null && angle !== 0) {
      ref.rotate(angle, center)
    }

    const sides = [this.topLine, this.rightLine, this.bottomLine, this.leftLine]
    const connector = new Line(center, ref)

    for (let i = sides.length - 1; i >= 0; i -= 1) {
      const intersection = sides[i].intersectsWithLine(connector)
      if (intersection !== null) {
        result = intersection
        break
      }
    }
    if (result && angle != null && angle !== 0) {
      result.rotate(-angle, center)
    }

    return result
  }

  /**
   * Returns a rectangle that is a subtraction of the two rectangles if such an
   * object exists (the two rectangles intersect). Returns `null` otherwise.
   */
  intersectsWithRect(
    x: number,
    y: number,
    w: number,
    h: number,
  ): Rectangle | null
  intersectsWithRect(
    rect: Rectangle.RectangleLike | Rectangle.RectangleData,
  ): Rectangle | null
  intersectsWithRect(
    x: number | Rectangle.RectangleLike | Rectangle.RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const ref = Rectangle.create(x, y, width, height)

    // no intersection
    if (!this.isIntersectWithRect(ref)) {
      return null
    }

    const myOrigin = this.origin
    const myCorner = this.corner
    const rOrigin = ref.origin
    const rCorner = ref.corner

    const xx = Math.max(myOrigin.x, rOrigin.x)
    const yy = Math.max(myOrigin.y, rOrigin.y)

    return new Rectangle(
      xx,
      yy,
      Math.min(myCorner.x, rCorner.x) - xx,
      Math.min(myCorner.y, rCorner.y) - yy,
    )
  }

  isIntersectWithRect(x: number, y: number, w: number, h: number): boolean
  isIntersectWithRect(
    rect: Rectangle.RectangleLike | Rectangle.RectangleData,
  ): boolean
  isIntersectWithRect(
    x: number | Rectangle.RectangleLike | Rectangle.RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const ref = Rectangle.create(x, y, width, height)
    const myOrigin = this.origin
    const myCorner = this.corner
    const rOrigin = ref.origin
    const rCorner = ref.corner

    if (
      rCorner.x <= myOrigin.x ||
      rCorner.y <= myOrigin.y ||
      rOrigin.x >= myCorner.x ||
      rOrigin.y >= myCorner.y
    ) {
      return false
    }
    return true
  }

  /**
   * Normalize the rectangle, i.e. make it so that it has non-negative
   * width and height. If width is less than `0`, the function swaps left and
   * right corners and if height is less than `0`, the top and bottom corners
   * are swapped.
   */
  normalize() {
    let newx = this.x
    let newy = this.y
    let newwidth = this.width
    let newheight = this.height
    if (this.width < 0) {
      newx = this.x + this.width
      newwidth = -this.width
    }
    if (this.height < 0) {
      newy = this.y + this.height
      newheight = -this.height
    }
    this.x = newx
    this.y = newy
    this.width = newwidth
    this.height = newheight
    return this
  }

  /**
   * Returns a rectangle that is a union of this rectangle and rectangle `rect`.
   * 返回一个矩形区域，该矩形是两个矩形区域的并集(最大区域)。
   */
  union(rect: Rectangle.RectangleLike | Rectangle.RectangleData) {
    const ref = Rectangle.clone(rect)
    const myOrigin = this.origin
    const myCorner = this.corner
    const rOrigin = ref.origin
    const rCorner = ref.corner

    const originX = Math.min(myOrigin.x, rOrigin.x)
    const originY = Math.min(myOrigin.y, rOrigin.y)
    const cornerX = Math.max(myCorner.x, rCorner.x)
    const cornerY = Math.max(myCorner.y, rCorner.y)

    return new Rectangle(originX, originY, cornerX - originX, cornerY - originY)
  }

  /**
   * Returns a string ("top", "left", "right" or "bottom") denoting the side of
   * the rectangle which is nearest to the point `p`.
   */
  getNearestSideToPoint(p: Point.PointLike | Point.PointData): Rectangle.Side {
    const ref = Point.clone(p)
    const distLeft = ref.x - this.x
    const distRight = this.x + this.width - ref.x
    const distTop = ref.y - this.y
    const distBottom = this.y + this.height - ref.y
    let closest = distLeft
    let side: Rectangle.Side = 'left'

    if (distRight < closest) {
      closest = distRight
      side = 'right'
    }

    if (distTop < closest) {
      closest = distTop
      side = 'top'
    }

    if (distBottom < closest) {
      side = 'bottom'
    }

    return side
  }

  /**
   * Returns a point on the boundary of the rectangle nearest to the point `p`.
   */
  getNearestPointToPoint(p: Point.PointLike | Point.PointData) {
    const ref = Point.clone(p)
    if (this.containsPoint(ref)) {
      const side = this.getNearestSideToPoint(ref)
      if (side === 'left') {
        return new Point(this.x, ref.y)
      }

      if (side === 'top') {
        return new Point(ref.x, this.y)
      }

      if (side === 'right') {
        return new Point(this.x + this.width, ref.y)
      }

      if (side === 'bottom') {
        return new Point(ref.x, this.y + this.height)
      }
    }

    return ref.adhereToRect(this)
  }

  equals(rect: Rectangle.RectangleLike) {
    return (
      rect != null &&
      rect.x === this.x &&
      rect.y === this.y &&
      rect.width === this.width &&
      rect.height === this.height
    )
  }

  clone() {
    return new Rectangle(this.x, this.y, this.width, this.height)
  }

  toJSON() {
    return { x: this.x, y: this.y, width: this.width, height: this.height }
  }

  serialize() {
    return `${this.x} ${this.y} ${this.width} ${this.height}`
  }
}

export namespace Rectangle {
  export function isRectangle(instance: any): instance is Rectangle {
    return instance != null && instance instanceof Rectangle
  }
}

export namespace Rectangle {
  export type RectangleData = [number, number, number, number]

  export interface RectangleLike extends Point.PointLike {
    x: number
    y: number
    width: number
    height: number
  }

  export function isRectangleLike(o: any): o is RectangleLike {
    return (
      o != null &&
      typeof o === 'object' &&
      typeof o.x === 'number' &&
      typeof o.y === 'number' &&
      typeof o.width === 'number' &&
      typeof o.height === 'number'
    )
  }

  export type Side = 'left' | 'right' | 'top' | 'bottom'

  export type KeyPoint =
    | 'center'
    | 'origin'
    | 'corner'
    | 'topLeft'
    | 'topCenter'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomCenter'
    | 'bottomRight'
    | 'rightMiddle'
    | 'leftMiddle'
}

export namespace Rectangle {
  export function create(rect: RectangleLike | RectangleData): Rectangle
  export function create(
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ): Rectangle
  export function create(
    x?: number | RectangleLike | RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ): Rectangle
  export function create(
    x?: number | RectangleLike | RectangleData,
    y?: number,
    width?: number,
    height?: number,
  ): Rectangle {
    if (x == null || typeof x === 'number') {
      return new Rectangle(x, y, width, height)
    }

    return clone(x)
  }

  export function clone(rect: RectangleLike | RectangleData) {
    if (Rectangle.isRectangle(rect)) {
      return rect.clone()
    }

    if (Array.isArray(rect)) {
      return new Rectangle(rect[0], rect[1], rect[2], rect[3])
    }

    return new Rectangle(rect.x, rect.y, rect.width, rect.height)
  }

  /**
   * Returns a new rectangle from the given ellipse.
   */
  export function fromEllipse(ellipse: Ellipse) {
    return new Rectangle(
      ellipse.x - ellipse.a,
      ellipse.y - ellipse.b,
      2 * ellipse.a,
      2 * ellipse.b,
    )
  }

  interface Size {
    width: number
    height: number
  }

  export function fromSize(size: Size) {
    return new Rectangle(0, 0, size.width, size.height)
  }

  export function fromPositionAndSize(pos: Point.PointLike, size: Size) {
    return new Rectangle(pos.x, pos.y, size.width, size.height)
  }
}

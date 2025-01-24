import { Dom } from '../../../x6-common/src/index'
import { Point, Rectangle } from '../../../x6-geometry/src/index'
import { Base } from './base'
import { Util } from '../util'

/**
 * X6坐标系概念
 * local：画布本地坐标系，默认情况下和 graph 坐标系一致，但是会随着画布的缩放和平移发生改变。画布中所有节点的坐标都是以 local 坐标系为准。初始（0,0）坐标与graph视口位置对齐，左偏移会变为负值。 （画布内容坐标系）
 * graph：画布坐标系，也就是我们看到的画布视口，它不会随着画布缩放和平移而改变。（画布视口坐标系）
 * client：浏览器坐标系，鼠标事件中的 e.clinetX、e.clientY 就是相对于浏览器坐标系。（浏览器视口坐标系）
 * page：页面坐标系，与 client 相比，page 会考虑页面水平和垂直方向滚动。鼠标事件中的 e.pageX、e.pageY 就是相对于页面坐标系。（浏览器内容坐标系）
 */


export class CoordManager extends Base {
  /**
   * 获取state元素的"屏幕坐标转换矩阵"（Screen Coordinate Transformation Matrix）
   * @returns 
   */
  getClientMatrix() {
    // getScreenCTM: 获取state元素的"屏幕坐标转换矩阵"（Screen Coordinate Transformation Matrix）
    return Dom.createSVGMatrix(this.view.stage.getScreenCTM())
  }

  /**
   * Returns coordinates of the graph viewport, relative to the window.
   */
  getClientOffset() {
    // see: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
    const rect = this.view.svg.getBoundingClientRect()
    return new Point(rect.left, rect.top)
  }

  /**
   * Returns coordinates of the graph viewport, relative to the document.
   */
  getPageOffset() {
    // see: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
    return this.getClientOffset().translate(window.scrollX, window.scrollY)
  }
  /**
   * 将浏览器坐标转换为画布本地坐标并对齐到画布网格
   * @param x 
   * @param y 
   * @returns 
   */
  snapToGrid(x: number | Point | Point.PointLike, y?: number) {
    const p =
      typeof x === 'number'
        ? this.clientToLocalPoint(x, y as number)
        : this.clientToLocalPoint(x.x, x.y)
    return p.snapToGrid(this.graph.getGridSize())
  }

  localToGraphPoint(x: number | Point | Point.PointLike, y?: number) {
    const localPoint = Point.create(x, y)
    return Util.transformPoint(localPoint, this.graph.matrix())
  }

  localToClientPoint(x: number | Point | Point.PointLike, y?: number) {
    const localPoint = Point.create(x, y)
    return Util.transformPoint(localPoint, this.getClientMatrix())
  }

  localToPagePoint(x: number | Point | Point.PointLike, y?: number) {
    const p =
      typeof x === 'number'
        ? this.localToGraphPoint(x, y!)
        : this.localToGraphPoint(x)
    return p.translate(this.getPageOffset())
  }

  localToGraphRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const localRect = Rectangle.create(x, y, width, height)
    return Util.transformRectangle(localRect, this.graph.matrix())
  }

  localToClientRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const localRect = Rectangle.create(x, y, width, height)
    return Util.transformRectangle(localRect, this.getClientMatrix())
  }

  localToPageRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const rect =
      typeof x === 'number'
        ? this.localToGraphRect(x, y!, width!, height!)
        : this.localToGraphRect(x)
    return rect.translate(this.getPageOffset())
  }

  graphToLocalPoint(x: number | Point | Point.PointLike, y?: number) {
    const graphPoint = Point.create(x, y)
    return Util.transformPoint(graphPoint, this.graph.matrix().inverse())
  }
  /**
   * 将页面的浏览器坐标转换画布本地坐标
   * @param x 
   * @param y 
   * @returns 
   */
  clientToLocalPoint(x: number | Point | Point.PointLike, y?: number) {
    const clientPoint = Point.create(x, y)
    // 先获取state元素的"屏幕坐标转换矩阵"（Screen Coordinate Transformation Matrix）
    // 再取得逆矩阵 （local to client使用正矩阵，client to local使用逆矩阵inverse）
    // 使用client.x、client.y 构建一个svgPoint，然后使用svgPoint.matrixTransform(matrix)

    /**
     * client to local 为什么用逆矩
     * 前提： ScreenCTM是svg中元素相对于屏幕的缩放、倾斜、偏移位置
     * 1. 在svg不进行缩放、倾斜、偏移的情况下，CTM偏移位置就是svg左上角位置；点击svg区域屏幕，计算点击位置在svg的坐标就是  clien.x - ctm.x
     * 2. 当svg中的元素进行了偏移（比如向右偏移100px）,CTM偏移位置就是svg左上角位置 + 100px；那点击svg区域屏幕（例如svg左上角定点），点击位置在svg的坐标就是  client.x - ctm.x = -100px
     * 3. 所以在不缩放，只偏移的情况下；local的计算位置就是 CTX的偏移位置 与屏幕点击client位置的简单加减
     * 4. 在有缩放的情况下，再进行缩放的比例计算
     * 5. 那至于为什么要用逆矩阵；元素向右偏移100px，正常情况下我们的计算逻辑是 client.x - ctm.x；（一般不这么计算）
     * 6. 但是按正常的理解逻辑，[2,0,0,2, 10, 10]的逆矩阵是 [-2,0,0,-2, -10, -10]；然后根据这些缩放、偏移进行计算
     * 7. 但这样的计算，给定一个client位置信息，在clientToLocal， 再由localToClient时，位置信息是对不上的；实际上[2,0,0,2, 10,10]的逆矩阵为[0.5, 0, 0, 0.5, -5, -5]
     */

    /**
     * demo: svg 右平移100px、放大2倍(放大到2倍)
     * svg: screenCTM: [2,0,0,2, 100, 0]
     * local: [50, 50]
     * 
     * 正常计算：
     * clientToLocal: 
     * 缩放后local位置： [50 * 2, 50 *2] = [100, 100]
     * 平移移后local位置： [100 + 100, 100]
     * 所以local点在client屏幕坐标位置： [200, 100]
     * 
     * 使用反推，计算local位置
     * 撤销平移： [200 -100, 100 - 0] = [100, 100]
     * 撤销缩放: [100 / 2, 100 / 2] = [50, 50]
     * 
     */

    /**
     * 
     * 手动反推在简单变换时是可行的，但在复杂变换场景中变得不切实际
     * [2,0,0,2, 100, 0] 对应的矩阵为
     * 2 0 100
     * 0 2 0
     * 0 0 1
     * 固定格式：
     * a c e
     * b d f
     * 0 0 1
     * 
     * 逆矩阵为(逆矩阵计算公式参见印象笔记中)
     * 0.5  0    -50
     * 0    0.5  0
     * 0    0    1
     * 
     *               0.5  0    -50
     * [200, 100]  * 0    0.5  0    = [50, 50] 
     *               0    0    1
     * 
     *   200         0.5  0    -50
     *   100       * 0    0.5  0    = [50, 50] 
     *   1           0    0    1
     * 
     * 逐行的每个位置元素与 200、100、1 相乘后相加
     * 第一行:
     * 0.5 * 200 + 0 * 100 + -50 = 50
     * 第二行
     * 0 * 200 + 0.5 * 100 + 0 = 50
     * 第三行
     * 0 * 200 + 0 * 100 + 1 = 1
     * [50, 50, 1] => [50, 50]
     * 
     */
 
    return Util.transformPoint(clientPoint, this.getClientMatrix().inverse())
  }

  clientToGraphPoint(x: number | Point | Point.PointLike, y?: number) {
    const clientPoint = Point.create(x, y)
    return Util.transformPoint(
      clientPoint,
      this.graph.matrix().multiply(this.getClientMatrix().inverse()),
    )
  }
  /**
   * 将页面点坐标转换为画布本地点坐标
   * @param x 
   * @param y 
   * @returns 
   */
  pageToLocalPoint(x: number | Point | Point.PointLike, y?: number) {
    const pagePoint = Point.create(x, y)
    const graphPoint = pagePoint.diff(this.getPageOffset())
    return this.graphToLocalPoint(graphPoint)
  }

  graphToLocalRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const graphRect = Rectangle.create(x, y, width, height)
    return Util.transformRectangle(graphRect, this.graph.matrix().inverse())
  }
  /**
   * 画布矩形转换为浏览器矩形
   * @param x 
   * @param y 
   * @param width 
   * @param height 
   * @returns 
   */
  clientToLocalRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const clientRect = Rectangle.create(x, y, width, height)
    return Util.transformRectangle(clientRect, this.getClientMatrix().inverse())
  }

  clientToGraphRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const clientRect = Rectangle.create(x, y, width, height)
    return Util.transformRectangle(
      clientRect,
      this.graph.matrix().multiply(this.getClientMatrix().inverse()),
    )
  }
  /**
   * 将页面矩形坐标转换为画布本地矩形坐标
   * @param x 
   * @param y 
   * @param width 
   * @param height 
   * @returns 
   */
  pageToLocalRect(
    x: number | Rectangle | Rectangle.RectangleLike,
    y?: number,
    width?: number,
    height?: number,
  ) {
    const graphRect = Rectangle.create(x, y, width, height)
    const pageOffset = this.getPageOffset()
    graphRect.x -= pageOffset.x
    graphRect.y -= pageOffset.y
    return this.graphToLocalRect(graphRect)
  }
}

export namespace CoordManager {}

import { FunctionExt } from '@antv/x6-common'
import { Base } from './base'

export class VirtualRenderManager extends Base {
  protected init() {
    this.resetRenderArea = FunctionExt.throttle(
      FunctionExt.throttle(this.resetRenderArea, 200, {
        leading: true,
      }),
      1,
      { leading: false },
    )
    this.resetRenderArea()
    this.startListening()
  }

  protected startListening() {
    this.graph.on('translate', this.resetRenderArea, this)
    this.graph.on('scale', this.resetRenderArea, this)
    this.graph.on('resize', this.resetRenderArea, this)
    this.graph.on('scroller:scroll', this.resetRenderArea, this)
  }

  protected stopListening() {
    this.graph.off('translate', this.resetRenderArea, this)
    this.graph.off('scale', this.resetRenderArea, this)
    this.graph.off('resize', this.resetRenderArea, this)
    this.graph.off('scroller:scroll', this.resetRenderArea, this)
  }

  enableVirtualRender() {
    this.options.virtual = true
    this.resetRenderArea()
  }

  disableVirtualRender() {
    this.options.virtual = false
    this.graph.renderer.setRenderArea(undefined)
  }

  resetRenderArea() {
    if (this.options.virtual) {
      const scroller = this.graph.getPlugin<any>('scroller')
      const renderArea = scroller
        ? scroller.getVisibleArea()
        : this.graph.getGraphArea()
      this.graph.renderer.setRenderArea(renderArea)
    }
  }

  @Base.dispose()
  dispose() {
    this.stopListening()
  }
}

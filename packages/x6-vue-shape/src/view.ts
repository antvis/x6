import { NodeView, Dom } from '@antv/x6'
import { isVue2, isVue3, createApp, h, Vue2 } from 'vue-demi'
import { VueShape } from './node'
import { shapeMaps } from './registry'
import { isActive, connect, disconnect } from './teleport'

export class VueShapeView extends NodeView<VueShape> {
  private vm: any

  getComponentContainer() {
    return this.selectors && (this.selectors.foContent as HTMLDivElement)
  }

  confirmUpdate(flag: number) {
    const ret = super.confirmUpdate(flag)
    return this.handleAction(ret, VueShapeView.action, () => {
      this.renderVueComponent()
    })
  }

  protected targetId() {
    return `${this.graph.view.cid}:${this.cell.id}`
  }

  protected renderVueComponent() {
    this.unmountVueComponent()
    const root = this.getComponentContainer()
    const node = this.cell
    const graph = this.graph

    if (root) {
      // 从registry注册表中获取组件自定义vue组件
      const { component } = shapeMaps[node.shape]
      if (component) {
        //  渲染自定义vue组件
        if (isVue2) {
          const Vue = Vue2 as any
          this.vm = new Vue({
            el: root,
            render(h: any) {
              return h(component, { node, graph })
            },
            provide() {
              return {
                getNode: () => node,
                getGraph: () => graph,
              }
            },
          })
        } else if (isVue3) {
          if (isActive()) {
            connect(this.targetId(), component, root, node, graph)
          } else {
            this.vm = createApp({
              render() {
                return h(component, { node, graph })
              },
              provide() {
                return {
                  getNode: () => node,
                  getGraph: () => graph,
                }
              },
            })
            this.vm.mount(root)
          }
        }
      }
    }
  }

  protected unmountVueComponent() {
    const root = this.getComponentContainer()
    if (this.vm) {
      isVue2 && this.vm.$destroy()
      isVue3 && this.vm.unmount()
      this.vm = null
    }
    if (root) {
      root.innerHTML = ''
    }
    return root
  }

  onMouseDown(e: Dom.MouseDownEvent, x: number, y: number) {
    const target = e.target as Element
    const tagName = target.tagName.toLowerCase()
    if (tagName === 'input') {
      const type = target.getAttribute('type')
      if (
        type == null ||
        [
          'text',
          'password',
          'number',
          'email',
          'search',
          'tel',
          'url',
        ].includes(type)
      ) {
        return
      }
    }

    super.onMouseDown(e, x, y)
  }

  unmount() {
    if (isActive()) {
      disconnect(this.targetId())
    }
    this.unmountVueComponent()
    super.unmount()
    return this
  }
}

export namespace VueShapeView {
  export const action = 'vue' as any

  VueShapeView.config({
    bootstrap: [action],
    actions: {
      component: action,
    },
  })

  NodeView.registry.register('vue-shape-view', VueShapeView, true)
}

import {
  defineComponent,
  h,
  reactive,
  isVue3,
  Teleport,
  markRaw,
  Fragment,
  onBeforeUnmount,
} from 'vue-demi'
import { Graph } from '@antv/x6'
import { VueShape } from './node'

let active = false
const items = reactive<{ [key: string]: any }>({})

export function connect(
  id: string,
  component: any,
  container: HTMLDivElement,
  node: VueShape,
  graph: Graph,
) {
  if (active) {
    items[id] = markRaw(
      defineComponent({
        render: () =>
          h(Teleport, { to: container } as any, [
            h(component, { node, graph }),
          ]),
        provide: () => ({
          getNode: () => node,
          getGraph: () => graph,
        }),
      }),
    )
  }
}

export function disconnect(id: string) {
  if (active) {
    delete items[id]
  }
}

export function isActive() {
  return active
}

let itemComponets: any = null

export function getTeleport(): any {
  if (!isVue3) {
    throw new Error('teleport is only available in Vue3')
  }

  if (itemComponets && active) {
    return null
  }

  active = true

  itemComponets = defineComponent({
    setup() {
      onBeforeUnmount(() => {
        itemComponets = null
      })

      return () =>
        h(
          Fragment,
          {},
          Object.keys(items).map((id) => h(items[id])),
        )
    },
  })
  return itemComponets
}

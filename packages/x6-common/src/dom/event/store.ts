import { EventHandler } from './types'

export namespace Store {
  export type EventTarget = Element | Record<string, unknown>

  export interface HandlerObject {
    guid: number
    type: string
    originType: string
    handler: EventHandler<any, any>
    data?: any
    selector?: string
    namespace?: string
  }

  export interface Data {
    handler?: EventHandler<any, any>
    events: {
      [type: string]: {
        handlers: HandlerObject[]
        delegateCount: number
      }
    }
  }

  const cache: WeakMap<EventTarget, Data> = new WeakMap()

  export function ensure(target: EventTarget) {
    if (!cache.has(target)) {
      // 构建以element为key 的events对象
      cache.set(target, { events: Object.create(null) })
    }
    return cache.get(target)!
  }

  export function get(target: EventTarget) {
    return cache.get(target)
  }

  export function remove(target: EventTarget) {
    return cache.delete(target)
  }
}

import { Store } from './store'
import { EventObject } from './object'

export namespace Util {
  export const returnTrue = () => true
  export const returnFalse = () => false
  export function stopPropagationCallback(e: Event) {
    e.stopPropagation()
  }

  export function addEventListener<TElement extends Element>(
    elem: TElement,
    type: string,
    handler: EventListener,
  ) {
    if (elem.addEventListener != null) {
      elem.addEventListener(type, handler as any)
    }
  }

  export function removeEventListener<TElement extends Element>(
    elem: TElement,
    type: string,
    handler: EventListener,
  ) {
    if (elem.removeEventListener != null) {
      elem.removeEventListener(type, handler as any)
    }
  }
}

export namespace Util {
  const rNotHTMLWhite = /[^\x20\t\r\n\f]+/g
  const rNamespace = /^([^.]*)(?:\.(.+)|)/

  export function splitType(types: string) {
    return (types || '').match(rNotHTMLWhite) || ['']
  }

  export function normalizeType(type: string) {
    const parts = rNamespace.exec(type) || []
    return {
      originType: parts[1] ? parts[1].trim() : parts[1],
      namespaces: parts[2]
        ? parts[2]
            .split('.')
            .map((ns) => ns.trim())
            .sort()
        : [],
    }
  }

  export function isValidTarget(target: Element | Record<string, any>) {
    // Accepts only:
    //  - Node
    //    - Node.ELEMENT_NODE
    //    - Node.DOCUMENT_NODE
    //  - Object
    //    - Any
    return target.nodeType === 1 || target.nodeType === 9 || !+target.nodeType
  }

  export function isValidSelector(elem: Store.EventTarget, selector?: string) {
    if (selector) {
      const node = elem as Element
      return node.querySelector != null && node.querySelector(selector) != null
    }
    return true
  }
}

export namespace Util {
  type Handler = (...args: any[]) => void

  let seed = 0
  const cache: WeakMap<Handler, number> = new WeakMap()

  export function ensureHandlerId(handler: Handler) {
    if (!cache.has(handler)) {
      cache.set(handler, seed)
      seed += 1
    }

    return cache.get(handler)!
  }

  export function getHandlerId(handler: Handler) {
    return cache.get(handler)
  }

  export function removeHandlerId(handler: Handler) {
    return cache.delete(handler)
  }

  export function setHandlerId(handler: Handler, id: number) {
    return cache.set(handler, id)
  }
}

export namespace Util {
  export function getHandlerQueue(elem: Store.EventTarget, event: EventObject) {
    const queue = []
    // Store中使用WeakMap进行cache缓存，缓存相关数据
    const store = Store.get(elem)
    const bag = store && store.events && store.events[event.type]
    const handlers = (bag && bag.handlers) || []
    const delegateCount = bag ? bag.delegateCount : 0

    if (
      delegateCount > 0 &&
      // Support: Firefox <=42 - 66+
      // Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
      // https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
      // Support: IE 11+
      // ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
      !(
        event.type === 'click' &&
        typeof event.button === 'number' &&
        event.button >= 1
      )
    ) {
      for (
        let curr = event.target as Node;
        curr !== elem;
        curr = curr.parentNode || (elem as Node)
      ) {
        // Don't check non-elements
        // Don't process clicks on disabled elements
        if (
          curr.nodeType === 1 &&
          !(event.type === 'click' && (curr as any).disabled === true)
        ) {
          const matchedHandlers: Store.HandlerObject[] = []
          const matchedSelectors: { [selector: string]: boolean } = {}

          for (let i = 0; i < delegateCount; i += 1) {
            const handleObj = handlers[i]
            const selector = handleObj.selector!

            if (selector != null && matchedSelectors[selector] == null) {
              const node = elem as Element
              const nodes: Element[] = []

              node.querySelectorAll(selector).forEach((child) => {
                nodes.push(child)
              })

              matchedSelectors[selector] = nodes.includes(curr as Element)
            }

            if (matchedSelectors[selector]) {
              matchedHandlers.push(handleObj)
            }
          }

          if (matchedHandlers.length) {
            queue.push({ elem: curr, handlers: matchedHandlers })
          }
        }
      }
    }

    // Add the remaining (directly-bound) handlers
    if (delegateCount < handlers.length) {
      // 截取delegateCount之后的handler，也就是用于具体cell选择器的handler
      queue.push({ elem, handlers: handlers.slice(delegateCount) })
    }

    return queue
  }
}

export namespace Util {
  export function isWindow(obj: any): obj is Window {
    return obj != null && obj === obj.window
  }
}

export namespace Util {
  export function contains(a: any, b: any) {
    const adown = a.nodeType === 9 ? a.documentElement : a
    const bup = b && b.parentNode

    return (
      a === bup ||
      !!(
        bup &&
        bup.nodeType === 1 &&
        // Support: IE 9 - 11+
        // IE doesn't have `contains` on SVG.
        (adown.contains
          ? adown.contains(bup)
          : a.compareDocumentPosition && a.compareDocumentPosition(bup) & 16)
      )
    )
  }
}

import { Dom, KeyValue, Basecoat } from '../../../x6-common/src/index.ts'
import { EventArgs } from '@antv/x6-common/lib/event/types'
import { Config } from '../config'
import { Markup } from './markup'
import { Attr } from '../registry'

export abstract class View<A extends EventArgs = any> extends Basecoat<A> {
  public readonly cid: string
  public container: Element
  protected selectors: Markup.Selectors

  public get priority() {
    return 2
  }

  /** If need remove `this.container` DOM */
  protected get disposeContainer() {
    return true
  }

  constructor() {
    super()
    this.cid = Private.uniqueId()
    View.views[this.cid] = this
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  confirmUpdate(flag: number, options: any): number {
    return 0
  }

  empty(elem: Element = this.container) {
    Dom.empty(elem)
    return this
  }

  unmount(elem: Element = this.container) {
    Dom.remove(elem)
    return this
  }

  remove(elem: Element = this.container) {
    if (elem === this.container) {
      this.removeEventListeners(document)
      this.onRemove()
      delete View.views[this.cid]
      if (this.disposeContainer) {
        this.unmount(elem)
      }
    } else {
      this.unmount(elem)
    }
    return this
  }

  protected onRemove() {}

  setClass(className: string | string[], elem: Element = this.container) {
    elem.classList.value = Array.isArray(className)
      ? className.join(' ')
      : className
  }

  addClass(className: string | string[], elem: Element = this.container) {
    Dom.addClass(
      elem,
      Array.isArray(className) ? className.join(' ') : className,
    )
    return this
  }

  removeClass(className: string | string[], elem: Element = this.container) {
    Dom.removeClass(
      elem,
      Array.isArray(className) ? className.join(' ') : className,
    )
    return this
  }

  setStyle(
    style: Record<string, string | number>,
    elem: Element = this.container,
  ) {
    Dom.css(elem, style)
    return this
  }

  setAttrs(attrs?: Attr.SimpleAttrs | null, elem: Element = this.container) {
    if (attrs != null && elem != null) {
      Dom.attr(elem, attrs)
    }
    return this
  }

  /**
   * Returns the value of the specified attribute of `node`.
   *
   * If the node does not set a value for attribute, start recursing up
   * the DOM tree from node to lookup for attribute at the ancestors of
   * node. If the recursion reaches CellView's root node and attribute
   * is not found even there, return `null`.
   */
  findAttr(attrName: string, elem: Element = this.container) {
    let current = elem
    while (current && current.nodeType === 1) {
      const value = current.getAttribute(attrName)
      if (value != null) {
        return value
      }

      if (current === this.container) {
        return null
      }
      // 向上递归寻找拥有指定属性attrName的元素
      current = current.parentNode as Element
    }

    return null
  }

  find(
    selector?: string,
    rootElem: Element = this.container,
    selectors: Markup.Selectors = this.selectors,
  ) {
    return View.find(selector, rootElem, selectors).elems
  }

  findOne(
    selector?: string,
    rootElem: Element = this.container,
    selectors: Markup.Selectors = this.selectors,
  ) {
    const nodes = this.find(selector, rootElem, selectors)
    return nodes.length > 0 ? nodes[0] : null
  }

  findByAttr(attrName: string, elem: Element = this.container) {
    let node = elem
    while (node && node.getAttribute) {
      const val = node.getAttribute(attrName)
      if ((val != null || node === this.container) && val !== 'false') {
        return node
      }
      node = node.parentNode as Element
    }

    // If the overall cell has set `magnet === false`, then returns
    // `null` to announce there is no magnet found for this cell.
    // This is especially useful to set on cells that have 'ports'.
    // In this case, only the ports have set `magnet === true` and the
    // overall element has `magnet === false`.
    return null
  }

  getSelector(elem: Element, prevSelector?: string): string | undefined {
    let selector

    if (elem === this.container) {
      if (typeof prevSelector === 'string') {
        selector = `> ${prevSelector}`
      }
      return selector
    }

    if (elem) {
      const nth = Dom.index(elem) + 1
      selector = `${elem.tagName.toLowerCase()}:nth-child(${nth})`
      if (prevSelector) {
        selector += ` > ${prevSelector}`
      }

      selector = this.getSelector(elem.parentNode as Element, selector)
    }

    return selector
  }

  prefixClassName(className: string) {
    return Config.prefix(className)
  }

  delegateEvents(events: View.Events, append?: boolean) {
    if (events == null) {
      return this
    }

    if (!append) {
      this.undelegateEvents()
    }

    const splitter = /^(\S+)\s*(.*)$/
    Object.keys(events).forEach((key) => {
      const match = key.match(splitter)
      if (match == null) {
        return
      }

      const method = this.getEventHandler(events[key])
      if (typeof method === 'function') {
        this.delegateEvent(match[1], match[2], method)
      }
    })

    return this
  }

  undelegateEvents() {
    Dom.Event.off(this.container, this.getEventNamespace())
    return this
  }

  delegateDocumentEvents(events: View.Events, data?: KeyValue) {
    this.addEventListeners(document, events, data)
    return this
  }

  undelegateDocumentEvents() {
    this.removeEventListeners(document)
    return this
  }

  protected delegateEvent(
    eventName: string,
    selector: string | Record<string, unknown>,
    listener: any,
  ) {
    Dom.Event.on(
      this.container,
      eventName + this.getEventNamespace(),
      selector,
      listener,
    )
    return this
  }

  protected undelegateEvent(
    eventName: string,
    selector: string,
    listener: any,
  ): this
  protected undelegateEvent(eventName: string): this
  protected undelegateEvent(eventName: string, listener: any): this
  protected undelegateEvent(
    eventName: string,
    selector?: string | any,
    listener?: any,
  ) {
    const name = eventName + this.getEventNamespace()
    if (selector == null) {
      Dom.Event.off(this.container, name)
    } else if (typeof selector === 'string') {
      Dom.Event.off(this.container, name, selector, listener)
    } else {
      Dom.Event.off(this.container, name, selector)
    }
    return this
  }

  protected addEventListeners(
    elem: Element | Document,
    events: View.Events,
    data?: KeyValue,
  ) {
    if (events == null) {
      return this
    }

    const ns = this.getEventNamespace()
    Object.keys(events).forEach((eventName) => {
      const method = this.getEventHandler(events[eventName])
      if (typeof method === 'function') {
        Dom.Event.on<string, KeyValue | undefined>(
          elem as Element,
          eventName + ns,
          data,
          method as any,
        )
      }
    })

    return this
  }

  protected removeEventListeners(elem: Element | Document) {
    if (elem != null) {
      Dom.Event.off(elem as Element, this.getEventNamespace())
    }
    return this
  }

  protected getEventNamespace() {
    return `.${Config.prefixCls}-event-${this.cid}`
  }

  // eslint-disable-next-line
  protected getEventHandler(handler: string | Function) {
    // eslint-disable-next-line
    let method: Function | undefined
    if (typeof handler === 'string') {
      const fn = (this as any)[handler]
      if (typeof fn === 'function') {
        method = (...args: any) => fn.call(this, ...args)
      }
    } else {
      method = (...args: any) => handler.call(this, ...args)
    }

    return method
  }

  getEventTarget(e: Dom.EventObject, options: { fromPoint?: boolean } = {}) {
    // Touchmove/Touchend event's target is not reflecting the element
    // under the coordinates as mousemove does.
    // It holds the element when a touchstart triggered.
    const { target, type, clientX = 0, clientY = 0 } = e
    if (options.fromPoint || type === 'touchmove' || type === 'touchend') {
      return document.elementFromPoint(clientX, clientY)
    }

    return target
  }

  stopPropagation(e: Dom.EventObject) {
    this.setEventData(e, { propagationStopped: true })
    return this
  }

  isPropagationStopped(e: Dom.EventObject) {
    return this.getEventData(e).propagationStopped === true
  }

  getEventData<T extends KeyValue>(e: Dom.EventObject): T {
    return this.eventData<T>(e)
  }

  setEventData<T extends KeyValue>(e: Dom.EventObject, data: T): T {
    return this.eventData(e, data)
  }

  protected eventData<T extends KeyValue>(e: Dom.EventObject, data?: T): T {
    if (e == null) {
      throw new TypeError('Event object required')
    }

    let currentData = e.data
    const key = `__${this.cid}__`

    // get
    if (data == null) {
      if (currentData == null) {
        return {} as T
      }
      return currentData[key] || {}
    }

    // set
    if (currentData == null) {
      currentData = e.data = {}
    }

    if (currentData[key] == null) {
      currentData[key] = { ...data }
    } else {
      currentData[key] = { ...currentData[key], ...data }
    }

    return currentData[key]
  }

  normalizeEvent<T extends Dom.EventObject>(evt: T) {
    return View.normalizeEvent(evt)
  }

  @View.dispose()
  dispose() {
    this.remove()
  }
}

export namespace View {
  export type Events = KeyValue<string | Function> // eslint-disable-line
}

export namespace View {
  export function createElement(tagName?: string, isSvgElement?: boolean) {
    return isSvgElement
      ? Dom.createSvgElement(tagName || 'g')
      : (Dom.createElementNS(tagName || 'div') as HTMLElement)
  }

  export function find(
    selector: string | null | undefined,
    rootElem: Element,
    selectors: Markup.Selectors,
  ): { isCSSSelector?: boolean; elems: Element[] } {
    if (!selector || selector === '.') {
      return { elems: [rootElem] }
    }

    if (selectors) {
      const nodes = selectors[selector]
      if (nodes) {
        return { elems: Array.isArray(nodes) ? nodes : [nodes] }
      }
    }

    if (Config.useCSSSelector) {
      const validSelector = selector.includes('>')
        ? `:scope ${selector}`
        : selector
      return {
        isCSSSelector: true,
        // $(rootElem).find(selector).toArray() as Element[]
        elems: Array.prototype.slice.call(
          rootElem.querySelectorAll(validSelector),
        ),
      }
    }

    return { elems: [] }
  }

  export function normalizeEvent<T extends Dom.EventObject>(evt: T) {
    let normalizedEvent = evt
    const originalEvent = evt.originalEvent as TouchEvent
    const touchEvt: any =
      originalEvent &&
      originalEvent.changedTouches &&
      originalEvent.changedTouches[0]

    if (touchEvt) {
      // eslint-disable-next-line no-restricted-syntax
      for (const key in evt) {
        if (touchEvt[key] === undefined) {
          touchEvt[key] = (evt as any)[key]
        }
      }
      normalizedEvent = touchEvt
    }

    return normalizedEvent
  }
}

export namespace View {
  export const views: { [cid: string]: View } = {}

  export function getView(cid: string) {
    return views[cid] || null
  }
}

namespace Private {
  let counter = 0
  export function uniqueId() {
    const id = `v${counter}`
    counter += 1
    return id
  }
}

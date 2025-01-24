import { Util } from './util'
import { EventHook } from './hook'
import { Store } from './store'
import { EventObject } from './object'
import { EventHandler } from './types'
import './special'

export namespace Core {
  let triggered: string | undefined


  // Dom的事件注册，与Graph本身的事件注册机制区分开；使用Dom.Event.on进行Dom事件注册
  export function on(
    elem: Store.EventTarget,
    types: string,
    handler:
      | EventHandler<any, any>
      | ({
          handler: EventHandler<any, any>
          selector?: string
        } & Partial<Store.HandlerObject>),
    data?: any,
    selector?: string,
  ) {
    if (!Util.isValidTarget(elem)) {
      return
    }

    // Caller can pass in an object of custom data in lieu of the handler
    let handlerData: any
    if (typeof handler !== 'function') {
      const { handler: h, selector: s, ...others } = handler
      handler = h // eslint-disable-line
      selector = s // eslint-disable-line
      handlerData = others
    }

    // Ensure that invalid selectors throw exceptions at attach time
    // if (!Util.isValidSelector(elem, selector)) {
    //   throw new Error('Delegate event with invalid selector.')
    // }
    // 确保elem进入store，后续dispatch 中Util.getHandlerQueue(elem, event)会用到
    const store = Store.ensure(elem)

    // Ensure the main handle
    let mainHandler = store.handler
    if (mainHandler == null) {
      mainHandler = store.handler = function (e, ...args: any[]) {
        // 事件处理器
        return triggered !== e.type ? dispatch(elem, e, ...args) : undefined
      }
    }

    // Make sure that the handler has a unique ID, used to find/remove it later
    const guid = Util.ensureHandlerId(handler)

    // Handle multiple events separated by a space
    Util.splitType(types).forEach((item) => {
      const { originType, namespaces } = Util.normalizeType(item)

      // There *must* be a type, no attaching namespace-only handlers
      if (!originType) {
        return
      }

      let type = originType
      // 事件名称hook，通过事件名转换成其它事件名称；EventHook.register方法注册转换逻辑
      // 例如mouseenter 会被转换为mouseover 事件
      let hook = EventHook.get(type)

      // If selector defined, determine special event type, otherwise given type
      type = (selector ? hook.delegateType : hook.bindType) || type

      // Update hook based on newly reset type
      hook = EventHook.get(type)

      // handleObj is passed to all event handlers
      const handleObj: Store.HandlerObject = {
        type,
        originType,
        data,
        selector,
        guid,
        handler: handler as EventHandler<any, any>,
        namespace: namespaces.join('.'),
        ...handlerData,
      }

      // Init the event handler queue if we're the first
      const events = store.events
      let bag = events[type]
      if (!bag) {
        bag = events[type] = { handlers: [], delegateCount: 0 }

        // Only use addEventListener if the `hook.steup` returns false
        if (
          !hook.setup ||
          hook.setup(elem, data, namespaces, mainHandler!) === false
        ) {
          Util.addEventListener(
            elem as Element,
            type,
            mainHandler as any as EventListener,
          )
        }
      }

      if (hook.add) {
        Util.removeHandlerId(handleObj.handler)
        hook.add(elem, handleObj)
        Util.setHandlerId(handleObj.handler, guid)
      }


      // Add to the element's handler list, delegates in front
      if (selector) {
        // 有选择器的情况下（理解为具体的cell选择器），将delegateCount+1，代表有多少个具体cell选择器
        bag.handlers.splice(bag.delegateCount, 0, handleObj)
        bag.delegateCount += 1
      } else {
        bag.handlers.push(handleObj)
      }
    })
  }

  export function off(
    elem: Store.EventTarget,
    types: string,
    handler?: EventHandler<any, any>,
    selector?: string,
    mappedTypes?: boolean,
  ) {
    const store = Store.get(elem)
    if (!store) {
      return
    }

    const events = store.events
    if (!events) {
      return
    }

    // Once for each type.namespace in types; type may be omitted
    Util.splitType(types).forEach((item) => {
      const { originType, namespaces } = Util.normalizeType(item)

      // Unbind all events (on this namespace, if provided) for the element
      if (!originType) {
        Object.keys(events).forEach((key) => {
          off(elem, key + item, handler, selector, true)
        })
        return
      }

      let type = originType
      const hook = EventHook.get(type)
      type = (selector ? hook.delegateType : hook.bindType) || type
      const bag = events[type]
      if (!bag) {
        return
      }
      const rns =
        namespaces.length > 0
          ? new RegExp(`(^|\\.)${namespaces.join('\\.(?:.*\\.|)')}(\\.|$)`)
          : null

      // Remove matching events
      const originHandlerCount = bag.handlers.length
      for (let i = bag.handlers.length - 1; i >= 0; i -= 1) {
        const handleObj = bag.handlers[i]
        if (
          (mappedTypes || originType === handleObj.originType) &&
          (!handler || Util.getHandlerId(handler) === handleObj.guid) &&
          (rns == null ||
            (handleObj.namespace && rns.test(handleObj.namespace))) &&
          (selector == null ||
            selector === handleObj.selector ||
            (selector === '**' && handleObj.selector))
        ) {
          bag.handlers.splice(i, 1)

          if (handleObj.selector) {
            bag.delegateCount -= 1
          }

          if (hook.remove) {
            hook.remove(elem, handleObj)
          }
        }
      }

      if (originHandlerCount && bag.handlers.length === 0) {
        if (
          !hook.teardown ||
          hook.teardown(elem, namespaces, store.handler!) === false
        ) {
          Util.removeEventListener(
            elem as Element,
            type,
            store.handler as any as EventListener,
          )
        }

        delete events[type]
      }
    })

    // Remove data and the expando if it's no longer used
    if (Object.keys(events).length === 0) {
      Store.remove(elem)
    }
  }

  export function dispatch(
    elem: Store.EventTarget,
    evt: Event | EventObject | string,
    ...args: any[]
  ) {
    // 构建自定义的event数据
    const event = EventObject.create(evt)
    event.delegateTarget = elem as Element

    const hook = EventHook.get(event.type)
    if (hook.preDispatch && hook.preDispatch(elem, event) === false) {
      return
    }

    const handlerQueue = Util.getHandlerQueue(elem, event)

    // Run delegates first; they may want to stop propagation beneath us
    for (
      let i = 0, l = handlerQueue.length;
      i < l && !event.isPropagationStopped();
      i += 1
    ) {
      const matched = handlerQueue[i]
      event.currentTarget = matched.elem

      for (
        let j = 0, k = matched.handlers.length;
        j < k && !event.isImmediatePropagationStopped();
        j += 1
      ) {
        const handleObj = matched.handlers[j]
        // If event is namespaced, then each handler is only invoked if it is
        // specially universal or its namespaces are a superset of the event's.
        if (
          event.rnamespace == null ||
          (handleObj.namespace && event.rnamespace.test(handleObj.namespace))
        ) {
          // 恢复之前的操作数据
          event.handleObj = handleObj
          event.data = handleObj.data

          const hookHandle = EventHook.get(handleObj.originType).handle
          // console.log('dispatch 事件触发', handleObj.originType)

          const result = hookHandle
            ? hookHandle(matched.elem as Store.EventTarget, event, ...args)
            : handleObj.handler.call(matched.elem, event, ...args)
          if (result !== undefined) {
            event.result = result
            if (result === false) {
              event.preventDefault()
              event.stopPropagation()
            }
          }
        }
      }
    }

    // Call the postDispatch hook for the mapped type
    if (hook.postDispatch) {
      hook.postDispatch(elem, event)
    }

    return event.result
  }

  export function trigger(
    event:
      | (Partial<EventObject.Event> & { type: string })
      | EventObject
      | string,
    eventArgs: any,
    elem: Store.EventTarget,
    onlyHandlers?: boolean,
  ) {
    let eventObj = event as EventObject
    let type = typeof event === 'string' ? event : event.type
    let namespaces =
      typeof event === 'string' || eventObj.namespace == null
        ? []
        : eventObj.namespace.split('.')

    const node = elem as HTMLElement

    // Don't do events on text and comment nodes
    if (node.nodeType === 3 || node.nodeType === 8) {
      return
    }

    if (type.indexOf('.') > -1) {
      // Namespaced trigger; create a regexp to match event type in handle()
      namespaces = type.split('.')
      type = namespaces.shift()!
      namespaces.sort()
    }
    const ontype = type.indexOf(':') < 0 && (`on${type}` as 'onclick')

    // Caller can pass in a EventObject, Object, or just an event type string
    eventObj =
      event instanceof EventObject
        ? event
        : new EventObject(type, typeof event === 'object' ? event : null)

    eventObj.namespace = namespaces.join('.')
    eventObj.rnamespace = eventObj.namespace
      ? new RegExp(`(^|\\.)${namespaces.join('\\.(?:.*\\.|)')}(\\.|$)`)
      : null

    // Clean up the event in case it is being reused
    eventObj.result = undefined
    if (!eventObj.target) {
      eventObj.target = node
    }

    const args: [EventObject, ...any[]] = [eventObj]
    if (Array.isArray(eventArgs)) {
      args.push(...eventArgs)
    } else {
      args.push(eventArgs)
    }

    const hook = EventHook.get(type)
    if (
      !onlyHandlers &&
      hook.trigger &&
      hook.trigger(node, eventObj, eventArgs) === false
    ) {
      return
    }

    let bubbleType

    // Determine event propagation path in advance, per W3C events spec.
    // Bubble up to document, then to window; watch for a global ownerDocument
    const eventPath = [node]
    if (!onlyHandlers && !hook.noBubble && !Util.isWindow(node)) {
      bubbleType = hook.delegateType || type

      let last: Document | HTMLElement = node
      let curr = node.parentNode as HTMLElement

      while (curr != null) {
        eventPath.push(curr)
        last = curr
        curr = curr.parentNode as HTMLElement
      }

      // Only add window if we got to document
      const doc = node.ownerDocument || document
      if ((last as any) === doc) {
        const win =
          (last as any).defaultView || (last as any).parentWindow || window
        eventPath.push(win)
      }
    }

    let lastElement = node
    // Fire handlers on the event path
    for (
      let i = 0, l = eventPath.length;
      i < l && !eventObj.isPropagationStopped();
      i += 1
    ) {
      const currElement = eventPath[i]
      lastElement = currElement

      eventObj.type = i > 1 ? (bubbleType as string) : hook.bindType || type

      // Custom handler
      const store = Store.get(currElement as Element)
      if (store) {
        if (store.events[eventObj.type] && store.handler) {
          store.handler.call(currElement, ...args)
        }
      }

      // Native handler
      const handle = (ontype && currElement[ontype]) || null
      if (handle && Util.isValidTarget(currElement)) {
        eventObj.result = handle.call(currElement, ...args)
        if (eventObj.result === false) {
          eventObj.preventDefault()
        }
      }
    }

    eventObj.type = type

    // If nobody prevented the default action, do it now
    if (!onlyHandlers && !eventObj.isDefaultPrevented()) {
      const preventDefault = hook.preventDefault
      if (
        (preventDefault == null ||
          preventDefault(eventPath.pop()!, eventObj, eventArgs) === false) &&
        Util.isValidTarget(node)
      ) {
        // Call a native DOM method on the target with the same name as the
        // event. Don't do default actions on window.
        if (
          ontype &&
          typeof node[type as 'click'] === 'function' &&
          !Util.isWindow(node)
        ) {
          // Don't re-trigger an onFOO event when we call its FOO() method
          const tmp = node[ontype]
          if (tmp) {
            node[ontype] = null
          }

          // Prevent re-triggering of the same event, since we already bubbled it above
          triggered = type

          if (eventObj.isPropagationStopped()) {
            lastElement.addEventListener(type, Util.stopPropagationCallback)
          }

          node[type as 'click']()

          if (eventObj.isPropagationStopped()) {
            lastElement.removeEventListener(type, Util.stopPropagationCallback)
          }

          triggered = undefined

          if (tmp) {
            node[ontype] = tmp
          }
        }
      }
    }

    return eventObj.result
  }
}

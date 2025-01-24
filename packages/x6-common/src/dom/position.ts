import { computeStyle, computeStyleInt } from './css'
import { isElement } from './elem'

export function offset(elem: Element) {
  const rect = elem.getBoundingClientRect()
  const win = elem.ownerDocument.defaultView!

  return {
    top: rect.top + win.pageYOffset,
    left: rect.left + win.pageXOffset,
  }
}

export function width(elem: Element) {
  const rect = elem.getBoundingClientRect()
  return rect.width
}

export function height(elem: Element) {
  const rect = elem.getBoundingClientRect()
  return rect.height
}
/**
 * 计算元素相对于父元素的绝对定位
 * @param elem 
 * @returns 
 */
export function position(elem: Element) {
  const isFixed = computeStyle(elem, 'position') === 'fixed'
  let offsetValue: ReturnType<typeof offset>
  if (isFixed) {
    const rect = elem.getBoundingClientRect()
    offsetValue = { left: rect.left, top: rect.top }
  } else {
    offsetValue = offset(elem)
  }

  if (!isFixed) {
    const doc = elem.ownerDocument
    let offsetParent = (elem as any).offsetParent || doc.documentElement
    while (
      (offsetParent === doc.body || offsetParent === doc.documentElement) &&
      computeStyle(offsetParent, 'position') === 'static'
    ) {
      // 如果 offsetParent 是 body 或 html 并且其定位属性为 static，则继续寻找更高层的定位父元素
      offsetParent = offsetParent.parentNode
    }
    if (offsetParent !== elem && isElement(offsetParent)) {
      const parentOffset = offset(offsetParent)
      offsetValue.top -=
        parentOffset.top + computeStyleInt(offsetParent, 'borderTopWidth')
      offsetValue.left -=
        parentOffset.left + computeStyleInt(offsetParent, 'borderLeftWidth')
    }
  }

  return {
    top: offsetValue.top - computeStyleInt(elem, 'marginTop'),
    left: offsetValue.left - computeStyleInt(elem, 'marginLeft'),
  }
}

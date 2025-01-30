/* eslint-disable no-underscore-dangle */

import {
  ArrayExt,
  StringExt,
  ObjectExt,
  FunctionExt,
  KeyValue,
  Size,
  Basecoat,
} from '@antv/x6-common'
import { Rectangle, Point } from '@antv/x6-geometry'
import { NonUndefined } from 'utility-types'
import { Attr } from '../registry'
import { Model } from './model'
import { PortManager } from './port'
import { Store } from './store'
import { Edge } from './edge'
import { Animation } from './animation'
import { CellView, Markup } from '../view'
import { Node } from './node'
import { Graph } from '../graph'

export class Cell<
  Properties extends Cell.Properties = Cell.Properties,
> extends Basecoat<Cell.EventArgs> {
  // #region static

  protected static markup: Markup
  protected static defaults: Cell.Defaults = {}
  protected static attrHooks: Attr.Definitions = {}
  protected static propHooks: Cell.PropHook[] = []

  public static config<C extends Cell.Config = Cell.Config>(presets: C) {
    const { markup, propHooks, attrHooks, ...others } = presets

    if (markup != null) {
      this.markup = markup
    }

    if (propHooks) {
      this.propHooks = this.propHooks.slice()
      if (Array.isArray(propHooks)) {
        this.propHooks.push(...propHooks)
      } else if (typeof propHooks === 'function') {
        this.propHooks.push(propHooks)
      } else {
        Object.values(propHooks).forEach((hook) => {
          if (typeof hook === 'function') {
            this.propHooks.push(hook)
          }
        })
      }
    }

    if (attrHooks) {
      this.attrHooks = { ...this.attrHooks, ...attrHooks }
    }

    this.defaults = ObjectExt.merge({}, this.defaults, others)
  }

  public static getMarkup() {
    return this.markup
  }

  public static getDefaults<T extends Cell.Defaults = Cell.Defaults>(
    raw?: boolean,
  ): T {
    return (raw ? this.defaults : ObjectExt.cloneDeep(this.defaults)) as T
  }

  public static getAttrHooks() {
    return this.attrHooks
  }

  public static applyPropHooks(
    cell: Cell,
    metadata: Cell.Metadata,
  ): Cell.Metadata {
    return this.propHooks.reduce((memo, hook) => {
      return hook ? FunctionExt.call(hook, cell, memo) : memo
    }, metadata)
  }

  // #endregion

  protected get [Symbol.toStringTag]() {
    return Cell.toStringTag
  }

  public readonly id: string
  protected readonly store: Store<Cell.Properties>
  protected readonly animation: Animation
  protected _model: Model | null // eslint-disable-line
  protected _parent: Cell | null // eslint-disable-line
  protected _children: Cell[] | null // eslint-disable-line

  constructor(metadata: Cell.Metadata = {}) {
    super()

    const ctor = this.constructor as typeof Cell
    const defaults = ctor.getDefaults(true)
    const props = ObjectExt.merge(
      {},
      this.preprocess(defaults),
      this.preprocess(metadata),
    )

    this.id = props.id || StringExt.uuid()
    this.store = new Store(props)
    this.animation = new Animation(this)
    this.setup()
    this.init()
    this.postprocess(metadata)
  }

  init() {}

  // #region model

  get model() {
    return this._model
  }

  set model(model: Model | null) {
    if (this._model !== model) {
      this._model = model
    }
  }

  // #endregion

  protected preprocess(
    metadata: Cell.Metadata,
    ignoreIdCheck?: boolean,
  ): Properties {
    const id = metadata.id
    const ctor = this.constructor as typeof Cell
    const props = ctor.applyPropHooks(this, metadata)

    if (id == null && ignoreIdCheck !== true) {
      props.id = StringExt.uuid()
    }

    return props as Properties
  }

  protected postprocess(metadata: Cell.Metadata) {} // eslint-disable-line

  protected setup() {
    this.store.on('change:*', (metadata) => {
      const { key, current, previous, options } = metadata

      this.notify('change:*', {
        key,
        options,
        current,
        previous,
        cell: this,
      })

      this.notify(`change:${key}` as keyof Cell.EventArgs, {
        options,
        current,
        previous,
        cell: this,
      })

      const type = key as Edge.TerminalType
      if (type === 'source' || type === 'target') {
        this.notify(`change:terminal`, {
          type,
          current,
          previous,
          options,
          cell: this,
        })
      }
    })

    this.store.on('changed', ({ options }) =>
      this.notify('changed', { options, cell: this }),
    )
  }

  notify<Key extends keyof Cell.EventArgs>(
    name: Key,
    args: Cell.EventArgs[Key],
  ): this
  notify(name: Exclude<string, keyof Cell.EventArgs>, args: any): this
  notify<Key extends keyof Cell.EventArgs>(
    name: Key,
    args: Cell.EventArgs[Key],
  ) {
    this.trigger(name, args)
    const model = this.model
    if (model) {
      model.notify(`cell:${name}`, args)
      if (this.isNode()) {
        model.notify(`node:${name}`, { ...args, node: this })
      } else if (this.isEdge()) {
        model.notify(`edge:${name}`, { ...args, edge: this })
      }
    }
    return this
  }

  isNode(): this is Node {
    return false
  }

  isEdge(): this is Edge {
    return false
  }

  isSameStore(cell: Cell) {
    return this.store === cell.store
  }

  get view() {
    return this.store.get('view')
  }

  get shape() {
    return this.store.get('shape', '')
  }

  // #region get/set

  getProp(): Properties
  getProp<K extends keyof Properties>(key: K): Properties[K]
  getProp<K extends keyof Properties>(
    key: K,
    defaultValue: Properties[K],
  ): NonUndefined<Properties[K]>
  getProp<T>(key: string): T
  getProp<T>(key: string, defaultValue: T): T
  getProp(key?: string, defaultValue?: any) {
    if (key == null) {
      return this.store.get()
    }

    return this.store.get(key, defaultValue)
  }

  setProp<K extends keyof Properties>(
    key: K,
    value: Properties[K] | null | undefined | void,
    options?: Cell.SetOptions,
  ): this
  setProp(key: string, value: any, options?: Cell.SetOptions): this
  setProp(props: Partial<Properties>, options?: Cell.SetOptions): this
  setProp(
    key: string | Partial<Properties>,
    value?: any,
    options?: Cell.SetOptions,
  ) {
    if (typeof key === 'string') {
      this.store.set(key, value, options)
    } else {
      const props = this.preprocess(key, true)
      this.store.set(ObjectExt.merge({}, this.getProp(), props), value)
      this.postprocess(key)
    }
    return this
  }

  removeProp<K extends keyof Properties>(
    key: K | K[],
    options?: Cell.SetOptions,
  ): this
  removeProp(key: string | string[], options?: Cell.SetOptions): this
  removeProp(options?: Cell.SetOptions): this
  removeProp(
    key?: string | string[] | Cell.SetOptions,
    options?: Cell.SetOptions,
  ) {
    if (typeof key === 'string' || Array.isArray(key)) {
      this.store.removeByPath(key, options)
    } else {
      this.store.remove(options)
    }
    return this
  }

  hasChanged(): boolean
  hasChanged<K extends keyof Properties>(key: K | null): boolean
  hasChanged(key: string | null): boolean
  hasChanged(key?: string | null) {
    return key == null ? this.store.hasChanged() : this.store.hasChanged(key)
  }

  getPropByPath<T>(path: string | string[]) {
    return this.store.getByPath<T>(path)
  }

  setPropByPath(
    path: string | string[],
    value: any,
    options: Cell.SetByPathOptions = {},
  ) {
    if (this.model) {
      // update inner reference
      if (path === 'children') {
        this._children = value
          ? value
              .map((id: string) => this.model!.getCell(id))
              .filter((child: Cell) => child != null)
          : null
      } else if (path === 'parent') {
        this._parent = value ? this.model.getCell(value) : null
      }
    }

    this.store.setByPath(path, value, options)
    return this
  }

  removePropByPath(path: string | string[], options: Cell.SetOptions = {}) {
    const paths = Array.isArray(path) ? path : path.split('/')
    // Once a property is removed from the `attrs` the CellView will
    // recognize a `dirty` flag and re-render itself in order to remove
    // the attribute from SVGElement.
    if (paths[0] === 'attrs') {
      options.dirty = true
    }
    this.store.removeByPath(paths, options)
    return this
  }

  prop(): Properties
  prop<K extends keyof Properties>(key: K): Properties[K]
  prop<T>(key: string): T
  prop<T>(path: string[]): T
  prop<K extends keyof Properties>(
    key: K,
    value: Properties[K] | null | undefined | void,
    options?: Cell.SetOptions,
  ): this
  prop(key: string, value: any, options?: Cell.SetOptions): this
  prop(path: string[], value: any, options?: Cell.SetOptions): this
  prop(props: Partial<Properties>, options?: Cell.SetOptions): this
  prop(
    key?: string | string[] | Partial<Properties>,
    value?: any,
    options?: Cell.SetOptions,
  ) {
    if (key == null) {
      return this.getProp()
    }

    if (typeof key === 'string' || Array.isArray(key)) {
      if (arguments.length === 1) {
        return this.getPropByPath(key)
      }

      if (value == null) {
        return this.removePropByPath(key, options || {})
      }

      return this.setPropByPath(key, value, options || {})
    }

    return this.setProp(key, value || {})
  }

  previous<K extends keyof Properties>(name: K): Properties[K] | undefined
  previous<T>(name: string): T | undefined
  previous(name: string) {
    return this.store.getPrevious(name as keyof Cell.Properties)
  }

  // #endregion

  // #region zIndex

  get zIndex() {
    return this.getZIndex()
  }

  set zIndex(z: number | undefined | null) {
    if (z == null) {
      this.removeZIndex()
    } else {
      this.setZIndex(z)
    }
  }

  getZIndex() {
    return this.store.get('zIndex')
  }

  setZIndex(z: number, options: Cell.SetOptions = {}) {
    this.store.set('zIndex', z, options)
    return this
  }

  removeZIndex(options: Cell.SetOptions = {}) {
    this.store.remove('zIndex', options)
    return this
  }

  toFront(options: Cell.ToFrontOptions = {}) {
    const model = this.model
    if (model) {
      let z = model.getMaxZIndex()
      let cells: Cell[]
      if (options.deep) {
        cells = this.getDescendants({ deep: true, breadthFirst: true })
        cells.unshift(this)
      } else {
        cells = [this]
      }

      z = z - cells.length + 1

      const count = model.total()
      let changed = model.indexOf(this) !== count - cells.length
      if (!changed) {
        changed = cells.some((cell, index) => cell.getZIndex() !== z + index)
      }

      if (changed) {
        this.batchUpdate('to-front', () => {
          z += cells.length
          cells.forEach((cell, index) => {
            cell.setZIndex(z + index, options)
          })
        })
      }
    }

    return this
  }

  toBack(options: Cell.ToBackOptions = {}) {
    const model = this.model
    if (model) {
      let z = model.getMinZIndex()
      let cells: Cell[]

      if (options.deep) {
        cells = this.getDescendants({ deep: true, breadthFirst: true })
        cells.unshift(this)
      } else {
        cells = [this]
      }

      let changed = model.indexOf(this) !== 0
      if (!changed) {
        changed = cells.some((cell, index) => cell.getZIndex() !== z + index)
      }

      if (changed) {
        this.batchUpdate('to-back', () => {
          z -= cells.length
          cells.forEach((cell, index) => {
            cell.setZIndex(z + index, options)
          })
        })
      }
    }

    return this
  }

  // #endregion

  // #region markup

  get markup() {
    return this.getMarkup()
  }

  set markup(value: Markup | undefined | null) {
    if (value == null) {
      this.removeMarkup()
    } else {
      this.setMarkup(value)
    }
  }

  getMarkup() {
    let markup = this.store.get('markup')
    if (markup == null) {
      const ctor = this.constructor as typeof Cell
      markup = ctor.getMarkup()
    }
    return markup
  }

  setMarkup(markup: Markup, options: Cell.SetOptions = {}) {
    this.store.set('markup', markup, options)
    return this
  }

  removeMarkup(options: Cell.SetOptions = {}) {
    this.store.remove('markup', options)
    return this
  }

  // #endregion

  // #region attrs

  get attrs() {
    return this.getAttrs()
  }

  set attrs(value: Attr.CellAttrs | null | undefined) {
    if (value == null) {
      this.removeAttrs()
    } else {
      this.setAttrs(value)
    }
  }

  getAttrs() {
    const result = this.store.get('attrs')
    return result ? { ...result } : {}
  }

  setAttrs(
    attrs: Attr.CellAttrs | null | undefined,
    options: Cell.SetAttrOptions = {},
  ) {
    if (attrs == null) {
      this.removeAttrs(options)
    } else {
      const set = (attrs: Attr.CellAttrs) =>
        this.store.set('attrs', attrs, options)

      if (options.overwrite === true) {
        set(attrs)
      } else {
        const prev = this.getAttrs()
        if (options.deep === false) {
          set({ ...prev, ...attrs })
        } else {
          set(ObjectExt.merge({}, prev, attrs))
        }
      }
    }

    return this
  }

  replaceAttrs(attrs: Attr.CellAttrs, options: Cell.SetOptions = {}) {
    return this.setAttrs(attrs, { ...options, overwrite: true })
  }

  updateAttrs(attrs: Attr.CellAttrs, options: Cell.SetOptions = {}) {
    return this.setAttrs(attrs, { ...options, deep: false })
  }

  removeAttrs(options: Cell.SetOptions = {}) {
    this.store.remove('attrs', options)
    return this
  }

  getAttrDefinition(attrName: string) {
    if (!attrName) {
      return null
    }

    const ctor = this.constructor as typeof Cell
    const hooks = ctor.getAttrHooks() || {}
    let definition = hooks[attrName] || Attr.registry.get(attrName)
    if (!definition) {
      const name = StringExt.camelCase(attrName)
      definition = hooks[name] || Attr.registry.get(name)
    }

    return definition || null
  }

  getAttrByPath(): Attr.CellAttrs
  getAttrByPath<T>(path: string | string[]): T
  getAttrByPath<T>(path?: string | string[]) {
    if (path == null || path === '') {
      return this.getAttrs()
    }
    return this.getPropByPath<T>(this.prefixAttrPath(path))
  }

  setAttrByPath(
    path: string | string[],
    value: Attr.ComplexAttrValue,
    options: Cell.SetOptions = {},
  ) {
    this.setPropByPath(this.prefixAttrPath(path), value, options)
    return this
  }

  removeAttrByPath(path: string | string[], options: Cell.SetOptions = {}) {
    this.removePropByPath(this.prefixAttrPath(path), options)
    return this
  }

  protected prefixAttrPath(path: string | string[]) {
    return Array.isArray(path) ? ['attrs'].concat(path) : `attrs/${path}`
  }

  attr(): Attr.CellAttrs
  attr<T>(path: string | string[]): T
  attr(
    path: string | string[],
    value: Attr.ComplexAttrValue | null,
    options?: Cell.SetOptions,
  ): this
  attr(attrs: Attr.CellAttrs, options?: Cell.SetAttrOptions): this
  attr(
    path?: string | string[] | Attr.CellAttrs,
    value?: Attr.ComplexAttrValue | Cell.SetOptions,
    options?: Cell.SetOptions,
  ) {
    if (path == null) {
      return this.getAttrByPath()
    }

    if (typeof path === 'string' || Array.isArray(path)) {
      if (arguments.length === 1) {
        return this.getAttrByPath(path)
      }
      if (value == null) {
        return this.removeAttrByPath(path, options || {})
      }
      return this.setAttrByPath(
        path,
        value as Attr.ComplexAttrValue,
        options || {},
      )
    }

    return this.setAttrs(path, (value || {}) as Cell.SetOptions)
  }

  // #endregion

  // #region visible

  get visible() {
    return this.isVisible()
  }

  set visible(value: boolean) {
    this.setVisible(value)
  }

  setVisible(visible: boolean, options: Cell.SetOptions = {}) {
    this.store.set('visible', visible, options)
    return this
  }

  isVisible() {
    return this.store.get('visible') !== false
  }

  show(options: Cell.SetOptions = {}) {
    if (!this.isVisible()) {
      this.setVisible(true, options)
    }
    return this
  }

  hide(options: Cell.SetOptions = {}) {
    if (this.isVisible()) {
      this.setVisible(false, options)
    }
    return this
  }

  toggleVisible(visible: boolean, options?: Cell.SetOptions): this
  toggleVisible(options?: Cell.SetOptions): this
  toggleVisible(
    isVisible?: boolean | Cell.SetOptions,
    options: Cell.SetOptions = {},
  ) {
    const visible =
      typeof isVisible === 'boolean' ? isVisible : !this.isVisible()
    const localOptions = typeof isVisible === 'boolean' ? options : isVisible
    if (visible) {
      this.show(localOptions)
    } else {
      this.hide(localOptions)
    }
    return this
  }

  // #endregion

  // #region data

  get data(): Properties['data'] {
    return this.getData()
  }

  set data(val: Properties['data']) {
    this.setData(val)
  }

  getData<T = Properties['data']>(): T {
    return this.store.get<T>('data')
  }

  setData<T = Properties['data']>(data: T, options: Cell.SetDataOptions = {}) {
    if (data == null) {
      this.removeData(options)
    } else {
      const set = (data: T) => this.store.set('data', data, options)

      if (options.overwrite === true) {
        set(data)
      } else {
        const prev = this.getData<Record<string, any>>()
        if (options.deep === false) {
          set(typeof data === 'object' ? { ...prev, ...data } : data)
        } else {
          set(ObjectExt.merge({}, prev, data))
        }
      }
    }

    return this
  }

  setDataSilently<T = Properties['data']>(
    data: T,
    options: Cell.SetOptions = {},
  ) {
    return this.setData(data, { ...options, silent: true })
  }

  replaceData<T = Properties['data']>(data: T, options: Cell.SetOptions = {}) {
    return this.setData(data, { ...options, overwrite: true })
  }

  updateData<T = Properties['data']>(data: T, options: Cell.SetOptions = {}) {
    return this.setData(data, { ...options, deep: false })
  }

  removeData(options: Cell.SetOptions = {}) {
    this.store.remove('data', options)
    return this
  }

  // #endregion

  // #region parent children

  get parent(): Cell | null {
    return this.getParent()
  }

  get children() {
    return this.getChildren()
  }

  getParentId() {
    return this.store.get('parent')
  }

  getParent<T extends Cell = Cell>(): T | null {
    const parentId = this.getParentId()
    if (parentId && this.model) {
      const parent = this.model.getCell<T>(parentId)
      this._parent = parent
      return parent
    }
    return null
  }

  getChildren() {
    const childrenIds = this.store.get('children')
    if (childrenIds && childrenIds.length && this.model) {
      const children = childrenIds
        .map((id) => this.model?.getCell(id))
        .filter((cell) => cell != null) as Cell[]
      this._children = children
      return [...children]
    }
    return null
  }

  hasParent() {
    return this.parent != null
  }

  isParentOf(child: Cell | null): boolean {
    return child != null && child.getParent() === this
  }

  isChildOf(parent: Cell | null): boolean {
    return parent != null && this.getParent() === parent
  }

  eachChild(
    iterator: (child: Cell, index: number, children: Cell[]) => void,
    context?: any,
  ) {
    if (this.children) {
      this.children.forEach(iterator, context)
    }
    return this
  }

  filterChild(
    filter: (cell: Cell, index: number, arr: Cell[]) => boolean,
    context?: any,
  ): Cell[] {
    return this.children ? this.children.filter(filter, context) : []
  }

  getChildCount() {
    return this.children == null ? 0 : this.children.length
  }

  getChildIndex(child: Cell) {
    return this.children == null ? -1 : this.children.indexOf(child)
  }

  getChildAt(index: number) {
    return this.children != null && index >= 0 ? this.children[index] : null
  }

  getAncestors(options: { deep?: boolean } = {}): Cell[] {
    const ancestors: Cell[] = []
    let parent = this.getParent()
    while (parent) {
      ancestors.push(parent)
      parent = options.deep !== false ? parent.getParent() : null
    }
    return ancestors
  }

  getDescendants(options: Cell.GetDescendantsOptions = {}): Cell[] {
    if (options.deep !== false) {
      // breadth first
      if (options.breadthFirst) {
        const cells = []
        const queue = this.getChildren() || []

        while (queue.length > 0) {
          const parent = queue.shift()!
          const children = parent.getChildren()
          cells.push(parent)
          if (children) {
            queue.push(...children)
          }
        }
        return cells
      }

      // depth first
      {
        const cells = this.getChildren() || []
        cells.forEach((cell) => {
          cells.push(...cell.getDescendants(options))
        })
        return cells
      }
    }

    return this.getChildren() || []
  }

  isDescendantOf(
    ancestor: Cell | null,
    options: { deep?: boolean } = {},
  ): boolean {
    if (ancestor == null) {
      return false
    }

    if (options.deep !== false) {
      let current = this.getParent()
      while (current) {
        if (current === ancestor) {
          return true
        }
        current = current.getParent()
      }

      return false
    }

    return this.isChildOf(ancestor)
  }

  isAncestorOf(
    descendant: Cell | null,
    options: { deep?: boolean } = {},
  ): boolean {
    if (descendant == null) {
      return false
    }

    return descendant.isDescendantOf(this, options)
  }

  contains(cell: Cell | null) {
    return this.isAncestorOf(cell)
  }

  getCommonAncestor(...cells: (Cell | null | undefined)[]): Cell | null {
    return Cell.getCommonAncestor(this, ...cells)
  }

  setParent(parent: Cell | null, options: Cell.SetOptions = {}) {
    this._parent = parent
    if (parent) {
      this.store.set('parent', parent.id, options)
    } else {
      this.store.remove('parent', options)
    }
    return this
  }

  setChildren(children: Cell[] | null, options: Cell.SetOptions = {}) {
    this._children = children
    if (children != null) {
      this.store.set(
        'children',
        children.map((child) => child.id),
        options,
      )
    } else {
      this.store.remove('children', options)
    }
    return this
  }

  unembed(child: Cell, options: Cell.SetOptions = {}) {
    const children = this.children
    if (children != null && child != null) {
      const index = this.getChildIndex(child)
      if (index !== -1) {
        children.splice(index, 1)
        child.setParent(null, options)
        this.setChildren(children, options)
      }
    }
    return this
  }

  embed(child: Cell, options: Cell.SetOptions = {}) {
    child.addTo(this, options)
    return this
  }

  addTo(model: Model, options?: Cell.SetOptions): this
  addTo(graph: Graph, options?: Cell.SetOptions): this
  addTo(parent: Cell, options?: Cell.SetOptions): this
  addTo(target: Model | Graph | Cell, options: Cell.SetOptions = {}) {
    if (Cell.isCell(target)) {
      target.addChild(this, options)
    } else {
      target.addCell(this, options)
    }
    return this
  }

  insertTo(parent: Cell, index?: number, options: Cell.SetOptions = {}) {
    parent.insertChild(this, index, options)
    return this
  }

  addChild(child: Cell | null, options: Cell.SetOptions = {}) {
    return this.insertChild(child, undefined, options)
  }

  insertChild(
    child: Cell | null,
    index?: number,
    options: Cell.SetOptions = {},
  ): this {
    if (child != null && child !== this) {
      const oldParent = child.getParent()
      const changed = this !== oldParent

      let pos = index
      if (pos == null) {
        pos = this.getChildCount()
        if (!changed) {
          pos -= 1
        }
      }

      // remove from old parent
      if (oldParent) {
        const children = oldParent.getChildren()
        if (children) {
          const index = children.indexOf(child)
          if (index >= 0) {
            child.setParent(null, options)
            children.splice(index, 1)
            oldParent.setChildren(children, options)
          }
        }
      }

      let children = this.children
      if (children == null) {
        children = []
        children.push(child)
      } else {
        children.splice(pos, 0, child)
      }

      child.setParent(this, options)
      this.setChildren(children, options)

      if (changed && this.model) {
        const incomings = this.model.getIncomingEdges(this)
        const outgoings = this.model.getOutgoingEdges(this)

        if (incomings) {
          incomings.forEach((edge) => edge.updateParent(options))
        }

        if (outgoings) {
          outgoings.forEach((edge) => edge.updateParent(options))
        }
      }

      if (this.model) {
        this.model.addCell(child, options)
      }
    }

    return this
  }

  removeFromParent(options: Cell.RemoveOptions = {}) {
    const parent = this.getParent()
    if (parent != null) {
      const index = parent.getChildIndex(this)
      parent.removeChildAt(index, options)
    }
    return this
  }

  removeChild(child: Cell, options: Cell.RemoveOptions = {}) {
    const index = this.getChildIndex(child)
    return this.removeChildAt(index, options)
  }

  removeChildAt(index: number, options: Cell.RemoveOptions = {}) {
    const child = this.getChildAt(index)
    const children = this.children

    if (children != null && child != null) {
      this.unembed(child, options)
      child.remove(options)
    }

    return child
  }

  remove(options: Cell.RemoveOptions = {}) {
    this.batchUpdate('remove', () => {
      const parent = this.getParent()
      if (parent) {
        parent.removeChild(this, options)
      }

      if (options.deep !== false) {
        this.eachChild((child) => child.remove(options))
      }

      if (this.model) {
        this.model.removeCell(this, options)
      }
    })
    return this
  }

  // #endregion

  // #region transition

  transition<K extends keyof Properties>(
    path: K,
    target: Properties[K],
    options?: Animation.StartOptions<Properties[K]>,
    delim?: string,
  ): () => void
  transition<T extends Animation.TargetValue>(
    path: string | string[],
    target: T,
    options?: Animation.StartOptions<T>,
    delim?: string,
  ): () => void
  transition<T extends Animation.TargetValue>(
    path: string | string[],
    target: T,
    options: Animation.StartOptions<T> = {},
    delim = '/',
  ) {
    return this.animation.start(path, target, options, delim)
  }

  stopTransition<T extends Animation.TargetValue>(
    path: string | string[],
    options?: Animation.StopOptions<T>,
    delim = '/',
  ) {
    this.animation.stop(path, options, delim)
    return this
  }

  getTransitions() {
    return this.animation.get()
  }

  // #endregion

  // #region transform

  // eslint-disable-next-line
  translate(tx: number, ty: number, options?: Cell.TranslateOptions) {
    return this
  }

  scale(
    sx: number, // eslint-disable-line
    sy: number, // eslint-disable-line
    origin?: Point | Point.PointLike, // eslint-disable-line
    options?: Node.SetOptions, // eslint-disable-line
  ) {
    return this
  }

  // #endregion

  // #region tools

  addTools(
    items: Cell.ToolItem | Cell.ToolItem[],
    options?: Cell.AddToolOptions,
  ): void
  addTools(
    items: Cell.ToolItem | Cell.ToolItem[],
    name: string,
    options?: Cell.AddToolOptions,
  ): void
  addTools(
    items: Cell.ToolItem | Cell.ToolItem[],
    obj?: string | Cell.AddToolOptions,
    options?: Cell.AddToolOptions,
  ) {
    const toolItems = Array.isArray(items) ? items : [items]
    const name = typeof obj === 'string' ? obj : null
    const config =
      typeof obj === 'object' ? obj : typeof options === 'object' ? options : {}

    if (config.reset) {
      return this.setTools(
        { name, items: toolItems, local: config.local },
        config,
      )
    }
    let tools = ObjectExt.cloneDeep(this.getTools())
    if (tools == null || name == null || tools.name === name) {
      if (tools == null) {
        tools = {} as Cell.Tools
      }

      if (!tools.items) {
        tools.items = []
      }

      tools.name = name
      tools.items = [...tools.items, ...toolItems]

      return this.setTools({ ...tools }, config)
    }
  }

  setTools(tools?: Cell.ToolsLoose | null, options: Cell.SetOptions = {}) {
    if (tools == null) {
      this.removeTools()
    } else {
      this.store.set('tools', Cell.normalizeTools(tools), options)
    }
    return this
  }

  getTools(): Cell.Tools | null {
    return this.store.get<Cell.Tools>('tools')
  }

  removeTools(options: Cell.SetOptions = {}) {
    this.store.remove('tools', options)
    return this
  }

  hasTools(name?: string) {
    const tools = this.getTools()
    if (tools == null) {
      return false
    }

    if (name == null) {
      return true
    }

    return tools.name === name
  }

  hasTool(name: string) {
    const tools = this.getTools()
    if (tools == null) {
      return false
    }
    return tools.items.some((item) =>
      typeof item === 'string' ? item === name : item.name === name,
    )
  }

  removeTool(name: string, options?: Cell.SetOptions): this
  removeTool(index: number, options?: Cell.SetOptions): this
  removeTool(nameOrIndex: string | number, options: Cell.SetOptions = {}) {
    const tools = ObjectExt.cloneDeep(this.getTools())
    if (tools) {
      let updated = false
      const items = tools.items.slice()
      const remove = (index: number) => {
        items.splice(index, 1)
        updated = true
      }

      if (typeof nameOrIndex === 'number') {
        remove(nameOrIndex)
      } else {
        for (let i = items.length - 1; i >= 0; i -= 1) {
          const item = items[i]
          const exist =
            typeof item === 'string'
              ? item === nameOrIndex
              : item.name === nameOrIndex
          if (exist) {
            remove(i)
          }
        }
      }

      if (updated) {
        tools.items = items
        this.setTools(tools, options)
      }
    }
    return this
  }

  // #endregion

  // #region common

  // eslint-disable-next-line
  getBBox(options?: { deep?: boolean }) {
    return new Rectangle()
  }

  // eslint-disable-next-line
  getConnectionPoint(edge: Edge, type: Edge.TerminalType) {
    return new Point()
  }

  toJSON(
    options: Cell.ToJSONOptions = {},
  ): this extends Node
    ? Node.Properties
    : this extends Edge
    ? Edge.Properties
    : Properties {
    const props = { ...this.store.get() }
    const toString = Object.prototype.toString
    const cellType = this.isNode() ? 'node' : this.isEdge() ? 'edge' : 'cell'

    if (!props.shape) {
      const ctor = this.constructor
      throw new Error(
        `Unable to serialize ${cellType} missing "shape" prop, check the ${cellType} "${
          ctor.name || toString.call(ctor)
        }"`,
      )
    }

    const ctor = this.constructor as typeof Cell
    const diff = options.diff === true
    const attrs = props.attrs || {}
    const presets = ctor.getDefaults(true) as Properties
    // When `options.diff` is `true`, we should process the custom options,
    // such as `width`, `height` etc. to ensure the comparing work correctly.
    const defaults = diff ? this.preprocess(presets, true) : presets
    const defaultAttrs = defaults.attrs || {}
    const finalAttrs: Attr.CellAttrs = {}

    Object.entries(props).forEach(([key, val]) => {
      if (
        val != null &&
        !Array.isArray(val) &&
        typeof val === 'object' &&
        !ObjectExt.isPlainObject(val)
      ) {
        throw new Error(
          `Can only serialize ${cellType} with plain-object props, but got a "${toString.call(
            val,
          )}" type of key "${key}" on ${cellType} "${this.id}"`,
        )
      }

      if (key !== 'attrs' && key !== 'shape' && diff) {
        const preset = defaults[key]
        if (ObjectExt.isEqual(val, preset)) {
          delete props[key]
        }
      }
    })

    Object.keys(attrs).forEach((key) => {
      const attr = attrs[key]
      const defaultAttr = defaultAttrs[key]

      Object.keys(attr).forEach((name) => {
        const value = attr[name] as KeyValue
        const defaultValue = defaultAttr ? defaultAttr[name] : null

        if (
          value != null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          Object.keys(value).forEach((subName) => {
            const subValue = value[subName]
            if (
              defaultAttr == null ||
              defaultValue == null ||
              !ObjectExt.isObject(defaultValue) ||
              !ObjectExt.isEqual(defaultValue[subName], subValue)
            ) {
              if (finalAttrs[key] == null) {
                finalAttrs[key] = {}
              }
              if (finalAttrs[key][name] == null) {
                finalAttrs[key][name] = {}
              }
              const tmp = finalAttrs[key][name] as KeyValue
              tmp[subName] = subValue
            }
          })
        } else if (
          defaultAttr == null ||
          !ObjectExt.isEqual(defaultValue, value)
        ) {
          // `value` is not an object, default attribute with `key` does not
          // exist or it is different than the attribute value set on the cell.
          if (finalAttrs[key] == null) {
            finalAttrs[key] = {}
          }
          finalAttrs[key][name] = value as any
        }
      })
    })

    const finalProps = {
      ...props,
      attrs: ObjectExt.isEmpty(finalAttrs) ? undefined : finalAttrs,
    }

    if (finalProps.attrs == null) {
      delete finalProps.attrs
    }

    const ret = finalProps as any
    if (ret.angle === 0) {
      delete ret.angle
    }

    return ObjectExt.cloneDeep(ret)
  }

  clone(
    options: Cell.CloneOptions = {},
  ): this extends Node ? Node : this extends Edge ? Edge : Cell {
    if (!options.deep) {
      const data = { ...this.store.get() }
      if (!options.keepId) {
        delete data.id
      }
      delete data.parent
      delete data.children
      const ctor = this.constructor as typeof Cell
      return new ctor(data) as any // eslint-disable-line new-cap
    }

    // Deep cloning. Clone the cell itself and all its children.
    const map = Cell.deepClone(this)
    return map[this.id] as any
  }

  findView(graph: Graph): CellView | null {
    return graph.findViewByCell(this)
  }

  // #endregion

  // #region batch

  startBatch(
    name: Model.BatchName,
    data: KeyValue = {},
    model: Model | null = this.model,
  ) {
    this.notify('batch:start', { name, data, cell: this })

    if (model) {
      model.startBatch(name, { ...data, cell: this })
    }

    return this
  }

  stopBatch(
    name: Model.BatchName,
    data: KeyValue = {},
    model: Model | null = this.model,
  ) {
    if (model) {
      model.stopBatch(name, { ...data, cell: this })
    }

    this.notify('batch:stop', { name, data, cell: this })
    return this
  }

  batchUpdate<T>(name: Model.BatchName, execute: () => T, data?: KeyValue): T {
    // The model is null after cell was removed(remove batch).
    // So we should temp save model to trigger pairing batch event.
    const model = this.model
    this.startBatch(name, data, model)
    const result = execute()
    this.stopBatch(name, data, model)
    return result
  }

  // #endregion

  // #region IDisposable

  @Basecoat.dispose()
  dispose() {
    this.removeFromParent()
    this.store.dispose()
  }

  // #endregion
}

export namespace Cell {
  export interface Common {
    view?: string
    shape?: string
    markup?: Markup
    attrs?: Attr.CellAttrs
    zIndex?: number
    visible?: boolean
    data?: any
  }

  export interface Defaults extends Common {}

  export interface Metadata extends Common, KeyValue {
    id?: string
    tools?: ToolsLoose
  }

  export interface Properties extends Defaults, Metadata {
    parent?: string
    children?: string[]
    tools?: Tools
  }
}

export namespace Cell {
  export type ToolItem =
    | string
    | {
        name: string
        args?: any
      }

  export interface Tools {
    name?: string | null
    local?: boolean
    items: ToolItem[]
  }

  export type ToolsLoose = ToolItem | ToolItem[] | Tools

  export function normalizeTools(raw: ToolsLoose): Tools {
    if (typeof raw === 'string') {
      return { items: [raw] }
    }

    if (Array.isArray(raw)) {
      return { items: raw }
    }

    if ((raw as Tools).items) {
      return raw as Tools
    }

    return {
      items: [raw as ToolItem],
    }
  }
}

export namespace Cell {
  export interface SetOptions extends Store.SetOptions {}

  export interface MutateOptions extends Store.MutateOptions {}

  export interface RemoveOptions extends SetOptions {
    deep?: boolean
  }

  export interface SetAttrOptions extends SetOptions {
    deep?: boolean
    overwrite?: boolean
  }

  export interface SetDataOptions extends SetOptions {
    deep?: boolean
    overwrite?: boolean
  }

  export interface SetByPathOptions extends Store.SetByPathOptions {}

  export interface ToFrontOptions extends SetOptions {
    deep?: boolean
  }

  export interface ToBackOptions extends ToFrontOptions {}

  export interface TranslateOptions extends SetOptions {
    tx?: number
    ty?: number
    translateBy?: string | number
  }

  export interface AddToolOptions extends SetOptions {
    reset?: boolean
    local?: boolean
  }

  export interface GetDescendantsOptions {
    deep?: boolean
    breadthFirst?: boolean
  }

  export interface ToJSONOptions {
    diff?: boolean
  }

  export interface CloneOptions {
    deep?: boolean
    keepId?: boolean
  }
}

export namespace Cell {
  export interface EventArgs {
    'transition:start': Animation.CallbackArgs<Animation.TargetValue>
    'transition:progress': Animation.ProgressArgs<Animation.TargetValue>
    'transition:complete': Animation.CallbackArgs<Animation.TargetValue>
    'transition:stop': Animation.StopArgs<Animation.TargetValue>
    'transition:finish': Animation.CallbackArgs<Animation.TargetValue>

    // common
    'change:*': ChangeAnyKeyArgs
    'change:attrs': ChangeArgs<Attr.CellAttrs>
    'change:zIndex': ChangeArgs<number>
    'change:markup': ChangeArgs<Markup>
    'change:visible': ChangeArgs<boolean>
    'change:parent': ChangeArgs<string>
    'change:children': ChangeArgs<string[]>
    'change:tools': ChangeArgs<Tools>
    'change:view': ChangeArgs<string>
    'change:data': ChangeArgs<any>

    // node
    'change:size': NodeChangeArgs<Size>
    'change:angle': NodeChangeArgs<number>
    'change:position': NodeChangeArgs<Point.PointLike>
    'change:ports': NodeChangeArgs<PortManager.Port[]>
    'change:portMarkup': NodeChangeArgs<Markup>
    'change:portLabelMarkup': NodeChangeArgs<Markup>
    'change:portContainerMarkup': NodeChangeArgs<Markup>
    'ports:removed': {
      cell: Cell
      node: Node
      removed: PortManager.Port[]
    }
    'ports:added': {
      cell: Cell
      node: Node
      added: PortManager.Port[]
    }

    // edge
    'change:source': EdgeChangeArgs<Edge.TerminalData>
    'change:target': EdgeChangeArgs<Edge.TerminalData>
    'change:terminal': EdgeChangeArgs<Edge.TerminalData> & {
      type: Edge.TerminalType
    }
    'change:router': EdgeChangeArgs<Edge.RouterData>
    'change:connector': EdgeChangeArgs<Edge.ConnectorData>
    'change:vertices': EdgeChangeArgs<Point.PointLike[]>
    'change:labels': EdgeChangeArgs<Edge.Label[]>
    'change:defaultLabel': EdgeChangeArgs<Edge.Label>
    'vertexs:added': {
      cell: Cell
      edge: Edge
      added: Point.PointLike[]
    }
    'vertexs:removed': {
      cell: Cell
      edge: Edge
      removed: Point.PointLike[]
    }
    'labels:added': {
      cell: Cell
      edge: Edge
      added: Edge.Label[]
    }
    'labels:removed': {
      cell: Cell
      edge: Edge
      removed: Edge.Label[]
    }

    'batch:start': {
      name: Model.BatchName
      data: KeyValue
      cell: Cell
    }

    'batch:stop': {
      name: Model.BatchName
      data: KeyValue
      cell: Cell
    }

    changed: {
      cell: Cell
      options: MutateOptions
    }

    added: {
      cell: Cell
      index: number
      options: Cell.SetOptions
    }

    removed: {
      cell: Cell
      index: number
      options: Cell.RemoveOptions
    }
  }

  interface ChangeAnyKeyArgs<T extends keyof Properties = keyof Properties> {
    key: T
    current: Properties[T]
    previous: Properties[T]
    options: MutateOptions
    cell: Cell
  }

  export interface ChangeArgs<T> {
    cell: Cell
    current?: T
    previous?: T
    options: MutateOptions
  }

  interface NodeChangeArgs<T> extends ChangeArgs<T> {
    node: Node
  }

  interface EdgeChangeArgs<T> extends ChangeArgs<T> {
    edge: Edge
  }
}

export namespace Cell {
  export const toStringTag = `X6.${Cell.name}`

  export function isCell(instance: any): instance is Cell {
    if (instance == null) {
      return false
    }

    if (instance instanceof Cell) {
      return true
    }

    const tag = instance[Symbol.toStringTag]
    const cell = instance as Cell

    if (
      (tag == null || tag === toStringTag) &&
      typeof cell.isNode === 'function' &&
      typeof cell.isEdge === 'function' &&
      typeof cell.prop === 'function' &&
      typeof cell.attr === 'function'
    ) {
      return true
    }

    return false
  }
}

export namespace Cell {
  export function getCommonAncestor(
    ...cells: (Cell | null | undefined)[]
  ): Cell | null {
    const ancestors = cells
      .filter((cell) => cell != null)
      .map((cell) => cell!.getAncestors())
      .sort((a, b) => {
        return a.length - b.length
      })

    const first = ancestors.shift()!
    return (
      first.find((cell) => ancestors.every((item) => item.includes(cell))) ||
      null
    )
  }

  export interface GetCellsBBoxOptions {
    deep?: boolean
  }

  export function getCellsBBox(
    cells: Cell[],
    options: GetCellsBBoxOptions = {},
  ) {
    let bbox: Rectangle | null = null

    for (let i = 0, ii = cells.length; i < ii; i += 1) {
      const cell = cells[i]
      let rect = cell.getBBox(options)
      if (rect) {
        if (cell.isNode()) {
          const angle = cell.getAngle()
          if (angle != null && angle !== 0) {
            rect = rect.bbox(angle)
          }
        }
        bbox = bbox == null ? rect : bbox.union(rect)
      }
    }

    return bbox
  }

  export function deepClone(cell: Cell) {
    const cells = [cell, ...cell.getDescendants({ deep: true })]
    return Cell.cloneCells(cells)
  }

  export function cloneCells(cells: Cell[]) {
    const inputs = ArrayExt.uniq(cells)
    const cloneMap = inputs.reduce<KeyValue<Cell>>((map, cell) => {
      map[cell.id] = cell.clone()
      return map
    }, {})

    inputs.forEach((cell) => {
      const clone = cloneMap[cell.id]
      if (clone.isEdge()) {
        const sourceId = clone.getSourceCellId()
        const targetId = clone.getTargetCellId()
        if (sourceId && cloneMap[sourceId]) {
          // Source is a node and the node is among the clones.
          // Then update the source of the cloned edge.
          clone.setSource({
            ...clone.getSource(),
            cell: cloneMap[sourceId].id,
          })
        }
        if (targetId && cloneMap[targetId]) {
          // Target is a node and the node is among the clones.
          // Then update the target of the cloned edge.
          clone.setTarget({
            ...clone.getTarget(),
            cell: cloneMap[targetId].id,
          })
        }
      }

      // Find the parent of the original cell
      const parent = cell.getParent()
      if (parent && cloneMap[parent.id]) {
        clone.setParent(cloneMap[parent.id])
      }

      // Find the children of the original cell
      const children = cell.getChildren()
      if (children && children.length) {
        const embeds = children.reduce<Cell[]>((memo, child) => {
          // Embedded cells that are not being cloned can not be carried
          // over with other embedded cells.
          if (cloneMap[child.id]) {
            memo.push(cloneMap[child.id])
          }
          return memo
        }, [])

        if (embeds.length > 0) {
          clone.setChildren(embeds)
        }
      }
    })

    return cloneMap
  }
}

export namespace Cell {
  export type Definition = typeof Cell

  export type PropHook<M extends Metadata = Metadata, C extends Cell = Cell> = (
    this: C,
    metadata: M,
  ) => M

  export type PropHooks<M extends Metadata = Metadata, C extends Cell = Cell> =
    | KeyValue<PropHook<M, C>>
    | PropHook<M, C>
    | PropHook<M, C>[]

  export interface Config<M extends Metadata = Metadata, C extends Cell = Cell>
    extends Defaults,
      KeyValue {
    constructorName?: string
    overwrite?: boolean
    propHooks?: PropHooks<M, C>
    attrHooks?: Attr.Definitions
  }
}

export namespace Cell {
  Cell.config({
    propHooks({ tools, ...metadata }) {
      if (tools) {
        metadata.tools = normalizeTools(tools)
      }
      return metadata
    },
  })
}

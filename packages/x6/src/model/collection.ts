import { ArrayExt, Basecoat } from '@antv/x6-common'
import { Cell } from './cell'
import { Node } from './node'
import { Edge } from './edge'

export class Collection extends Basecoat<Collection.EventArgs> {
  public length = 0
  public comparator: Collection.Comparator | null
  private cells: Cell[]
  private map: { [id: string]: Cell }

  constructor(cells: Cell | Cell[], options: Collection.Options = {}) {
    super()
    this.comparator = options.comparator || 'zIndex'
    this.clean()
    if (cells) {
      this.reset(cells, { silent: true })
    }
  }

  toJSON() {
    return this.cells.map((cell) => cell.toJSON())
  }

  add(cells: Cell | Cell[], options?: Collection.AddOptions): this
  add(
    cells: Cell | Cell[],
    index: number,
    options?: Collection.AddOptions,
  ): this
  add(
    cells: Cell | Cell[],
    index?: number | Collection.AddOptions,
    options?: Collection.AddOptions,
  ) {
    let localIndex: number
    let localOptions: Collection.AddOptions

    if (typeof index === 'number') {
      localIndex = index
      localOptions = { merge: false, ...options }
    } else {
      localIndex = this.length
      localOptions = { merge: false, ...index }
    }

    if (localIndex > this.length) {
      localIndex = this.length
    }
    if (localIndex < 0) {
      localIndex += this.length + 1
    }

    const entities = Array.isArray(cells) ? cells : [cells]
    const sortable =
      this.comparator &&
      typeof index !== 'number' &&
      localOptions.sort !== false
    const sortAttr = this.comparator || null

    let sort = false
    const added: Cell[] = []
    const merged: Cell[] = []

    entities.forEach((cell) => {
      const existing = this.get(cell)
      if (existing) {
        if (localOptions.merge && !cell.isSameStore(existing)) {
          existing.setProp(cell.getProp(), options) // merge
          merged.push(existing)
          if (sortable && !sort) {
            if (sortAttr == null || typeof sortAttr === 'function') {
              sort = existing.hasChanged()
            } else if (typeof sortAttr === 'string') {
              sort = existing.hasChanged(sortAttr)
            } else {
              sort = sortAttr.some((key) => existing.hasChanged(key))
            }
          }
        }
      } else {
        added.push(cell)
        this.reference(cell)
      }
    })

    if (added.length) {
      if (sortable) {
        sort = true
      }
      this.cells.splice(localIndex, 0, ...added)
      this.length = this.cells.length
    }

    if (sort) {
      this.sort({ silent: true })
    }

    if (!localOptions.silent) {
      added.forEach((cell, i) => {
        const args = {
          cell,
          index: localIndex + i,
          options: localOptions,
        }
        this.trigger('added', args)
        if (!localOptions.dryrun) {
          // 元素添加后触发added事件，从而创建对应的CellView对象(NodeView、EdgeView )
          // 会触发model.notify('cell:added')事件，Scheduler 监听了model.on('cell:added')事件，从而在Scheduler中创建对应的CellView对象(NodeView、EdgeView )
          cell.notify('added', { ...args })
        }
      })

      if (sort) {
        this.trigger('sorted')
      }

      if (added.length || merged.length) {
        this.trigger('updated', {
          added,
          merged,
          removed: [],
          options: localOptions,
        })
      }
    }

    return this
  }

  remove(cell: Cell, options?: Collection.RemoveOptions): Cell
  remove(cells: Cell[], options?: Collection.RemoveOptions): Cell[]
  remove(cells: Cell | Cell[], options: Collection.RemoveOptions = {}) {
    const arr = Array.isArray(cells) ? cells : [cells]
    const removed = this.removeCells(arr, options)
    if (!options.silent && removed.length > 0) {
      this.trigger('updated', {
        options,
        removed,
        added: [],
        merged: [],
      })
    }
    return Array.isArray(cells) ? removed : removed[0]
  }

  protected removeCells(cells: Cell[], options: Collection.RemoveOptions) {
    const removed = []

    for (let i = 0; i < cells.length; i += 1) {
      const cell = this.get(cells[i])
      if (cell == null) {
        continue
      }

      const index = this.cells.indexOf(cell)
      this.cells.splice(index, 1)
      this.length -= 1
      delete this.map[cell.id]
      removed.push(cell)
      this.unreference(cell)

      if (!options.dryrun) {
        cell.remove()
      }

      if (!options.silent) {
        this.trigger('removed', { cell, index, options })

        if (!options.dryrun) {
          cell.notify('removed', { cell, index, options })
        }
      }
    }

    return removed
  }

  reset(cells: Cell | Cell[], options: Collection.SetOptions = {}) {
    const previous = this.cells.slice()
    previous.forEach((cell) => this.unreference(cell))
    this.clean()
    this.add(cells, { silent: true, ...options })
    if (!options.silent) {
      const current = this.cells.slice()
      this.trigger('reseted', {
        options,
        previous,
        current,
      })

      const added: Cell[] = []
      const removed: Cell[] = []

      current.forEach((a) => {
        const exist = previous.some((b) => b.id === a.id)
        if (!exist) {
          added.push(a)
        }
      })

      previous.forEach((a) => {
        const exist = current.some((b) => b.id === a.id)
        if (!exist) {
          removed.push(a)
        }
      })

      this.trigger('updated', { options, added, removed, merged: [] })
    }

    return this
  }

  push(cell: Cell, options?: Collection.SetOptions) {
    return this.add(cell, this.length, options)
  }

  pop(options?: Collection.SetOptions) {
    const cell = this.at(this.length - 1)!
    return this.remove(cell, options)
  }

  unshift(cell: Cell, options?: Collection.SetOptions) {
    return this.add(cell, 0, options)
  }

  shift(options?: Collection.SetOptions) {
    const cell = this.at(0)!
    return this.remove(cell, options)
  }

  get(cell?: string | number | Cell | null): Cell | null {
    if (cell == null) {
      return null
    }

    const id =
      typeof cell === 'string' || typeof cell === 'number' ? cell : cell.id
    return this.map[id] || null
  }

  has(cell: string | Cell): boolean {
    return this.get(cell as any) != null
  }

  at(index: number): Cell | null {
    if (index < 0) {
      index += this.length // eslint-disable-line
    }
    return this.cells[index] || null
  }

  first() {
    return this.at(0)
  }

  last() {
    return this.at(-1)
  }

  indexOf(cell: Cell) {
    return this.cells.indexOf(cell)
  }

  toArray() {
    return this.cells.slice()
  }

  sort(options: Collection.SetOptions = {}) {
    if (this.comparator != null) {
      this.cells = ArrayExt.sortBy(this.cells, this.comparator)
      if (!options.silent) {
        this.trigger('sorted')
      }
    }

    return this
  }

  clone() {
    const constructor = this.constructor as any
    return new constructor(this.cells.slice(), {
      comparator: this.comparator,
    }) as Collection
  }

  protected reference(cell: Cell) {
    this.map[cell.id] = cell
    cell.on('*', this.notifyCellEvent, this)
  }

  protected unreference(cell: Cell) {
    cell.off('*', this.notifyCellEvent, this)
    delete this.map[cell.id]
  }

  protected notifyCellEvent<K extends keyof Cell.EventArgs>(
    name: K,
    args: Cell.EventArgs[K],
  ) {
    const cell = args.cell
    this.trigger(`cell:${name}`, args)
    if (cell) {
      if (cell.isNode()) {
        this.trigger(`node:${name}`, { ...args, node: cell })
      } else if (cell.isEdge()) {
        this.trigger(`edge:${name}`, { ...args, edge: cell })
      }
    }
  }

  protected clean() {
    this.length = 0
    this.cells = []
    this.map = {}
  }

  @Collection.dispose()
  dispose() {
    this.reset([])
  }
}

export namespace Collection {
  export type Comparator = string | string[] | ((cell: Cell) => number)

  export interface Options {
    comparator?: Comparator
  }

  export interface SetOptions extends Cell.SetOptions {}

  export interface RemoveOptions extends Cell.SetOptions {
    /**
     * The default is to remove all the associated links.
     * Set `disconnectEdges` option to `true` to disconnect edges
     * when a cell is removed.
     */
    disconnectEdges?: boolean

    dryrun?: boolean
  }

  export interface AddOptions extends SetOptions {
    sort?: boolean
    merge?: boolean
    dryrun?: boolean
  }
}

export namespace Collection {
  export interface EventArgs
    extends CellEventArgs,
      NodeEventArgs,
      EdgeEventArgs {
    sorted?: null
    reseted: {
      current: Cell[]
      previous: Cell[]
      options: SetOptions
    }
    updated: {
      added: Cell[]
      merged: Cell[]
      removed: Cell[]
      options: SetOptions
    }
    added: {
      cell: Cell
      index: number
      options: AddOptions
    }
    removed: {
      cell: Cell
      index: number
      options: RemoveOptions
    }
  }

  interface NodeEventCommonArgs {
    node: Node
  }

  interface EdgeEventCommonArgs {
    edge: Edge
  }

  export interface CellEventArgs {
    'cell:transition:start': Cell.EventArgs['transition:start']
    'cell:transition:progress': Cell.EventArgs['transition:progress']
    'cell:transition:complete': Cell.EventArgs['transition:complete']
    'cell:transition:stop': Cell.EventArgs['transition:stop']
    'cell:transition:finish': Cell.EventArgs['transition:finish']

    'cell:changed': Cell.EventArgs['changed']
    'cell:added': Cell.EventArgs['added']
    'cell:removed': Cell.EventArgs['removed']

    'cell:change:*': Cell.EventArgs['change:*']
    'cell:change:attrs': Cell.EventArgs['change:attrs']
    'cell:change:zIndex': Cell.EventArgs['change:zIndex']
    'cell:change:markup': Cell.EventArgs['change:markup']
    'cell:change:visible': Cell.EventArgs['change:visible']
    'cell:change:parent': Cell.EventArgs['change:parent']
    'cell:change:children': Cell.EventArgs['change:children']
    'cell:change:tools': Cell.EventArgs['change:tools']
    'cell:change:view': Cell.EventArgs['change:view']
    'cell:change:data': Cell.EventArgs['change:data']

    'cell:change:size': Cell.EventArgs['change:size']
    'cell:change:angle': Cell.EventArgs['change:angle']
    'cell:change:position': Cell.EventArgs['change:position']
    'cell:change:ports': Cell.EventArgs['change:ports']
    'cell:change:portMarkup': Cell.EventArgs['change:portMarkup']
    'cell:change:portLabelMarkup': Cell.EventArgs['change:portLabelMarkup']
    'cell:change:portContainerMarkup': Cell.EventArgs['change:portContainerMarkup']
    'cell:ports:added': Cell.EventArgs['ports:added']
    'cell:ports:removed': Cell.EventArgs['ports:removed']

    'cell:change:source': Cell.EventArgs['change:source']
    'cell:change:target': Cell.EventArgs['change:target']
    'cell:change:router': Cell.EventArgs['change:router']
    'cell:change:connector': Cell.EventArgs['change:connector']
    'cell:change:vertices': Cell.EventArgs['change:vertices']
    'cell:change:labels': Cell.EventArgs['change:labels']
    'cell:change:defaultLabel': Cell.EventArgs['change:defaultLabel']
    'cell:vertexs:added': Cell.EventArgs['vertexs:added']
    'cell:vertexs:removed': Cell.EventArgs['vertexs:removed']
    'cell:labels:added': Cell.EventArgs['labels:added']
    'cell:labels:removed': Cell.EventArgs['labels:removed']

    'cell:batch:start': Cell.EventArgs['batch:start']
    'cell:batch:stop': Cell.EventArgs['batch:stop']
  }

  export interface NodeEventArgs {
    'node:transition:start': NodeEventCommonArgs &
      Cell.EventArgs['transition:start']
    'node:transition:progress': NodeEventCommonArgs &
      Cell.EventArgs['transition:progress']
    'node:transition:complete': NodeEventCommonArgs &
      Cell.EventArgs['transition:complete']
    'node:transition:stop': NodeEventCommonArgs &
      Cell.EventArgs['transition:stop']
    'node:transition:finish': NodeEventCommonArgs &
      Cell.EventArgs['transition:finish']

    'node:changed': NodeEventCommonArgs & CellEventArgs['cell:changed']
    'node:added': NodeEventCommonArgs & CellEventArgs['cell:added']
    'node:removed': NodeEventCommonArgs & CellEventArgs['cell:removed']

    'node:change:*': NodeEventCommonArgs & Cell.EventArgs['change:*']
    'node:change:attrs': NodeEventCommonArgs & Cell.EventArgs['change:attrs']
    'node:change:zIndex': NodeEventCommonArgs & Cell.EventArgs['change:zIndex']
    'node:change:markup': NodeEventCommonArgs & Cell.EventArgs['change:markup']
    'node:change:visible': NodeEventCommonArgs &
      Cell.EventArgs['change:visible']
    'node:change:parent': NodeEventCommonArgs & Cell.EventArgs['change:parent']
    'node:change:children': NodeEventCommonArgs &
      Cell.EventArgs['change:children']
    'node:change:tools': NodeEventCommonArgs & Cell.EventArgs['change:tools']
    'node:change:view': NodeEventCommonArgs & Cell.EventArgs['change:view']
    'node:change:data': NodeEventCommonArgs & Cell.EventArgs['change:data']

    'node:change:size': NodeEventCommonArgs & Cell.EventArgs['change:size']
    'node:change:position': NodeEventCommonArgs &
      Cell.EventArgs['change:position']
    'node:change:angle': NodeEventCommonArgs & Cell.EventArgs['change:angle']
    'node:change:ports': NodeEventCommonArgs & Cell.EventArgs['change:ports']
    'node:change:portMarkup': NodeEventCommonArgs &
      Cell.EventArgs['change:portMarkup']
    'node:change:portLabelMarkup': NodeEventCommonArgs &
      Cell.EventArgs['change:portLabelMarkup']
    'node:change:portContainerMarkup': NodeEventCommonArgs &
      Cell.EventArgs['change:portContainerMarkup']
    'node:ports:added': NodeEventCommonArgs & Cell.EventArgs['ports:added']
    'node:ports:removed': NodeEventCommonArgs & Cell.EventArgs['ports:removed']

    'node:batch:start': NodeEventCommonArgs & Cell.EventArgs['batch:start']
    'node:batch:stop': NodeEventCommonArgs & Cell.EventArgs['batch:stop']

    // 'node:translate': NodeEventCommonArgs
    // 'node:translating': NodeEventCommonArgs
    // 'node:translated': NodeEventCommonArgs
    // 'node:resize': NodeEventCommonArgs
    // 'node:resizing': NodeEventCommonArgs
    // 'node:resized': NodeEventCommonArgs
    // 'node:rotate': NodeEventCommonArgs
    // 'node:rotating': NodeEventCommonArgs
    // 'node:rotated': NodeEventCommonArgs
  }

  export interface EdgeEventArgs {
    'edge:transition:start': EdgeEventCommonArgs &
      Cell.EventArgs['transition:start']
    'edge:transition:progress': EdgeEventCommonArgs &
      Cell.EventArgs['transition:progress']
    'edge:transition:complete': EdgeEventCommonArgs &
      Cell.EventArgs['transition:complete']
    'edge:transition:stop': EdgeEventCommonArgs &
      Cell.EventArgs['transition:stop']
    'edge:transition:finish': EdgeEventCommonArgs &
      Cell.EventArgs['transition:finish']

    'edge:changed': EdgeEventCommonArgs & CellEventArgs['cell:changed']
    'edge:added': EdgeEventCommonArgs & CellEventArgs['cell:added']
    'edge:removed': EdgeEventCommonArgs & CellEventArgs['cell:removed']

    'edge:change:*': EdgeEventCommonArgs & Cell.EventArgs['change:*']
    'edge:change:attrs': EdgeEventCommonArgs & Cell.EventArgs['change:attrs']
    'edge:change:zIndex': EdgeEventCommonArgs & Cell.EventArgs['change:zIndex']
    'edge:change:markup': EdgeEventCommonArgs & Cell.EventArgs['change:markup']
    'edge:change:visible': EdgeEventCommonArgs &
      Cell.EventArgs['change:visible']
    'edge:change:parent': EdgeEventCommonArgs & Cell.EventArgs['change:parent']
    'edge:change:children': EdgeEventCommonArgs &
      Cell.EventArgs['change:children']
    'edge:change:tools': EdgeEventCommonArgs & Cell.EventArgs['change:tools']
    'edge:change:data': EdgeEventCommonArgs & Cell.EventArgs['change:data']

    'edge:change:source': EdgeEventCommonArgs & Cell.EventArgs['change:source']
    'edge:change:target': EdgeEventCommonArgs & Cell.EventArgs['change:target']
    'edge:change:router': EdgeEventCommonArgs & Cell.EventArgs['change:router']
    'edge:change:connector': EdgeEventCommonArgs &
      Cell.EventArgs['change:connector']
    'edge:change:vertices': EdgeEventCommonArgs &
      Cell.EventArgs['change:vertices']
    'edge:change:labels': EdgeEventCommonArgs & Cell.EventArgs['change:labels']
    'edge:change:defaultLabel': EdgeEventCommonArgs &
      Cell.EventArgs['change:defaultLabel']
    'edge:vertexs:added': EdgeEventCommonArgs & Cell.EventArgs['vertexs:added']
    'edge:vertexs:removed': EdgeEventCommonArgs &
      Cell.EventArgs['vertexs:removed']
    'edge:labels:added': EdgeEventCommonArgs & Cell.EventArgs['labels:added']
    'edge:labels:removed': EdgeEventCommonArgs &
      Cell.EventArgs['labels:removed']

    'edge:batch:start': EdgeEventCommonArgs & Cell.EventArgs['batch:start']
    'edge:batch:stop': EdgeEventCommonArgs & Cell.EventArgs['batch:stop']
  }
}

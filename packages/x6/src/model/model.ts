import { FunctionExt, Dijkstra, KeyValue, Basecoat } from '@antv/x6-common'
import { Point, Rectangle } from '@antv/x6-geometry'
import { Cell } from './cell'
import { Edge } from './edge'
import { Node } from './node'
import { Collection } from './collection'
import { Graph } from '../graph'

export class Model extends Basecoat<Model.EventArgs> {
  public readonly collection: Collection
  protected readonly batches: KeyValue<number> = {}
  protected readonly addings: WeakMap<Cell, boolean> = new WeakMap()
  public graph: Graph
  protected nodes: KeyValue<boolean> = {}
  protected edges: KeyValue<boolean> = {}
  protected outgoings: KeyValue<string[]> = {}
  protected incomings: KeyValue<string[]> = {}

  protected get [Symbol.toStringTag]() {
    return Model.toStringTag
  }

  constructor(cells: Cell[] = []) {
    super()
    this.collection = new Collection(cells)
    this.setup()
  }

  notify<Key extends keyof Model.EventArgs>(
    name: Key,
    args: Model.EventArgs[Key],
  ): this
  notify(name: Exclude<string, keyof Model.EventArgs>, args: any): this
  notify<Key extends keyof Model.EventArgs>(
    name: Key,
    args: Model.EventArgs[Key],
  ) {
    this.trigger(name, args)
    const graph = this.graph
    if (graph) {
      if (name === 'sorted' || name === 'reseted' || name === 'updated') {
        graph.trigger(`model:${name}`, args)
      } else {
        graph.trigger(name, args)
      }
    }
    return this
  }

  protected setup() {
    const collection = this.collection

    collection.on('sorted', () => this.notify('sorted', null))
    collection.on('updated', (args) => this.notify('updated', args))
    collection.on('cell:change:zIndex', () => this.sortOnChangeZ())

    collection.on('added', ({ cell }) => {
      this.onCellAdded(cell)
    })

    collection.on('removed', (args) => {
      const cell = args.cell
      this.onCellRemoved(cell, args.options)

      // Should trigger remove-event manually after cell was removed.
      this.notify('cell:removed', args)
      if (cell.isNode()) {
        this.notify('node:removed', { ...args, node: cell })
      } else if (cell.isEdge()) {
        this.notify('edge:removed', { ...args, edge: cell })
      }
    })

    collection.on('reseted', (args) => {
      this.onReset(args.current)
      this.notify('reseted', args)
    })

    collection.on('edge:change:source', ({ edge }) =>
      this.onEdgeTerminalChanged(edge, 'source'),
    )

    collection.on('edge:change:target', ({ edge }) => {
      this.onEdgeTerminalChanged(edge, 'target')
    })
  }

  protected sortOnChangeZ() {
    this.collection.sort()
  }

  protected onCellAdded(cell: Cell) {
    const cellId = cell.id
    if (cell.isEdge()) {
      // Auto update edge's parent
      cell.updateParent()
      this.edges[cellId] = true
      this.onEdgeTerminalChanged(cell, 'source')
      this.onEdgeTerminalChanged(cell, 'target')
    } else {
      this.nodes[cellId] = true
    }
  }

  protected onCellRemoved(cell: Cell, options: Collection.RemoveOptions) {
    const cellId = cell.id
    if (cell.isEdge()) {
      delete this.edges[cellId]

      const source = cell.getSource() as Edge.TerminalCellData
      const target = cell.getTarget() as Edge.TerminalCellData
      if (source && source.cell) {
        const cache = this.outgoings[source.cell]
        const index = cache ? cache.indexOf(cellId) : -1
        if (index >= 0) {
          cache.splice(index, 1)
          if (cache.length === 0) {
            delete this.outgoings[source.cell]
          }
        }
      }

      if (target && target.cell) {
        const cache = this.incomings[target.cell]
        const index = cache ? cache.indexOf(cellId) : -1
        if (index >= 0) {
          cache.splice(index, 1)
          if (cache.length === 0) {
            delete this.incomings[target.cell]
          }
        }
      }
    } else {
      delete this.nodes[cellId]
    }

    if (!options.clear) {
      if (options.disconnectEdges) {
        this.disconnectConnectedEdges(cell, options)
      } else {
        this.removeConnectedEdges(cell, options)
      }
    }

    if (cell.model === this) {
      cell.model = null
    }
  }

  protected onReset(cells: Cell[]) {
    this.nodes = {}
    this.edges = {}
    this.outgoings = {}
    this.incomings = {}
    cells.forEach((cell) => this.onCellAdded(cell))
  }

  protected onEdgeTerminalChanged(edge: Edge, type: Edge.TerminalType) {
    const ref = type === 'source' ? this.outgoings : this.incomings
    const prev = edge.previous<Edge.TerminalCellLooseData>(type)

    if (prev && prev.cell) {
      const cellId = Cell.isCell(prev.cell) ? prev.cell.id : prev.cell
      const cache = ref[cellId]
      const index = cache ? cache.indexOf(edge.id) : -1
      if (index >= 0) {
        cache.splice(index, 1)
        if (cache.length === 0) {
          delete ref[cellId]
        }
      }
    }

    const terminal = edge.getTerminal(type) as Edge.TerminalCellLooseData
    if (terminal && terminal.cell) {
      const terminalId = Cell.isCell(terminal.cell)
        ? terminal.cell.id
        : terminal.cell
      const cache = ref[terminalId] || []
      const index = cache.indexOf(edge.id)
      if (index === -1) {
        cache.push(edge.id)
      }
      ref[terminalId] = cache
    }
  }

  protected prepareCell(cell: Cell, options: Collection.AddOptions) {
    if (!cell.model && (!options || !options.dryrun)) {
      cell.model = this
    }

    if (cell.zIndex == null) {
      cell.setZIndex(this.getMaxZIndex() + 1, { silent: true })
    }

    return cell
  }

  resetCells(cells: Cell[], options: Collection.SetOptions = {}) {
    // Do not update model at this time. Because if we just update the graph
    // with the same json-data, the edge will reference to the old nodes.
    cells.map((cell) => this.prepareCell(cell, { ...options, dryrun: true }))
    this.collection.reset(cells, options)
    // Update model and trigger edge update it's references
    cells.map((cell) => this.prepareCell(cell, { options }))
    return this
  }

  clear(options: Cell.SetOptions = {}) {
    const raw = this.getCells()
    if (raw.length === 0) {
      return this
    }
    const localOptions = { ...options, clear: true }
    this.batchUpdate(
      'clear',
      () => {
        // The nodes come after the edges.
        const cells = raw.sort((a, b) => {
          const v1 = a.isEdge() ? 1 : 2
          const v2 = b.isEdge() ? 1 : 2
          return v1 - v2
        })

        while (cells.length > 0) {
          // Note that all the edges are removed first, so it's safe to
          // remove the nodes without removing the connected edges first.
          const cell = cells.shift()
          if (cell) {
            cell.remove(localOptions)
          }
        }
      },
      localOptions,
    )

    return this
  }

  addNode(metadata: Node | Node.Metadata, options: Model.AddOptions = {}) {
    const node = Node.isNode(metadata) ? metadata : this.createNode(metadata)
    this.addCell(node, options)
    return node
  }

  updateNode(metadata: Node.Metadata, options: Model.SetOptions = {}) {
    const node = this.createNode(metadata)
    const prop = node.getProp()
    node.dispose()
    return this.updateCell(prop, options)
  }

  createNode(metadata: Node.Metadata) {
    return Node.create(metadata)
  }

  addEdge(metadata: Edge.Metadata | Edge, options: Model.AddOptions = {}) {
    const edge = Edge.isEdge(metadata) ? metadata : this.createEdge(metadata)
    this.addCell(edge, options)
    return edge
  }

  createEdge(metadata: Edge.Metadata) {
    return Edge.create(metadata)
  }

  updateEdge(metadata: Edge.Metadata, options: Model.SetOptions = {}) {
    const edge = this.createEdge(metadata)
    const prop = edge.getProp()
    edge.dispose()
    return this.updateCell(prop, options)
  }

  addCell(cell: Cell | Cell[], options: Model.AddOptions = {}) {
    if (Array.isArray(cell)) {
      return this.addCells(cell, options)
    }

    if (!this.collection.has(cell) && !this.addings.has(cell)) {
      this.addings.set(cell, true)
      this.collection.add(this.prepareCell(cell, options), options)
      cell.eachChild((child) => this.addCell(child, options))
      this.addings.delete(cell)
    }

    return this
  }

  addCells(cells: Cell[], options: Model.AddOptions = {}) {
    const count = cells.length
    if (count === 0) {
      return this
    }

    const localOptions = {
      ...options,
      position: count - 1,
      maxPosition: count - 1,
    }

    this.startBatch('add', { ...localOptions, cells })
    cells.forEach((cell) => {
      this.addCell(cell, localOptions)
      localOptions.position -= 1
    })
    this.stopBatch('add', { ...localOptions, cells })

    return this
  }

  updateCell(prop: Cell.Properties, options: Model.SetOptions = {}): boolean {
    const existing = prop.id && this.getCell(prop.id)
    if (existing) {
      return this.batchUpdate(
        'update',
        () => {
          Object.entries(prop).forEach(([key, val]) =>
            existing.setProp(key, val, options),
          )
          return true
        },
        prop,
      )
    }
    return false
  }

  removeCell(cellId: string, options?: Collection.RemoveOptions): Cell | null
  removeCell(cell: Cell, options?: Collection.RemoveOptions): Cell | null
  removeCell(
    obj: Cell | string,
    options: Collection.RemoveOptions = {},
  ): Cell | null {
    const cell = typeof obj === 'string' ? this.getCell(obj) : obj
    if (cell && this.has(cell)) {
      return this.collection.remove(cell, options)
    }
    return null
  }

  updateCellId(cell: Cell, newId: string) {
    if (cell.id === newId) return
    this.startBatch('update', { id: newId })
    cell.prop('id', newId)
    const newCell = cell.clone({ keepId: true })
    this.addCell(newCell)

    // update connected edge terminal
    const edges = this.getConnectedEdges(cell)
    edges.forEach((edge) => {
      const sourceCell = edge.getSourceCell()
      const targetCell = edge.getTargetCell()
      if (sourceCell === cell) {
        edge.setSource({
          ...edge.getSource(),
          cell: newId,
        })
      }
      if (targetCell === cell) {
        edge.setTarget({
          ...edge.getTarget(),
          cell: newId,
        })
      }
    })

    this.removeCell(cell)
    this.stopBatch('update', { id: newId })
    return newCell
  }

  removeCells(cells: (Cell | string)[], options: Cell.RemoveOptions = {}) {
    if (cells.length) {
      return this.batchUpdate('remove', () => {
        return cells.map((cell) => this.removeCell(cell as Cell, options))
      })
    }
    return []
  }

  removeConnectedEdges(cell: Cell | string, options: Cell.RemoveOptions = {}) {
    const edges = this.getConnectedEdges(cell)
    edges.forEach((edge) => {
      edge.remove(options)
    })
    return edges
  }

  disconnectConnectedEdges(cell: Cell | string, options: Edge.SetOptions = {}) {
    const cellId = typeof cell === 'string' ? cell : cell.id
    this.getConnectedEdges(cell).forEach((edge) => {
      const sourceCellId = edge.getSourceCellId()
      const targetCellId = edge.getTargetCellId()

      if (sourceCellId === cellId) {
        edge.setSource({ x: 0, y: 0 }, options)
      }

      if (targetCellId === cellId) {
        edge.setTarget({ x: 0, y: 0 }, options)
      }
    })
  }

  has(id: string): boolean
  has(cell: Cell): boolean
  has(obj: string | Cell): boolean {
    return this.collection.has(obj)
  }

  total() {
    return this.collection.length
  }

  indexOf(cell: Cell) {
    return this.collection.indexOf(cell)
  }

  /**
   * Returns a cell from the graph by its id.
   */
  getCell<T extends Cell = Cell>(id: string) {
    return this.collection.get(id) as T
  }

  /**
   * Returns all the nodes and edges in the graph.
   */
  getCells() {
    return this.collection.toArray()
  }

  /**
   * Returns the first cell (node or edge) in the graph. The first cell is
   * defined as the cell with the lowest `zIndex`.
   */
  getFirstCell() {
    return this.collection.first()
  }

  /**
   * Returns the last cell (node or edge) in the graph. The last cell is
   * defined as the cell with the highest `zIndex`.
   */
  getLastCell() {
    return this.collection.last()
  }

  /**
   * Returns the lowest `zIndex` value in the graph.
   */
  getMinZIndex() {
    const first = this.collection.first()
    return first ? first.getZIndex() || 0 : 0
  }

  /**
   * Returns the highest `zIndex` value in the graph.
   */
  getMaxZIndex() {
    const last = this.collection.last()
    return last ? last.getZIndex() || 0 : 0
  }

  protected getCellsFromCache<T extends Cell = Cell>(cache: {
    [key: string]: boolean
  }) {
    return cache
      ? Object.keys(cache)
          .map((id) => this.getCell<T>(id))
          .filter((cell) => cell != null)
      : []
  }

  /**
   * Returns all the nodes in the graph.
   */
  getNodes() {
    return this.getCellsFromCache<Node>(this.nodes)
  }

  /**
   * Returns all the edges in the graph.
   */
  getEdges() {
    return this.getCellsFromCache<Edge>(this.edges)
  }

  /**
   * Returns all outgoing edges for the node.
   */
  getOutgoingEdges(cell: Cell | string) {
    const cellId = typeof cell === 'string' ? cell : cell.id
    const cellIds = this.outgoings[cellId]
    return cellIds
      ? cellIds
          .map((id) => this.getCell(id) as Edge)
          .filter((cell) => cell && cell.isEdge())
      : null
  }

  /**
   * Returns all incoming edges for the node.
   */
  getIncomingEdges(cell: Cell | string) {
    const cellId = typeof cell === 'string' ? cell : cell.id
    const cellIds = this.incomings[cellId]
    return cellIds
      ? cellIds
          .map((id) => this.getCell(id) as Edge)
          .filter((cell) => cell && cell.isEdge())
      : null
  }

  /**
   * Returns edges connected with cell.
   */
  getConnectedEdges(
    cell: Cell | string,
    options: Model.GetConnectedEdgesOptions = {},
  ) {
    const result: Edge[] = []
    const node = typeof cell === 'string' ? this.getCell(cell) : cell
    if (node == null) {
      return result
    }

    const cache: { [id: string]: boolean } = {}
    const indirect = options.indirect
    let incoming = options.incoming
    let outgoing = options.outgoing
    if (incoming == null && outgoing == null) {
      incoming = outgoing = true
    }

    const collect = (cell: Cell, isOutgoing: boolean) => {
      const edges = isOutgoing
        ? this.getOutgoingEdges(cell)
        : this.getIncomingEdges(cell)

      if (edges != null) {
        edges.forEach((edge) => {
          if (cache[edge.id]) {
            return
          }

          result.push(edge)
          cache[edge.id] = true

          if (indirect) {
            if (incoming) {
              collect(edge, false)
            }

            if (outgoing) {
              collect(edge, true)
            }
          }
        })
      }

      if (indirect && cell.isEdge()) {
        const terminal = isOutgoing
          ? cell.getTargetCell()
          : cell.getSourceCell()
        if (terminal && terminal.isEdge()) {
          if (!cache[terminal.id]) {
            result.push(terminal)
            collect(terminal, isOutgoing)
          }
        }
      }
    }

    if (outgoing) {
      collect(node, true)
    }

    if (incoming) {
      collect(node, false)
    }

    if (options.deep) {
      const descendants = node.getDescendants({ deep: true })
      const embedsCache: KeyValue<boolean> = {}
      descendants.forEach((cell) => {
        if (cell.isNode()) {
          embedsCache[cell.id] = true
        }
      })

      const collectSub = (cell: Cell, isOutgoing: boolean) => {
        const edges = isOutgoing
          ? this.getOutgoingEdges(cell.id)
          : this.getIncomingEdges(cell.id)

        if (edges != null) {
          edges.forEach((edge) => {
            if (!cache[edge.id]) {
              const sourceCell = edge.getSourceCell()
              const targetCell = edge.getTargetCell()

              if (
                !options.enclosed &&
                sourceCell &&
                embedsCache[sourceCell.id] &&
                targetCell &&
                embedsCache[targetCell.id]
              ) {
                return
              }

              result.push(edge)
              cache[edge.id] = true
            }
          })
        }
      }

      descendants.forEach((cell) => {
        if (cell.isEdge()) {
          return
        }

        if (outgoing) {
          collectSub(cell, true)
        }

        if (incoming) {
          collectSub(cell, false)
        }
      })
    }

    return result
  }

  protected isBoundary(cell: Cell | string, isOrigin: boolean) {
    const node = typeof cell === 'string' ? this.getCell(cell) : cell
    const arr = isOrigin
      ? this.getIncomingEdges(node)
      : this.getOutgoingEdges(node)
    return arr == null || arr.length === 0
  }

  protected getBoundaryNodes(isOrigin: boolean) {
    const result: Node[] = []
    Object.keys(this.nodes).forEach((nodeId) => {
      if (this.isBoundary(nodeId, isOrigin)) {
        const node = this.getCell<Node>(nodeId)
        if (node) {
          result.push(node)
        }
      }
    })
    return result
  }

  /**
   * Returns an array of all the roots of the graph.
   */
  getRoots() {
    return this.getBoundaryNodes(true)
  }

  /**
   * Returns an array of all the leafs of the graph.
   */
  getLeafs() {
    return this.getBoundaryNodes(false)
  }

  /**
   * Returns `true` if the node is a root node, i.e. there is no edges
   * coming to the node.
   */
  isRoot(cell: Cell | string) {
    return this.isBoundary(cell, true)
  }

  /**
   * Returns `true` if the node is a leaf node, i.e. there is no edges
   * going out from the node.
   */
  isLeaf(cell: Cell | string) {
    return this.isBoundary(cell, false)
  }

  /**
   * Returns all the neighbors of node in the graph. Neighbors are all
   * the nodes connected to node via either incoming or outgoing edge.
   */
  getNeighbors(cell: Cell, options: Model.GetNeighborsOptions = {}) {
    let incoming = options.incoming
    let outgoing = options.outgoing
    if (incoming == null && outgoing == null) {
      incoming = outgoing = true
    }

    const edges = this.getConnectedEdges(cell, options)
    const map = edges.reduce<KeyValue<Cell>>((memo, edge) => {
      const hasLoop = edge.hasLoop(options)
      const sourceCell = edge.getSourceCell()
      const targetCell = edge.getTargetCell()

      if (
        incoming &&
        sourceCell &&
        sourceCell.isNode() &&
        !memo[sourceCell.id]
      ) {
        if (
          hasLoop ||
          (sourceCell !== cell &&
            (!options.deep || !sourceCell.isDescendantOf(cell)))
        ) {
          memo[sourceCell.id] = sourceCell
        }
      }

      if (
        outgoing &&
        targetCell &&
        targetCell.isNode() &&
        !memo[targetCell.id]
      ) {
        if (
          hasLoop ||
          (targetCell !== cell &&
            (!options.deep || !targetCell.isDescendantOf(cell)))
        ) {
          memo[targetCell.id] = targetCell
        }
      }

      return memo
    }, {})

    if (cell.isEdge()) {
      if (incoming) {
        const sourceCell = cell.getSourceCell()
        if (sourceCell && sourceCell.isNode() && !map[sourceCell.id]) {
          map[sourceCell.id] = sourceCell
        }
      }
      if (outgoing) {
        const targetCell = cell.getTargetCell()
        if (targetCell && targetCell.isNode() && !map[targetCell.id]) {
          map[targetCell.id] = targetCell
        }
      }
    }

    return Object.keys(map).map((id) => map[id])
  }

  /**
   * Returns `true` if `cell2` is a neighbor of `cell1`.
   */
  isNeighbor(
    cell1: Cell,
    cell2: Cell,
    options: Model.GetNeighborsOptions = {},
  ) {
    let incoming = options.incoming
    let outgoing = options.outgoing
    if (incoming == null && outgoing == null) {
      incoming = outgoing = true
    }

    return this.getConnectedEdges(cell1, options).some((edge) => {
      const sourceCell = edge.getSourceCell()
      const targetCell = edge.getTargetCell()

      if (incoming && sourceCell && sourceCell.id === cell2.id) {
        return true
      }

      if (outgoing && targetCell && targetCell.id === cell2.id) {
        return true
      }

      return false
    })
  }

  getSuccessors(cell: Cell, options: Model.GetPredecessorsOptions = {}) {
    const successors: Cell[] = []
    this.search(
      cell,
      (curr, distance) => {
        if (curr !== cell && this.matchDistance(distance, options.distance)) {
          successors.push(curr)
        }
      },
      { ...options, outgoing: true },
    )
    return successors
  }

  /**
   * Returns `true` if `cell2` is a successor of `cell1`.
   */
  isSuccessor(
    cell1: Cell,
    cell2: Cell,
    options: Model.GetPredecessorsOptions = {},
  ) {
    let result = false
    this.search(
      cell1,
      (curr, distance) => {
        if (
          curr === cell2 &&
          curr !== cell1 &&
          this.matchDistance(distance, options.distance)
        ) {
          result = true
          return false
        }
      },
      { ...options, outgoing: true },
    )
    return result
  }

  getPredecessors(cell: Cell, options: Model.GetPredecessorsOptions = {}) {
    const predecessors: Cell[] = []
    this.search(
      cell,
      (curr, distance) => {
        if (curr !== cell && this.matchDistance(distance, options.distance)) {
          predecessors.push(curr)
        }
      },
      { ...options, incoming: true },
    )
    return predecessors
  }

  /**
   * Returns `true` if `cell2` is a predecessor of `cell1`.
   */
  isPredecessor(
    cell1: Cell,
    cell2: Cell,
    options: Model.GetPredecessorsOptions = {},
  ) {
    let result = false
    this.search(
      cell1,
      (curr, distance) => {
        if (
          curr === cell2 &&
          curr !== cell1 &&
          this.matchDistance(distance, options.distance)
        ) {
          result = true
          return false
        }
      },
      { ...options, incoming: true },
    )
    return result
  }

  protected matchDistance(
    distance: number,
    preset?: number | number[] | ((d: number) => boolean),
  ) {
    if (preset == null) {
      return true
    }

    if (typeof preset === 'function') {
      return preset(distance)
    }

    if (Array.isArray(preset) && preset.includes(distance)) {
      return true
    }

    return distance === preset
  }

  /**
   * Returns the common ancestor of the passed cells.
   */
  getCommonAncestor(...cells: (Cell | Cell[] | null | undefined)[]) {
    const arr: Cell[] = []
    cells.forEach((item) => {
      if (item) {
        if (Array.isArray(item)) {
          arr.push(...item)
        } else {
          arr.push(item)
        }
      }
    })
    return Cell.getCommonAncestor(...arr)
  }

  /**
   * Returns an array of cells that result from finding nodes/edges that
   * are connected to any of the cells in the cells array. This function
   * loops over cells and if the current cell is a edge, it collects its
   * source/target nodes; if it is an node, it collects its incoming and
   * outgoing edges if both the edge terminal (source/target) are in the
   * cells array.
   */
  getSubGraph(cells: Cell[], options: Model.GetSubgraphOptions = {}) {
    const subgraph: Cell[] = []
    const cache: KeyValue<Cell> = {}
    const nodes: Node[] = []
    const edges: Edge[] = []
    const collect = (cell: Cell) => {
      if (!cache[cell.id]) {
        subgraph.push(cell)
        cache[cell.id] = cell
        if (cell.isEdge()) {
          edges.push(cell)
        }

        if (cell.isNode()) {
          nodes.push(cell)
        }
      }
    }

    cells.forEach((cell) => {
      collect(cell)
      if (options.deep) {
        const descendants = cell.getDescendants({ deep: true })
        descendants.forEach((descendant) => collect(descendant))
      }
    })

    edges.forEach((edge) => {
      // For edges, include their source & target
      const sourceCell = edge.getSourceCell()
      const targetCell = edge.getTargetCell()
      if (sourceCell && !cache[sourceCell.id]) {
        subgraph.push(sourceCell)
        cache[sourceCell.id] = sourceCell
        if (sourceCell.isNode()) {
          nodes.push(sourceCell)
        }
      }
      if (targetCell && !cache[targetCell.id]) {
        subgraph.push(targetCell)
        cache[targetCell.id] = targetCell
        if (targetCell.isNode()) {
          nodes.push(targetCell)
        }
      }
    })

    nodes.forEach((node) => {
      // For nodes, include their connected edges if their source/target
      // is in the subgraph.
      const edges = this.getConnectedEdges(node, options)
      edges.forEach((edge) => {
        const sourceCell = edge.getSourceCell()
        const targetCell = edge.getTargetCell()
        if (
          !cache[edge.id] &&
          sourceCell &&
          cache[sourceCell.id] &&
          targetCell &&
          cache[targetCell.id]
        ) {
          subgraph.push(edge)
          cache[edge.id] = edge
        }
      })
    })

    return subgraph
  }

  /**
   * Clones the whole subgraph (including all the connected links whose
   * source/target is in the subgraph). If `options.deep` is `true`, also
   * take into account all the embedded cells of all the subgraph cells.
   *
   * Returns a map of the form: { [original cell ID]: [clone] }.
   */
  cloneSubGraph(cells: Cell[], options: Model.GetSubgraphOptions = {}) {
    const subgraph = this.getSubGraph(cells, options)
    return this.cloneCells(subgraph)
  }

  cloneCells(cells: Cell[]) {
    return Cell.cloneCells(cells)
  }

  /**
   * Returns an array of nodes whose bounding box contains point.
   * Note that there can be more then one node as nodes might overlap.
   */
  getNodesFromPoint(x: number, y: number): Node[]
  getNodesFromPoint(p: Point.PointLike): Node[]
  getNodesFromPoint(x: number | Point.PointLike, y?: number) {
    const p = typeof x === 'number' ? { x, y: y || 0 } : x
    return this.getNodes().filter((node) => {
      return node.getBBox().containsPoint(p)
    })
  }

  /**
   * Returns an array of nodes whose bounding box top/left coordinate
   * falls into the rectangle.
   */
  getNodesInArea(
    x: number,
    y: number,
    w: number,
    h: number,
    options?: Model.GetCellsInAreaOptions,
  ): Node[]
  getNodesInArea(
    rect: Rectangle.RectangleLike,
    options?: Model.GetCellsInAreaOptions,
  ): Node[]
  getNodesInArea(
    x: number | Rectangle.RectangleLike,
    y?: number | Model.GetCellsInAreaOptions,
    w?: number,
    h?: number,
    options?: Model.GetCellsInAreaOptions,
  ): Node[] {
    const rect =
      typeof x === 'number'
        ? new Rectangle(x, y as number, w as number, h as number)
        : Rectangle.create(x)
    const opts =
      typeof x === 'number' ? options : (y as Model.GetCellsInAreaOptions)
    const strict = opts && opts.strict
    return this.getNodes().filter((node) => {
      const angle = node.angle()
      const bbox = node.getBBox().bbox(angle)
      return strict ? rect.containsRect(bbox) : rect.isIntersectWithRect(bbox)
    })
  }

  /**
   * Returns an array of edges whose bounding box top/left coordinate
   * falls into the rectangle.
   */
  getEdgesInArea(
    x: number,
    y: number,
    w: number,
    h: number,
    options?: Model.GetCellsInAreaOptions,
  ): Edge[]
  getEdgesInArea(
    rect: Rectangle.RectangleLike,
    options?: Model.GetCellsInAreaOptions,
  ): Edge[]
  getEdgesInArea(
    x: number | Rectangle.RectangleLike,
    y?: number | Model.GetCellsInAreaOptions,
    w?: number,
    h?: number,
    options?: Model.GetCellsInAreaOptions,
  ): Edge[] {
    const rect =
      typeof x === 'number'
        ? new Rectangle(x, y as number, w as number, h as number)
        : Rectangle.create(x)
    const opts =
      typeof x === 'number' ? options : (y as Model.GetCellsInAreaOptions)
    const strict = opts && opts.strict
    return this.getEdges().filter((edge) => {
      const bbox = edge.getBBox()
      if (bbox.width === 0) {
        bbox.inflate(1, 0)
      } else if (bbox.height === 0) {
        bbox.inflate(0, 1)
      }
      return strict ? rect.containsRect(bbox) : rect.isIntersectWithRect(bbox)
    })
  }

  getNodesUnderNode(
    node: Node,
    options: {
      by?: 'bbox' | Rectangle.KeyPoint
    } = {},
  ) {
    const bbox = node.getBBox()
    const nodes =
      options.by == null || options.by === 'bbox'
        ? this.getNodesInArea(bbox)
        : this.getNodesFromPoint(bbox[options.by])

    return nodes.filter(
      (curr) => node.id !== curr.id && !curr.isDescendantOf(node),
    )
  }

  /**
   * Returns the bounding box that surrounds all cells in the graph.
   */
  getAllCellsBBox() {
    return this.getCellsBBox(this.getCells())
  }

  /**
   * Returns the bounding box that surrounds all the given cells.
   */
  getCellsBBox(cells: Cell[], options: Cell.GetCellsBBoxOptions = {}) {
    return Cell.getCellsBBox(cells, options)
  }

  // #region search

  search(
    cell: Cell,
    iterator: Model.SearchIterator,
    options: Model.SearchOptions = {},
  ) {
    if (options.breadthFirst) {
      this.breadthFirstSearch(cell, iterator, options)
    } else {
      this.depthFirstSearch(cell, iterator, options)
    }
  }

  breadthFirstSearch(
    cell: Cell,
    iterator: Model.SearchIterator,
    options: Model.GetNeighborsOptions = {},
  ) {
    const queue: Cell[] = []
    const visited: KeyValue<boolean> = {}
    const distance: KeyValue<number> = {}

    queue.push(cell)
    distance[cell.id] = 0

    while (queue.length > 0) {
      const next = queue.shift()
      if (next == null || visited[next.id]) {
        continue
      }
      visited[next.id] = true
      if (FunctionExt.call(iterator, this, next, distance[next.id]) === false) {
        continue
      }
      const neighbors = this.getNeighbors(next, options)
      neighbors.forEach((neighbor) => {
        distance[neighbor.id] = distance[next.id] + 1
        queue.push(neighbor)
      })
    }
  }

  depthFirstSearch(
    cell: Cell,
    iterator: Model.SearchIterator,
    options: Model.GetNeighborsOptions = {},
  ) {
    const queue: Cell[] = []
    const visited: KeyValue<boolean> = {}
    const distance: KeyValue<number> = {}

    queue.push(cell)
    distance[cell.id] = 0

    while (queue.length > 0) {
      const next = queue.pop()
      if (next == null || visited[next.id]) {
        continue
      }
      visited[next.id] = true

      if (FunctionExt.call(iterator, this, next, distance[next.id]) === false) {
        continue
      }

      const neighbors = this.getNeighbors(next, options)
      const lastIndex = queue.length
      neighbors.forEach((neighbor) => {
        distance[neighbor.id] = distance[next.id] + 1
        queue.splice(lastIndex, 0, neighbor)
      })
    }
  }

  // #endregion

  // #region shortest path

  /** *
   * Returns an array of IDs of nodes on the shortest
   * path between source and target.
   */
  getShortestPath(
    source: Cell | string,
    target: Cell | string,
    options: Model.GetShortestPathOptions = {},
  ) {
    const adjacencyList: Dijkstra.AdjacencyList = {}
    this.getEdges().forEach((edge) => {
      const sourceId = edge.getSourceCellId()
      const targetId = edge.getTargetCellId()
      if (sourceId && targetId) {
        if (!adjacencyList[sourceId]) {
          adjacencyList[sourceId] = []
        }
        if (!adjacencyList[targetId]) {
          adjacencyList[targetId] = []
        }

        adjacencyList[sourceId].push(targetId)
        if (!options.directed) {
          adjacencyList[targetId].push(sourceId)
        }
      }
    })

    const sourceId = typeof source === 'string' ? source : source.id
    const previous = Dijkstra.run(adjacencyList, sourceId, options.weight)

    const path = []
    let targetId = typeof target === 'string' ? target : target.id
    if (previous[targetId]) {
      path.push(targetId)
    }

    while ((targetId = previous[targetId])) {
      path.unshift(targetId)
    }
    return path
  }

  // #endregion

  // #region transform

  /**
   * Translate all cells in the graph by `tx` and `ty` pixels.
   */
  translate(tx: number, ty: number, options: Cell.TranslateOptions) {
    this.getCells()
      .filter((cell) => !cell.hasParent())
      .forEach((cell) => cell.translate(tx, ty, options))

    return this
  }

  resize(width: number, height: number, options: Cell.SetOptions) {
    return this.resizeCells(width, height, this.getCells(), options)
  }

  resizeCells(
    width: number,
    height: number,
    cells: Cell[],
    options: Cell.SetOptions = {},
  ) {
    const bbox = this.getCellsBBox(cells)
    if (bbox) {
      const sx = Math.max(width / bbox.width, 0)
      const sy = Math.max(height / bbox.height, 0)
      const origin = bbox.getOrigin()
      cells.forEach((cell) => cell.scale(sx, sy, origin, options))
    }

    return this
  }

  // #endregion

  // #region serialize/deserialize

  toJSON(options: Model.ToJSONOptions = {}) {
    return Model.toJSON(this.getCells(), options)
  }

  parseJSON(data: Model.FromJSONData) {
    return Model.fromJSON(data)
  }

  fromJSON(data: Model.FromJSONData, options: Model.FromJSONOptions = {}) {
    const cells = this.parseJSON(data)
    this.resetCells(cells, options)
    return this
  }

  // #endregion

  // #region batch

  startBatch(name: Model.BatchName, data: KeyValue = {}) {
    this.batches[name] = (this.batches[name] || 0) + 1
    this.notify('batch:start', { name, data })
    return this
  }

  stopBatch(name: Model.BatchName, data: KeyValue = {}) {
    this.batches[name] = (this.batches[name] || 0) - 1
    this.notify('batch:stop', { name, data })
    return this
  }

  batchUpdate<T>(name: Model.BatchName, execute: () => T, data: KeyValue = {}) {
    this.startBatch(name, data)
    const result = execute()
    this.stopBatch(name, data)
    return result
  }

  hasActiveBatch(
    name: Model.BatchName | Model.BatchName[] = Object.keys(
      this.batches,
    ) as Model.BatchName[],
  ) {
    const names = Array.isArray(name) ? name : [name]
    return names.some((batch) => this.batches[batch] > 0)
  }

  // #endregion

  @Model.dispose()
  dispose() {
    this.collection.dispose()
  }
}

export namespace Model {
  export const toStringTag = `X6.${Model.name}`

  export function isModel(instance: any): instance is Model {
    if (instance == null) {
      return false
    }

    if (instance instanceof Model) {
      return true
    }

    const tag = instance[Symbol.toStringTag]
    const model = instance as Model

    if (
      (tag == null || tag === toStringTag) &&
      typeof model.addNode === 'function' &&
      typeof model.addEdge === 'function' &&
      model.collection != null
    ) {
      return true
    }

    return false
  }
}
export namespace Model {
  export interface SetOptions extends Collection.SetOptions {}
  export interface AddOptions extends Collection.AddOptions {}
  export interface RemoveOptions extends Collection.RemoveOptions {}
  export interface FromJSONOptions extends Collection.SetOptions {}

  export type FromJSONData =
    | (Node.Metadata | Edge.Metadata)[]
    | (Partial<ReturnType<typeof toJSON>> & {
        nodes?: Node.Metadata[]
        edges?: Edge.Metadata[]
      })
  export type ToJSONData = {
    cells: Cell.Properties[]
  }

  export interface GetCellsInAreaOptions {
    strict?: boolean
  }

  export interface SearchOptions extends GetNeighborsOptions {
    breadthFirst?: boolean
  }

  export type SearchIterator = (
    this: Model,
    cell: Cell,
    distance: number,
  ) => any

  export interface GetNeighborsOptions {
    deep?: boolean
    incoming?: boolean
    outgoing?: boolean
    indirect?: boolean
  }

  export interface GetConnectedEdgesOptions extends GetNeighborsOptions {
    enclosed?: boolean
  }

  export interface GetSubgraphOptions {
    deep?: boolean
  }

  export interface GetShortestPathOptions {
    directed?: boolean
    weight?: Dijkstra.Weight
  }

  export interface GetPredecessorsOptions extends Cell.GetDescendantsOptions {
    distance?: number | number[] | ((distance: number) => boolean)
  }
}

export namespace Model {
  export interface EventArgs
    extends Collection.CellEventArgs,
      Collection.NodeEventArgs,
      Collection.EdgeEventArgs {
    'batch:start': {
      name: BatchName | string
      data: KeyValue
    }
    'batch:stop': {
      name: BatchName | string
      data: KeyValue
    }

    sorted: null
    reseted: {
      current: Cell[]
      previous: Cell[]
      options: Collection.SetOptions
    }
    updated: {
      added: Cell[]
      merged: Cell[]
      removed: Cell[]
      options: Collection.SetOptions
    }
  }

  export type BatchName =
    | 'update'
    | 'add'
    | 'remove'
    | 'clear'
    | 'to-back'
    | 'to-front'
    | 'scale'
    | 'resize'
    | 'rotate'
    | 'translate'
    | 'mouse'
    | 'layout'
    | 'add-edge'
    | 'fit-embeds'
    | 'dnd'
    | 'halo'
    | 'cut'
    | 'paste'
    | 'knob'
    | 'add-vertex'
    | 'move-anchor'
    | 'move-vertex'
    | 'move-segment'
    | 'move-arrowhead'
    | 'move-selection'
}

export namespace Model {
  export interface ToJSONOptions extends Cell.ToJSONOptions {}

  export function toJSON(cells: Cell[], options: ToJSONOptions = {}) {
    return {
      cells: cells.map((cell) => cell.toJSON(options)),
    }
  }

  export function fromJSON(data: FromJSONData) {
    const cells: Cell.Metadata[] = []
    if (Array.isArray(data)) {
      cells.push(...data)
    } else {
      if (data.cells) {
        cells.push(...data.cells)
      }

      if (data.nodes) {
        data.nodes.forEach((node) => {
          if (node.shape == null) {
            node.shape = 'rect'
          }
          cells.push(node)
        })
      }

      if (data.edges) {
        data.edges.forEach((edge) => {
          if (edge.shape == null) {
            edge.shape = 'edge'
          }
          cells.push(edge)
        })
      }
    }

    return cells.map((cell) => {
      const type = cell.shape
      if (type) {
        if (Node.registry.exist(type)) {
          return Node.create(cell)
        }
        if (Edge.registry.exist(type)) {
          return Edge.create(cell)
        }
      }
      throw new Error(
        'The `shape` should be specified when creating a node/edge instance',
      )
    })
  }
}

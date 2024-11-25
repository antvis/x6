import { Graph } from '../../graph'

describe('Graph', () => {
  it('should return graph', () => {
    const graph = new Graph({
      container: document.getElementById('container'),
      width: 800,
      height: 600,
      background: {
        color: '#F2F7FA',
      },
    })

    return graph
  })
})

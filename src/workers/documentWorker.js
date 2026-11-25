import { analyzeDocument } from '../documentAnalysis.js'

self.onmessage = ({ data }) => {
  const { id, markdown } = data
  self.postMessage({
    id,
    ...analyzeDocument(markdown),
  })
}

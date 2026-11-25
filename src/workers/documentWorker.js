import { analyzeDocument } from '../documentAnalysis.js'
import { diffLines } from '../documentDiff.js'

self.onmessage = ({ data }) => {
  const { id, operation, markdown, fileName, knownFiles, leftText, rightText } = data
  if (operation === 'diff') {
    self.postMessage({ id, rows: diffLines(leftText, rightText) })
    return
  }
  self.postMessage({
    id,
    ...analyzeDocument(markdown, { fileName, knownFiles }),
  })
}

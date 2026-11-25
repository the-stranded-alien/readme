const MAX_LCS_CELLS = 1_500_000

export function diffLines(leftText, rightText) {
  const left = leftText.split('\n')
  const right = rightText.split('\n')
  if (leftText === rightText && left.length > 80) {
    return [{ kind: 'context', left: `… ${left.length} unchanged lines …`, right: `… ${right.length} unchanged lines …`, leftLine: 1, rightLine: 1 }]
  }
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < left.length - prefix && suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1

  const oldMiddle = left.slice(prefix, left.length - suffix)
  const newMiddle = right.slice(prefix, right.length - suffix)
  const width = newMiddle.length + 1
  const rows = []
  appendEqualRange(rows, left, right, 0, 0, prefix)

  if (oldMiddle.length + newMiddle.length > 8000) {
    rows.push({
      kind: 'summary',
      left: `… ${oldMiddle.length} lines in this change region collapsed …`,
      right: `… ${newMiddle.length} lines in this change region collapsed …`,
      leftLine: null,
      rightLine: null,
    })
  } else if (oldMiddle.length * newMiddle.length <= MAX_LCS_CELLS) {
    const height = oldMiddle.length + 1
    const table = new Uint32Array(height * width)
    for (let i = oldMiddle.length - 1; i >= 0; i -= 1) {
      for (let j = newMiddle.length - 1; j >= 0; j -= 1) {
        const pos = i * width + j
        table[pos] = oldMiddle[i] === newMiddle[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[pos + 1])
      }
    }

    let i = 0
    let j = 0
    const edits = []
    while (i < oldMiddle.length || j < newMiddle.length) {
      if (i < oldMiddle.length && j < newMiddle.length && oldMiddle[i] === newMiddle[j]) {
        edits.push({ kind: 'equal', left: oldMiddle[i], right: newMiddle[j], leftLine: prefix + i + 1, rightLine: prefix + j + 1 })
        i += 1
        j += 1
      } else if (i < oldMiddle.length && (j >= newMiddle.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
        edits.push({ kind: 'remove', left: oldMiddle[i], leftLine: prefix + i + 1, rightLine: null })
        i += 1
      } else {
        edits.push({ kind: 'add', right: newMiddle[j], leftLine: null, rightLine: prefix + j + 1 })
        j += 1
      }
    }
    rows.push(...alignEditBlock(edits))
  } else {
    const editBlock = [
      ...oldMiddle.map((line, i) => ({ kind: 'remove', left: line, leftLine: prefix + i + 1, rightLine: null })),
      ...newMiddle.map((line, i) => ({ kind: 'add', right: line, leftLine: null, rightLine: prefix + i + 1 })),
    ]
    rows.push(...alignEditBlock(editBlock))
  }

  appendEqualRange(rows, left, right, left.length - suffix, right.length - suffix, suffix)
  return rows
}

function appendEqualRange(rows, left, right, leftStart, rightStart, count) {
  const add = offset => rows.push({
    kind: 'equal',
    left: left[leftStart + offset],
    right: right[rightStart + offset],
    leftLine: leftStart + offset + 1,
    rightLine: rightStart + offset + 1,
  })
  if (count <= 80) {
    for (let i = 0; i < count; i += 1) add(i)
    return
  }
  for (let i = 0; i < 3; i += 1) add(i)
  rows.push({
    kind: 'context',
    left: `… ${count - 6} unchanged lines …`,
    right: `… ${count - 6} unchanged lines …`,
    leftLine: leftStart + 4,
    rightLine: rightStart + 4,
  })
  for (let i = count - 3; i < count; i += 1) add(i)
}

function alignEditBlock(edits) {
  const rows = []
  let removed = []
  let added = []
  const flush = () => {
    const length = Math.max(removed.length, added.length)
    for (let i = 0; i < length; i += 1) {
      const oldLine = removed[i]
      const newLine = added[i]
      rows.push({
        kind: oldLine && newLine ? 'change' : oldLine ? 'remove' : 'add',
        left: oldLine?.left,
        right: newLine?.right,
        leftLine: oldLine?.leftLine ?? null,
        rightLine: newLine?.rightLine ?? null,
      })
    }
    removed = []
    added = []
  }
  for (const edit of edits) {
    if (edit.kind === 'equal') {
      flush()
      rows.push(edit)
    } else if (edit.kind === 'remove') removed.push(edit)
    else added.push(edit)
  }
  flush()
  return rows
}

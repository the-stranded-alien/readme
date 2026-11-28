import { syncPath } from './folderSync'

const ARRAY_FIELDS = ['dashboards', 'dailyNotes', 'annotations', 'customTemplates']
const OBJECT_FIELDS = ['readingBookmarks', 'sectionBookmarks', 'itemOrder']

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const version = item => Number(item?.updatedAt || item?.resolvedAt || item?.organizedAt || item?.createdAt || item?.at || 0)
const asArray = value => Array.isArray(value) ? value : []
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function mergeRecords(localItems, remoteItems, baseItems) {
  const local = new Map(asArray(localItems).filter(item => item?.id).map(item => [item.id, item]))
  const remote = new Map(asArray(remoteItems).filter(item => item?.id).map(item => [item.id, item]))
  const base = new Map(asArray(baseItems).filter(item => item?.id).map(item => [item.id, item]))
  const result = []
  for (const id of new Set([...base.keys(), ...local.keys(), ...remote.keys()])) {
    const l = local.get(id), r = remote.get(id), b = base.get(id)
    if (!l && !r) continue
    if (!l) { if (!b || !same(r, b)) result.push(r); continue }
    if (!r) { if (!b || !same(l, b)) result.push(l); continue }
    const localChanged = !same(l, b)
    const remoteChanged = !same(r, b)
    if (localChanged && remoteChanged) result.push(version(r) > version(l) ? r : l)
    else if (localChanged) result.push(l)
    else result.push(r)
  }
  return result
}

function mergeObject(localValue, remoteValue, baseValue) {
  const local = asObject(localValue), remote = asObject(remoteValue), base = asObject(baseValue)
  const result = {}
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)])) {
    const l = local[key], r = remote[key], b = base[key]
    if (l === undefined && r === undefined) continue
    if (l === undefined) { if (b === undefined || !same(r, b)) result[key] = r; continue }
    if (r === undefined) { if (b === undefined || !same(l, b)) result[key] = l; continue }
    result[key] = !same(l, b) ? l : r
  }
  return result
}

function mergeStrings(localValue, remoteValue, baseValue) {
  const local = new Set(asArray(localValue)), remote = new Set(asArray(remoteValue)), base = new Set(asArray(baseValue))
  return [...new Set([...base, ...local, ...remote])].filter(value => {
    const before = base.has(value), left = local.has(value), right = remote.has(value)
    if (left === right) return left
    return left !== before ? left : right
  })
}

/** Three-way merge metadata snapshots so independent devices can add and edit records safely. */
export function mergeWorkspaceSyncData(localValue, remoteValue, baseValue = null) {
  const local = asObject(localValue), remote = asObject(remoteValue), base = asObject(baseValue)
  const merged = { version: 1 }
  for (const field of ARRAY_FIELDS) merged[field] = mergeRecords(local[field], remote[field], base[field])
  for (const field of OBJECT_FIELDS) merged[field] = mergeObject(local[field], remote[field], base[field])
  merged.emptyFolders = mergeStrings(local.emptyFolders, remote.emptyFolders, base.emptyFolders)
  return merged
}

/** Store document references as relative paths so IDs can differ across devices. */
export function encodeWorkspaceSyncData(value, documents) {
  const idToPath = new Map(documents.map(file => [file.id, syncPath(file.name)]))
  const pathOf = (id, savedPath) => idToPath.get(id) || savedPath || id
  const mapKeys = object => Object.fromEntries(Object.entries(asObject(object)).map(([id, value]) => [pathOf(id), value]))
  return {
    ...value,
    dashboards: asArray(value.dashboards).map(item => {
      const { documentIds = [], excludedDocumentIds = [], ...rest } = item
      return {
        ...rest,
        documentPaths: [...new Set(documentIds.filter(id => idToPath.has(id)).map(id => pathOf(id)))],
        excludedDocumentPaths: [...new Set(excludedDocumentIds.filter(id => idToPath.has(id)).map(id => pathOf(id)))],
      }
    }),
    dailyNotes: asArray(value.dailyNotes).map(item => {
      const { organizedTo, ...rest } = item
      return { ...rest, ...(organizedTo || item.organizedToPath ? { organizedToPath: pathOf(organizedTo, item.organizedToPath) } : {}) }
    }),
    annotations: asArray(value.annotations).map(item => {
      const { fileId, ...rest } = item
      return { ...rest, ...(fileId || item.filePath ? { filePath: pathOf(fileId, item.filePath) } : {}) }
    }),
    readingBookmarks: mapKeys(value.readingBookmarks),
    sectionBookmarks: mapKeys(value.sectionBookmarks),
    itemOrder: { ...asObject(value.itemOrder), files: asArray(value.itemOrder?.files).map(id => pathOf(id)) },
  }
}

/** Map shared paths back to this browser's local document IDs after a sync. */
export function decodeWorkspaceSyncData(value, documents) {
  const pathToId = new Map(documents.map(file => [syncPath(file.name), file.id]))
  const idOf = path => pathToId.get(path) || path
  const mapKeys = object => Object.fromEntries(Object.entries(asObject(object)).map(([path, item]) => [idOf(path), item]))
  return {
    ...value,
    dashboards: asArray(value.dashboards).map(item => {
      const { documentPaths = [], excludedDocumentPaths = [], ...rest } = item
      return {
        ...rest,
        documentPaths,
        excludedDocumentPaths,
        documentIds: [...new Set([...(item.documentIds || []), ...documentPaths.map(idOf)])],
        excludedDocumentIds: [...new Set([...(item.excludedDocumentIds || []), ...excludedDocumentPaths.map(idOf)])],
      }
    }),
    dailyNotes: asArray(value.dailyNotes).map(item => ({ ...item, ...(item.organizedToPath ? { organizedTo: idOf(item.organizedToPath) } : {}) })),
    annotations: asArray(value.annotations).map(item => ({ ...item, ...(item.filePath ? { fileId: idOf(item.filePath) } : {}) })),
    readingBookmarks: mapKeys(value.readingBookmarks),
    sectionBookmarks: mapKeys(value.sectionBookmarks),
    itemOrder: { ...asObject(value.itemOrder), files: asArray(value.itemOrder?.files).map(idOf) },
  }
}

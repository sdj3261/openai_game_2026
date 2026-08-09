import { isSavePayload, type SavePayload } from './workerProtocol'

const DB_NAME = 'gaia-2126'
const STORE_NAME = 'saves'
const SAVE_KEY = 'autosave'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function loadGame(): Promise<SavePayload | undefined> {
  let database: IDBDatabase | undefined
  try {
    const openedDatabase = await openDatabase()
    database = openedDatabase
    const stored = await new Promise<unknown>((resolve, reject) => {
      const transaction = openedDatabase.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(SAVE_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.onabort = () => reject(transaction.error)
    })
    return isSavePayload(stored) ? stored : undefined
  } catch {
    return undefined
  } finally {
    database?.close()
  }
}

async function writeSave(payload: SavePayload) {
  let database: IDBDatabase | undefined
  try {
    const openedDatabase = await openDatabase()
    database = openedDatabase
    await new Promise<void>((resolve, reject) => {
      const transaction = openedDatabase.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(payload, SAVE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    // Private browsing or storage quotas must never block play.
  } finally {
    database?.close()
  }
}

let pendingSave: SavePayload | undefined
let saveLoop: Promise<void> | undefined

/** Coalesces rapid turns while guaranteeing that the newest completed turn wins. */
export function saveGame(payload: SavePayload): Promise<void> {
  pendingSave = payload
  if (!saveLoop) {
    saveLoop = (async () => {
      while (pendingSave) {
        const next = pendingSave
        pendingSave = undefined
        await writeSave(next)
      }
    })().finally(() => {
      saveLoop = undefined
    })
  }
  return saveLoop
}

export async function clearSave() {
  pendingSave = undefined
  await saveLoop
  let database: IDBDatabase | undefined
  try {
    const openedDatabase = await openDatabase()
    database = openedDatabase
    await new Promise<void>((resolve, reject) => {
      const transaction = openedDatabase.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(SAVE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    // A failed clear is non-fatal; RESET still rebuilds the in-memory world.
  } finally {
    database?.close()
  }
}

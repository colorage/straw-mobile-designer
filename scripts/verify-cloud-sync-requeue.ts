import { requeueUnsentCloudWrites } from '../src/gallery/requeueUnsentCloudWrites.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

{
  const pendingUpserts = new Map<string, { id: string; name?: string }>()
  const pendingDeletes = new Set<string>()
  const failed = { id: 'a', name: 'old' }
  requeueUnsentCloudWrites(pendingUpserts, pendingDeletes, [failed, { id: 'b' }], ['c'])
  assert(pendingUpserts.get('a') === failed, 'restores the failed upsert')
  assert(pendingUpserts.has('b'), 'restores later unsent upserts')
  assert(pendingDeletes.has('c'), 'restores unsent deletes')
}

{
  const newer = { id: 'a', name: 'newer' }
  const pendingUpserts = new Map([['a', newer]])
  const pendingDeletes = new Set<string>()
  requeueUnsentCloudWrites(pendingUpserts, pendingDeletes, [{ id: 'a', name: 'old' }], [])
  assert(pendingUpserts.get('a') === newer, 'keeps a newer upsert that arrived in flight')
}

{
  const pendingUpserts = new Map<string, { id: string; name?: string }>()
  const pendingDeletes = new Set(['a'])
  requeueUnsentCloudWrites(pendingUpserts, pendingDeletes, [{ id: 'a', name: 'old' }], [])
  assert(!pendingUpserts.has('a'), 'does not restore an upsert that was later deleted')
  assert(pendingDeletes.has('a'), 'keeps the newer delete')
}

{
  const newer = { id: 'a', name: 'newer' }
  const pendingUpserts = new Map([['a', newer]])
  const pendingDeletes = new Set<string>()
  requeueUnsentCloudWrites(pendingUpserts, pendingDeletes, [], ['a'])
  assert(pendingUpserts.get('a') === newer, 'does not restore a delete superseded by a newer upsert')
  assert(!pendingDeletes.has('a'), 'skips the stale delete')
}

console.log('verify-cloud-sync-requeue: ok')

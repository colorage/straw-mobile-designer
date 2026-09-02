/**
 * Put unsent writes back on the cloud queue unless a newer upsert or delete
 * for the same id arrived while the failed batch was in flight.
 */
export function requeueUnsentCloudWrites<T extends { id: string }>(
  pendingUpserts: Map<string, T>,
  pendingDeletes: Set<string>,
  unsentUpserts: readonly T[],
  unsentDeletes: readonly string[],
): void {
  for (const entry of unsentUpserts) {
    if (pendingUpserts.has(entry.id) || pendingDeletes.has(entry.id)) continue
    pendingUpserts.set(entry.id, entry)
  }
  for (const id of unsentDeletes) {
    if (pendingUpserts.has(id) || pendingDeletes.has(id)) continue
    pendingDeletes.add(id)
  }
}

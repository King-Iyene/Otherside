const TTL_MS = 2 * 60 * 1000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<any>>();
const inflight = new Map<string, Promise<any>>();

export async function cached<T>(key: string, fresh: boolean, loader: () => Promise<T>): Promise<T> {
  if (!fresh) {
    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + TTL_MS });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

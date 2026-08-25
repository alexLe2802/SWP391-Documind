import '@testing-library/jest-dom/vitest'

// Tạo Storage trong bộ nhớ để test không phụ thuộc localStorage thử nghiệm của Node.
function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key) { return values.get(key) ?? null },
    key(index) { return [...values.keys()][index] ?? null },
    removeItem(key) { values.delete(key) },
    setItem(key, value) { values.set(key, String(value)) },
  }
}

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
})
Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: createMemoryStorage(),
})

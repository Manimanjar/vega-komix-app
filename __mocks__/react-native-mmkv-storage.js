const store = new Map();

class MockMMKV {
  constructor(id = 'default') {
    this.id = id;
  }
  getString(key) {
    const val = store.get(this.id + ':' + key);
    return typeof val === 'string' ? val : undefined;
  }
  setString(key, val) {
    store.set(this.id + ':' + key, String(val));
    return true;
  }
  getBool(key, defaultValue = false) {
    const val = store.get(this.id + ':' + key);
    return typeof val === 'boolean' ? val : defaultValue;
  }
  setBool(key, val) {
    store.set(this.id + ':' + key, Boolean(val));
    return true;
  }
  getInt(key, defaultValue = 0) {
    const val = store.get(this.id + ':' + key);
    return typeof val === 'number' ? val : defaultValue;
  }
  setInt(key, val) {
    store.set(this.id + ':' + key, Number(val));
    return true;
  }
  getMap(key) {
    const val = store.get(this.id + ':' + key);
    try {
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }
  setMap(key, val) {
    store.set(this.id + ':' + key, JSON.stringify(val));
    return true;
  }
  getArray(key) {
    const val = store.get(this.id + ':' + key);
    try {
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }
  setArray(key, val) {
    store.set(this.id + ':' + key, JSON.stringify(val));
    return true;
  }
  removeItem(key) {
    store.delete(this.id + ':' + key);
    return true;
  }
  clearStore() {
    store.clear();
    return true;
  }
}

class MMKVLoader {
  constructor() {
    this.instanceId = 'default';
  }
  withInstanceID(id) {
    this.instanceId = id;
    return this;
  }
  withEncryption() {
    return this;
  }
  initialize() {
    return new MockMMKV(this.instanceId);
  }
}

module.exports = {
  MMKVLoader,
};

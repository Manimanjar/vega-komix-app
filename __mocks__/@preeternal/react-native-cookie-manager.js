const CookieManager = {
  get: jest.fn().mockResolvedValue({}),
  set: jest.fn().mockResolvedValue(true),
  flush: jest.fn().mockResolvedValue(true),
  clearAll: jest.fn().mockResolvedValue(true),
  clearByName: jest.fn().mockResolvedValue(true),
  setFromResponse: jest.fn().mockResolvedValue(true),
};

module.exports = CookieManager;
module.exports.default = CookieManager;

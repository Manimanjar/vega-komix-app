module.exports = {
  hide: jest.fn().mockResolvedValue(true),
  isVisible: jest.fn().mockResolvedValue(false),
  useHideAnimation: jest.fn(() => ({
    container: {},
    logo: {},
    brand: {},
  })),
};

module.exports = {
  reloadAsync: jest.fn().mockResolvedValue(true),
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: false }),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  useUpdates: jest.fn(() => ({
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
  })),
  UpdatesLogCategory: {},
};

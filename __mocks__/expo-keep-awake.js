module.exports = {
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(true),
  deactivateKeepAwake: jest.fn().mockResolvedValue(true),
  useKeepAwake: jest.fn(),
};

const Orientation = {
  lockToPortrait: jest.fn(),
  lockToLandscape: jest.fn(),
  lockToLandscapeLeft: jest.fn(),
  lockToLandscapeRight: jest.fn(),
  unlockAllOrientations: jest.fn(),
  getOrientation: jest.fn(cb => cb('PORTRAIT')),
  getDeviceOrientation: jest.fn(cb => cb('PORTRAIT')),
  addOrientationListener: jest.fn(),
  removeOrientationListener: jest.fn(),
  addDeviceOrientationListener: jest.fn(),
  removeDeviceOrientationListener: jest.fn(),
};

module.exports = Orientation;
module.exports.default = Orientation;

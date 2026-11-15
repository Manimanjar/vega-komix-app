const RNApkInstaller = {
  packageName: 'com.vegakomix.app',
  haveUnknownAppSourcesPermission: jest.fn().mockResolvedValue(true),
  install: jest.fn().mockResolvedValue(true),
};

module.exports = RNApkInstaller;
module.exports.default = RNApkInstaller;

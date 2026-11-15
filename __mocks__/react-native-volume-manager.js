const VolumeManager = {
  showNativeVolumeUI: jest.fn().mockResolvedValue(undefined),
  getVolume: jest.fn().mockResolvedValue({ volume: 0.5 }),
  setVolume: jest.fn().mockResolvedValue(undefined),
  addVolumeListener: jest.fn(() => ({ remove: jest.fn() })),
};

module.exports = {
  VolumeManager,
  default: { VolumeManager },
};

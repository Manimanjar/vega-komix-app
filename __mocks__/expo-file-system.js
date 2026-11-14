module.exports = {
  documentDirectory: '/data/user/0/com.vegakomix.app/files/',
  cacheDirectory: '/data/user/0/com.vegakomix.app/cache/',
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn().mockResolvedValue({
      granted: true,
      directoryUri: 'content://tree/primary',
    }),
    readDirectoryAsync: jest.fn().mockResolvedValue([]),
    makeDirectoryAsync: jest
      .fn()
      .mockResolvedValue('content://tree/primary/dir'),
    createFileAsync: jest
      .fn()
      .mockResolvedValue('content://tree/primary/file.cbz'),
    deleteAsync: jest.fn().mockResolvedValue(true),
  },
  makeDirectoryAsync: jest.fn().mockResolvedValue(true),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  deleteAsync: jest.fn().mockResolvedValue(true),
  getInfoAsync: jest
    .fn()
    .mockResolvedValue({exists: true, isDirectory: false, size: 1024}),
  copyAsync: jest.fn().mockResolvedValue(true),
  moveAsync: jest.fn().mockResolvedValue(true),
};

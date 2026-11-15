module.exports = {
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: [],
  }),
  types: {
    allFiles: '*/*',
    images: 'image/*',
  },
};

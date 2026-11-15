module.exports = {
  startActivityAsync: jest.fn().mockResolvedValue({resultCode: 0}),
  ActivityAction: {
    MANAGE_UNKNOWN_APP_SOURCES: 'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
  },
};

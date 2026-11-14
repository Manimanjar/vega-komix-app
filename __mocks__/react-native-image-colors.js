module.exports = {
  getColors: jest.fn().mockResolvedValue({
    platform: 'android',
    dominant: '#333333',
    average: '#333333',
    vibrant: '#8B5CF6',
    darkVibrant: '#4C1D95',
    lightVibrant: '#C4B5FD',
    darkMuted: '#1E1B4B',
    lightMuted: '#E0E7FF',
    muted: '#6366F1',
  }),
  cache: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
};

module.exports = {
  vars: (obj) => obj || {},
  useColorScheme: () => ({ colorScheme: 'dark', setColorScheme: jest.fn(), toggleColorScheme: jest.fn() }),
  styled: (Comp) => Comp,
};

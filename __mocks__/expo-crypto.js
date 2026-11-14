const crypto = require('crypto');

module.exports = {
  CryptoDigestAlgorithm: {
    MD5: 'MD5',
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
  },
  CryptoEncoding: {
    HEX: 'hex',
    BASE64: 'base64',
  },
  digestStringAsync: async (algorithm, data, options) => {
    const algo = algorithm.toLowerCase().replace('-', '');
    const hash = crypto.createHash(
      algo === 'sha1' ? 'sha1' : algo === 'md5' ? 'md5' : 'sha256',
    );
    hash.update(data);
    return options?.encoding === 'base64'
      ? hash.digest('base64')
      : hash.digest('hex');
  },
  getRandomBytesAsync: async (byteCount) => {
    return new Uint8Array(crypto.randomBytes(byteCount));
  },
  randomUUID: () => crypto.randomUUID(),
};

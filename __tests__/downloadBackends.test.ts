jest.mock('../src/lib/downloadBackends/httpBackend', () => ({
  httpDownloadBackend: {name: 'http'},
}));

jest.mock('../src/lib/downloadBackends/hlsBackend', () => ({
  hlsDownloadBackend: {name: 'hls'},
}));

jest.mock('../src/lib/downloadBackends/torrentBackend', () => ({
  torrentDownloadBackend: {name: 'torrent'},
}));

jest.mock('../src/lib/downloadBackends/comicBackend', () => ({
  comicDownloadBackend: {name: 'comic'},
}));

import {getDownloadBackend} from '../src/lib/downloadBackends/registry';

describe('download backend registry', () => {
  it('selects the HTTP backend', () => {
    expect(getDownloadBackend('http')).toEqual({name: 'http'});
  });

  it('selects the HLS backend', () => {
    expect(getDownloadBackend('hls')).toEqual({name: 'hls'});
  });

  it('selects the torrent backend', () => {
    expect(getDownloadBackend('torrent')).toEqual({name: 'torrent'});
  });

  it('selects the comic backend', () => {
    expect(getDownloadBackend('comic')).toEqual({name: 'comic'});
  });
});

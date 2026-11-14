const React = require('react');
const Video = React.forwardRef((props, ref) => null);
module.exports = Video;
module.exports.default = Video;
module.exports.TextTrackType = {
  SUBRIP: 'application/x-subrip',
  TTML: 'application/ttml+xml',
  VTT: 'text/vtt',
};
module.exports.SelectedTrackType = {
  SYSTEM: 'system',
  DISABLED: 'disabled',
  TITLE: 'title',
  LANGUAGE: 'language',
  INDEX: 'index',
};
module.exports.SelectedVideoTrackType = {
  AUTO: 'auto',
  DISABLED: 'disabled',
  RESOLUTION: 'resolution',
  INDEX: 'index',
};

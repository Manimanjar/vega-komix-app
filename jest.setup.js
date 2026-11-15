if (typeof window !== 'undefined') {
  if (!window.dispatchEvent) {
    window.dispatchEvent = () => true;
  }
}
if (typeof global !== 'undefined') {
  if (global.window && !global.window.dispatchEvent) {
    global.window.dispatchEvent = () => true;
  }
}

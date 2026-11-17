import type {ImageScale} from './types';

/**
 * Layout box of one page for the given fit mode, from known dimensions.
 * Single source of truth: the initial size, the loaded size, jump offsets
 * and the rendered view all derive from it, so they can never disagree.
 * Every mode stays inside the display frame EXCEPT 'full_screen', which
 * deliberately fills the whole frame (the image then cover-crops to it).
 * Note: in landscape, 'fit_height', 'fit_screen' and 'original' all compute
 * the same height-limited box — 'fit_width' and 'full_screen' are the two
 * modes that visibly differ there, which is why both are offered.
 */
export const computePageBox = (
  dims: {width: number; height: number} | undefined,
  screenWidth: number,
  screenHeight: number,
  scaleMode: ImageScale,
  zoomScale: number,
): {width: number; height: number} => {
  const zoom = zoomScale || 1.0;
  const ratio =
    dims && dims.width > 0 && dims.height > 0 ? dims.height / dims.width : 1.45;
  const maxWidth = Math.round(screenWidth * zoom);
  const maxHeight = Math.round(screenHeight * zoom);
  switch (scaleMode) {
    case 'full_screen': {
      // Fill the whole physical display edge to edge. The image is rendered
      // with contentFit="cover", so it stretches/zooms/crops to fill the
      // frame instead of letterboxing inside it.
      return {width: maxWidth, height: maxHeight};
    }
    case 'fit_height': {
      const width = Math.round(maxHeight / ratio);
      if (width > maxWidth) {
        return {width: maxWidth, height: Math.round(maxWidth * ratio)};
      }
      return {width, height: maxHeight};
    }
    case 'original':
    case 'fit_screen': {
      // 'original' and 'fit_screen' compute the same box, by the user's
      // rules: never stretched, never cropped, never a small image lost in
      // the centre. The only box that satisfies all three is a proportional
      // fit inside the frame — small images scale up to fill it (height
      // first, width following proportionally), large images scale down to
      // fit it. 'original' stays a separate value so it can diverge later
      // if the user wants it to.
      if (maxWidth * ratio <= maxHeight) {
        return {width: maxWidth, height: Math.round(maxWidth * ratio)};
      }
      return {width: Math.round(maxHeight / ratio), height: maxHeight};
    }
    case 'fit_width':
    default: {
      return {width: maxWidth, height: Math.round(maxWidth * ratio)};
    }
  }
};

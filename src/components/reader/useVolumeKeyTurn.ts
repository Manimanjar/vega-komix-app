import {useEffect, useRef} from 'react';
import {VolumeManager} from 'react-native-volume-manager';

export const useVolumeKeyTurn = ({
  enabled,
  onPrevPage,
  onNextPage,
}: {
  enabled: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}) => {
  const lastVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Suppress native volume popup UI
    VolumeManager.showNativeVolumeUI({enabled: false}).catch(() => {});

    // Read initial volume
    VolumeManager.getVolume()
      .then(res => {
        lastVolumeRef.current = res.volume;
      })
      .catch(() => {});

    const subscription = VolumeManager.addVolumeListener(result => {
      const currentVolume = result.volume;
      if (lastVolumeRef.current !== null) {
        if (currentVolume > lastVolumeRef.current) {
          onPrevPage();
        } else if (currentVolume < lastVolumeRef.current) {
          onNextPage();
        }
      }
      lastVolumeRef.current = currentVolume;
    });

    return () => {
      try {
        subscription.remove();
      } catch {}
      VolumeManager.showNativeVolumeUI({enabled: true}).catch(() => {});
    };
  }, [enabled, onPrevPage, onNextPage]);
};

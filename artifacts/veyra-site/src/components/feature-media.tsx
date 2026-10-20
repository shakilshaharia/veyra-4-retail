import { useEffect, useRef, useState } from 'react';

type FeatureMediaProps = {
  source?: string;
  webm?: string;
  poster?: string;
  label: string;
  motionEnabled: boolean;
  playing: boolean;
  near: boolean;
};

/** A keyed instance owns only the currently selected feature, never an old clip. */
export function FeatureMedia({ source, webm, poster, label, motionEnabled, playing, near }: FeatureMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing && motionEnabled) {
      setFailed(false);
      video.play().catch(() => setFailed(true));
    } else {
      video.pause();
    }
    return () => video.pause();
  }, [playing, motionEnabled]);

  return (
    <>
      {poster && !posterFailed ? (
        <img className="background-video feature-video feature-poster" src={poster} alt="" aria-hidden="true" onError={() => setPosterFailed(true)} />
      ) : (
        <div className="feature-missing-media" data-testid="feature-media-pending">
          <div>
            <span className="eyebrow">DEMO MEDIA PENDING</span>
            <h4>{label}</h4>
            <p>{source || webm ? 'The preview image is unavailable.' : 'An approved demonstration video or image has not been supplied for this feature.'}</p>
          </div>
        </div>
      )}
      {(source || webm) && motionEnabled && (
        <video
          ref={videoRef}
          className="background-video feature-video"
          poster={poster}
          muted
          loop
          playsInline
          preload={near ? 'auto' : 'none'}
          aria-hidden="true"
          style={{ opacity: ready && !failed ? 1 : 0 }}
          onLoadedData={() => setReady(true)}
          onPlaying={() => { setReady(true); setFailed(false); }}
          onError={() => setFailed(true)}
        >
          {webm && <source src={webm} type="video/webm" />}
          {source && <source src={source} type="video/mp4" />}
        </video>
      )}
    </>
  );
}

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Hls from 'hls.js';
import { ArrowRight } from 'lucide-react';
import './Hero.css';

// Working HLS stream (Mux test asset). Swap for your own .m3u8 when ready.
const HLS_SRC =
  'https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8';

export default function Hero() {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls;
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: false });
      hls.loadSource(HLS_SRC);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = HLS_SRC;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, []);

  return (
    <section className="hero">
      {/* Background HLS video @ 60% opacity */}
      <video
        ref={videoRef}
        className="hero__video"
        muted
        loop
        playsInline
        autoPlay
        aria-hidden="true"
      />
      <div className="hero__overlay-left" />
      <div className="hero__overlay-bottom" />

      {/* Vertical grid lines (desktop only) */}
      <div className="hero__grid" aria-hidden="true">
        <span className="hero__grid-line" />
        <span className="hero__grid-line" />
        <span className="hero__grid-line" />
      </div>

      {/* Central glow */}
      <svg
        className="hero__glow"
        viewBox="0 0 1200 360"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id="glow-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="25" />
          </filter>
          <radialGradient id="glow-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5ed29c" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#5ed29c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx="600"
          cy="90"
          rx="520"
          ry="70"
          fill="url(#glow-grad)"
          filter="url(#glow-blur)"
        />
      </svg>

      {/* Hero content */}
      <div className="hero__content">
        {/* Liquid glass card */}
        <div className="liquid-glass">
          <span className="liquid-glass__tag">[ AI-Powered ]</span>
          <h2 className="liquid-glass__title">
            Guided by <span className="serif italic">Adaptive</span> Learning
          </h2>
          <p className="liquid-glass__desc">
            Personalized paths that adjust to how you learn.
          </p>
        </div>

        <p className="hero__eyebrow">Personalized Learning Coach</p>

        <h1 className="hero__headline">
          LEARN SMARTER, RETAIN LONGER<span className="hero__dot">.</span>
        </h1>

        <p className="hero__desc">
          Upload notes, PDFs, or a YouTube link and get instant summaries,
          flashcards, quizzes, and a study plan tailored to you.
        </p>

        <Link to="/dashboard" className="hero__cta">
          Start Learning
          <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

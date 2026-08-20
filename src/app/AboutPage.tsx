import { ExternalLink, Heart, X } from 'lucide-react';
import packageJson from '../../package.json';

type AboutPageProps = {
  onClose: () => void;
};

const signatureLogoSrc = `${import.meta.env.BASE_URL}brand/bonanno-white.png`;
const appVersion = packageJson.version;

export function AboutPage({ onClose }: AboutPageProps) {
  return (
    <section className="about-page" aria-label="About From Reference" role="dialog" aria-modal="true">
      <div className="reference-preview-topbar">
        <button type="button" className="top-icon-button" title="Close about" onClick={onClose}>
          <X size={20} />
        </button>
        <strong>About</strong>
        <span aria-hidden="true" />
      </div>

      <div className="about-scroll">
        <div className="about-content">
          <section className="about-intro">
            <img className="about-signature" src={signatureLogoSrc} alt="Bonanno" />
            <div className="about-title-group">
              <h2>From Reference</h2>
              <span>Version {appVersion}</span>
            </div>
            <p>
              A studio reference tool by Scott Bonanno for artists studying drawing, colour, value, and traditional
              painting methods.
            </p>
          </section>

          <section className="about-section">
            <h3>What’s New</h3>
            <div className="about-steps">
              <p>Study brings Value and Colour analysis together in one focused tool.</p>
              <p>Colour mode simplifies the reference into painterly colour shapes with three levels of detail.</p>
              <p>Choose a detected colour or tap the image to isolate exact colour shapes, then add them to your palette.</p>
            </div>
          </section>

          <section className="about-section">
            <h3>Getting Started</h3>
            <div className="about-steps">
              <p>Upload your own reference, or choose a study image from the library.</p>
              <p>Set the canvas size and grid so the reference can translate to a real painting surface.</p>
              <p>Use Study, Filters, and Palette tools to explore shape, tone, colour, and mixing notes.</p>
            </div>
          </section>

          <section className="about-section">
            <h3>Saving References</h3>
            <p>
              Use Save reference to keep a setup in the Saved tab. Once saved, that reference updates automatically as
              you keep working on it. Choosing the same image again from Library starts fresh.
            </p>
          </section>

          <section className="about-section">
            <h3>About Scott</h3>
            <p>
              Scott is an Australian painter interested in classical technique, careful observation, and practical tools
              that make the studio process clearer.
            </p>
          </section>

          <section className="about-links" aria-label="Scott Bonanno links">
            <a href="https://www.scottpaints.com.au/" target="_blank" rel="noreferrer">
              <span>
                <strong>Website</strong>
                <small>scottpaints.com.au</small>
              </span>
              <ExternalLink size={15} />
            </a>
            <a href="https://www.instagram.com/scottbonanno" target="_blank" rel="noreferrer">
              <span>
                <strong>Instagram</strong>
                <small>@scottbonanno</small>
              </span>
              <ExternalLink size={15} />
            </a>
            <a href="https://buy.stripe.com/fZu3coc7vcxIfUp35Hes000" target="_blank" rel="noreferrer">
              <span>
                <strong>Support the app</strong>
                <small>A small donation helps keep this project moving.</small>
              </span>
              <Heart size={15} />
            </a>
          </section>
        </div>
      </div>
    </section>
  );
}

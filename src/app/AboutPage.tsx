import { ExternalLink, Heart, X } from 'lucide-react';

type AboutPageProps = {
  onClose: () => void;
};

export function AboutPage({ onClose }: AboutPageProps) {
  return (
    <section className="about-page" aria-label="About Art Assistant" role="dialog" aria-modal="true">
      <div className="reference-preview-topbar">
        <button type="button" className="top-icon-button" title="Close about" onClick={onClose}>
          <X size={20} />
        </button>
        <strong>About</strong>
        <span aria-hidden="true" />
      </div>

      <div className="about-content">
        <section className="about-intro">
          <span className="about-mark">AA</span>
          <h2>Art Assistant</h2>
          <p>
            A studio reference tool by Scott Bonanno for artists studying drawing, colour, value, and traditional
            painting methods.
          </p>
        </section>

        <section className="about-section">
          <h3>Getting Started</h3>
          <div className="about-steps">
            <p>Upload your own reference, or choose a study image from the library.</p>
            <p>Set the canvas size and grid so the reference can translate to a real painting surface.</p>
            <p>Use Values, Filters, and Palette tools to study shape, tone, colour, and mixing notes.</p>
          </div>
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
    </section>
  );
}

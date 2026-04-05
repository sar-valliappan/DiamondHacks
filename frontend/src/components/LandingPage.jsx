export default function LandingPage({ onGetStarted }) {
  return (
    <div className="landing-shell">
      <div className="landing-content">

        {/* Logo */}
        <div className="landing-logo-row">
          <div className="landing-logo-mark">N</div>
          <span className="landing-logo-name">Navigator</span>
        </div>

        {/* Hero */}
        <div className="landing-hero">
          <h1 className="landing-headline">The web,<br />spoken simply.</h1>
          <p className="landing-sub">
            Speak or type what you need. Navigator handles the rest —
            filling forms, finding doctors, paying bills — while you watch and stay in control.
          </p>
        </div>

        {/* Feature pills */}
        <div className="landing-features">
          <div className="landing-feature">
            <span className="landing-feature-icon">🎙️</span>
            <div>
              <div className="landing-feature-title">Voice or Text</div>
              <div className="landing-feature-desc">Speak or type your request in 12 languages</div>
            </div>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">👁️</span>
            <div>
              <div className="landing-feature-title">Watch Live</div>
              <div className="landing-feature-desc">See exactly what's happening in the browser</div>
            </div>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">🛡️</span>
            <div>
              <div className="landing-feature-title">Always Asks First</div>
              <div className="landing-feature-desc">Nothing irreversible happens without your OK</div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button className="landing-cta" onClick={onGetStarted}>
          Get Started
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        {/* Use case preview */}
        <div className="landing-examples">
          <span className="landing-examples-label">Try asking:</span>
          <div className="landing-example-chips">
            <span className="landing-chip" onClick={onGetStarted}>"Refill my CVS prescription"</span>
            <span className="landing-chip" onClick={onGetStarted}>"Pay my SDG&E bill"</span>
            <span className="landing-chip" onClick={onGetStarted}>"Find a Medicare doctor near me"</span>
          </div>
        </div>
      </div>

      {/* Bottom credit */}
      <div className="landing-footer">
        Powered by BrowserUse + Gemini
      </div>
    </div>
  );
}

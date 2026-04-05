export default function SimplifiedView({ narrations, onExit }) {
  const latest = narrations[0];
  const recent = narrations.slice(1, 4);

  return (
    <div className="simplified-view">
      <div className="simplified-header">
        <div className="simplified-badge">
          <span className="simplified-badge-dot" />
          Reader Mode
        </div>
        <button className="simplified-exit-btn" onClick={onExit}>
          Show Live Browser →
        </button>
      </div>

      <div className="simplified-body">
        {latest ? (
          <>
            <div className="simplified-latest">
              <div className="simplified-latest-label">Right now</div>
              <p className="simplified-latest-text">{latest.message}</p>
            </div>

            {recent.length > 0 && (
              <div className="simplified-history">
                <div className="simplified-history-label">What happened before</div>
                <ul className="simplified-history-list">
                  {recent.map((n) => (
                    <li key={n.id} className="simplified-history-item">
                      <span className="simplified-history-dot" />
                      {n.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="simplified-empty">Waiting for the page to load…</p>
        )}
      </div>

      <div className="simplified-footer">
        <span className="simplified-footer-note">
          Ads, menus, and clutter are hidden. Only what matters is shown.
        </span>
      </div>
    </div>
  );
}

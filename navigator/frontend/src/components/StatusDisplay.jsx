const STATUS_CONFIG = {
  idle:       { dot: "#22c55e", text: "Ready" },
  listening:  { dot: "#ef4444", text: "Listening" },
  processing: { dot: "#3b82f6", text: "Working" },
  working:    { dot: "#3b82f6", text: "Working" },
  waiting:    { dot: "#f59e0b", text: "Need your help" },
};

export default function StatusDisplay({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <div className="status-display">
      <span className="status-dot" style={{ background: cfg.dot }} />
      <span className="status-text">{cfg.text}</span>
    </div>
  );
}
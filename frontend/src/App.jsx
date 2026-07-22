import { useState, useEffect, useRef, useCallback } from "react";
import PdfViewer from "./PdfViewer.jsx";
import RightPanel from "./RightPanel.jsx";

const API = "/api";

export default function App() {
  const [files, setFiles] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const splitRef = useRef(null);

  const onMouseMove = useCallback(
    (e) => {
      if (!splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, pct)));
    },
    [],
  );

  const onMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, onMouseMove, onMouseUp]);

  useEffect(() => {
    fetch(`${API}/files`)
      .then((r) => r.json())
      .then(setFiles)
      .catch(console.error);
  }, []);

  async function handleUpload(e) {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    setUploading(true);
    let lastEntry = null;
    for (const file of selectedFiles) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(`${API}/upload`, { method: "POST", body: form });
        if (!res.ok) continue;
        const entry = await res.json();
        setFiles((prev) => [...prev, entry]);
        lastEntry = entry;
      } catch {
        // skip failed uploads
      }
    }
    if (lastEntry) {
      setTabs((prev) =>
        prev.find((t) => t.id === lastEntry.id) ? prev : [...prev, lastEntry],
      );
      setActiveTab(lastEntry.id);
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function openFile(file) {
    if (!tabs.find((t) => t.id === file.id)) {
      setTabs((prev) => [...prev, file]);
    }
    setActiveTab(file.id);
  }

  function closeTab(id, e) {
    e.stopPropagation();
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeTab === id) {
      setActiveTab((prev) => {
        const remaining = tabs.filter((t) => t.id !== id);
        return remaining.length ? remaining[remaining.length - 1].id : null;
      });
    }
  }

  async function deleteFile(id, e) {
    e.stopPropagation();
    try {
      const res = await fetch(`${API}/files/${id}`, { method: "DELETE" });
      if (!res.ok) return;
    } catch {
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeTab === id) {
      const remaining = tabs.filter((t) => t.id !== id);
      setActiveTab(remaining.length ? remaining[remaining.length - 1].id : null);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h1 style={styles.logo}>Pensieve</h1>
        </div>

        <button
          style={styles.uploadBtn}
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "+ Upload PDF"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={handleUpload}
        />

        <div style={styles.fileList}>
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                ...styles.fileItem,
                ...(activeTab === f.id ? styles.fileItemActive : {}),
              }}
              onClick={() => openFile(f)}
            >
              <div style={styles.fileIcon}>PDF</div>
              <div style={styles.fileInfo}>
                <div style={styles.fileName}>{f.name}</div>
                <div style={styles.fileMeta}>{formatSize(f.size)}</div>
              </div>
              <div
                style={styles.fileDelete}
                onClick={(e) => deleteFile(f.id, e)}
                title="Delete file"
              >
                ×
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <div style={styles.empty}>No files uploaded yet</div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        {tabs.length > 0 && (
          <div style={styles.tabBar}>
            {tabs.map((t) => (
              <div
                key={t.id}
                style={{
                  ...styles.tab,
                  ...(activeTab === t.id ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab(t.id)}
              >
                <span style={styles.tabName}>{t.name}</span>
                <span style={styles.tabClose} onClick={(e) => closeTab(t.id, e)}>
                  ×
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={styles.content}>
          {activeTab ? (
            <div ref={splitRef} style={styles.splitView}>
              <div style={{ ...styles.splitLeft, width: `${splitPercent}%` }}>
                <PdfViewer
                  key={activeTab}
                  url={`${API}/files/${activeTab}/pdf`}
                />
              </div>
              <div
                style={styles.resizeHandle}
                onMouseDown={() => setDragging(true)}
              >
                <div style={styles.resizeGrip} />
              </div>
              <div style={{ ...styles.splitRight, width: `calc(${100 - splitPercent}% - 6px)` }}>
                <RightPanel key={`right-${activeTab}`} fileId={activeTab} />
              </div>
            </div>
          ) : (
            <div style={styles.placeholder}>
              <div style={styles.placeholderIcon}>📄</div>
              <div style={styles.placeholderText}>
                Upload a PDF or select one from the sidebar
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

const styles = {
  sidebar: {
    width: 280,
    minWidth: 280,
    background: "#1a1a1a",
    borderRight: "1px solid #2a2a2a",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
  },
  sidebarHeader: {
    padding: "20px 16px 12px",
    borderBottom: "1px solid #2a2a2a",
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: "-0.02em",
  },
  uploadBtn: {
    margin: "12px 12px 0",
    padding: "10px 16px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  fileList: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
  },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    cursor: "pointer",
    borderLeft: "3px solid transparent",
    transition: "background 0.1s",
  },
  fileItemActive: {
    background: "#252525",
    borderLeftColor: "#2563eb",
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    background: "#dc2626",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  fileInfo: {
    minWidth: 0,
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  fileMeta: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },
  fileDelete: {
    fontSize: 16,
    color: "#555",
    cursor: "pointer",
    flexShrink: 0,
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  empty: {
    padding: "24px 16px",
    textAlign: "center",
    color: "#666",
    fontSize: 13,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  tabBar: {
    display: "flex",
    background: "#141414",
    borderBottom: "1px solid #2a2a2a",
    overflowX: "auto",
    flexShrink: 0,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    fontSize: 13,
    color: "#999",
    cursor: "pointer",
    borderRight: "1px solid #2a2a2a",
    whiteSpace: "nowrap",
    maxWidth: 200,
  },
  tabActive: {
    background: "#1a1a1a",
    color: "#fff",
    borderBottom: "2px solid #2563eb",
  },
  tabName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tabClose: {
    fontSize: 16,
    lineHeight: 1,
    color: "#666",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: "hidden",
  },
  splitView: {
    display: "flex",
    height: "100%",
  },
  splitLeft: {
    height: "100%",
    overflow: "hidden",
    flexShrink: 0,
  },
  resizeHandle: {
    width: 6,
    cursor: "col-resize",
    background: "#2a2a2a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.15s",
  },
  resizeGrip: {
    width: 2,
    height: 32,
    borderRadius: 1,
    background: "#555",
  },
  splitRight: {
    height: "100%",
    overflow: "hidden",
    flexShrink: 0,
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#555",
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 15,
  },
};

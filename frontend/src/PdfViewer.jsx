import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfViewer({ url }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const containerRef = useRef(null);
  const pageRefs = useRef({});

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setCurrentPage(1);
  }

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !numPages) return;

    const containerTop = container.scrollTop + 100;
    let closest = 1;
    let closestDist = Infinity;

    for (let i = 1; i <= numPages; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const dist = Math.abs(el.offsetTop - containerTop);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    setCurrentPage(closest);
  }, [numPages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  function goToPage(page) {
    const el = pageRefs.current[page];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarGroup}>
          <button
            style={styles.toolBtn}
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            &#9650;
          </button>
          <span style={styles.pageInfo}>
            {currentPage} / {numPages || "—"}
          </span>
          <button
            style={styles.toolBtn}
            disabled={!numPages || currentPage >= numPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            &#9660;
          </button>
        </div>
        <div style={styles.toolbarGroup}>
          <button
            style={styles.toolBtn}
            disabled={scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            −
          </button>
          <span style={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
          <button
            style={styles.toolBtn}
            disabled={scale >= 3}
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          >
            +
          </button>
        </div>
      </div>

      <div ref={containerRef} style={styles.scrollContainer}>
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div style={styles.loading}>Loading PDF...</div>}
          error={<div style={styles.error}>Failed to load PDF</div>}
        >
          {numPages &&
            Array.from({ length: numPages }, (_, i) => (
              <div
                key={i + 1}
                ref={(el) => (pageRefs.current[i + 1] = el)}
                style={styles.pageWrapper}
              >
                <Page
                  pageNumber={i + 1}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </div>
            ))}
        </Document>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#2a2a2a",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: "6px 16px",
    background: "#1a1a1a",
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  toolbarGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  toolBtn: {
    background: "#333",
    color: "#ddd",
    border: "1px solid #444",
    borderRadius: 4,
    width: 28,
    height: 28,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pageInfo: {
    fontSize: 13,
    color: "#ccc",
    minWidth: 60,
    textAlign: "center",
  },
  zoomLabel: {
    fontSize: 13,
    color: "#ccc",
    minWidth: 44,
    textAlign: "center",
  },
  scrollContainer: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 0",
  },
  pageWrapper: {
    marginBottom: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
  loading: {
    padding: 40,
    color: "#999",
    fontSize: 14,
  },
  error: {
    padding: 40,
    color: "#e55",
    fontSize: 14,
  },
};

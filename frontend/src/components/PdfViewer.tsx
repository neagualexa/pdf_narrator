import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import StyledButton from "./StyledButton";

// Use external CDN as per official instructions
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  file: string | File | null;
  className?: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ file, className }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [baseWidth, setBaseWidth] = useState<number>(600);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setLoading(false);
      setError(null);
      // Set a reasonable base width based on container
      const containerWidth =
        containerRef.current?.clientWidth || window.innerWidth * 0.4;
      setBaseWidth(Math.min(600, containerWidth - 40)); // 40px for padding
    },
    []
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error("Error loading PDF:", error);
    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  }, []);

  const goToPrevPage = useCallback(() => {
    setPageNumber((page) => Math.max(1, page - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPageNumber((page) => (numPages ? Math.min(numPages, page + 1) : page));
  }, [numPages]);

  const zoomIn = useCallback(() => {
    setScale((prevScale) => Math.min(prevScale + 0.25, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prevScale) => Math.max(prevScale - 0.25, 1.0));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1.0);
  }, []);

  // Handle wheel events for zooming only
  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // Zoom with Ctrl/Cmd + scroll
        event.preventDefault();
        if (event.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
      // Regular scroll now just scrolls within the page normally
    },
    [zoomIn, zoomOut]
  );

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "+":
        case "=":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomIn();
          }
          break;
        case "-":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomOut();
          }
          break;
        case "0":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            resetZoom();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  if (!file) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#a0aec0",
          height: "400px",
        }}
      >
        PDF preview will appear here
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative", height: "100%" }}>
      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2,
          }}
        >
          Loading PDF...
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "red",
            zIndex: 2,
          }}
        >
          {error}
        </div>
      )}

      {/* Scrollable PDF Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        style={{
          height: "calc(100% - 100px)", // Increased from 60px to 80px for more space
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start", // Changed from "center" to allow horizontal scrolling
          padding: "10px",
          backgroundColor: "#f7fafc",
        }}
        tabIndex={0} // Make div focusable for keyboard events
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            minWidth: `${baseWidth * scale}px`, // Ensure minimum width for zoomed content
          }}
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
          >
            <Page
              pageNumber={pageNumber}
              width={baseWidth * scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        </div>
      </div>

      {/* Navigation Controls */}
      {numPages && numPages > 1 && !loading && !error && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px",
            padding: "10px 15px",
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            zIndex: 2,
          }}
        >
          {/* Zoom Controls */}
          <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
            <StyledButton
              onClick={zoomOut}
              disabled={scale <= 0.5}
              type="primary"
              title="Zoom Out (Ctrl + -)"
            >
              -
            </StyledButton>

            <span
              style={{
                fontSize: "12px",
                color: "#4a5568",
                display: "flex",
                alignItems: "center",
                minWidth: "50px",
                justifyContent: "center",
                fontWeight: "500",
              }}
            >
              {Math.round(scale * 100)}%
            </span>

            <StyledButton
              onClick={zoomIn}
              disabled={scale >= 3.0}
              type="primary"
              title="Zoom In (Ctrl + +)"
            >
              +
            </StyledButton>

            <StyledButton
              onClick={resetZoom}
              type="secondary"
              title="Reset Zoom (Ctrl + 0)"
            >
              Reset
            </StyledButton>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "1px",
              height: "30px",
              backgroundColor: "#e2e8f0",
            }}
          />

          {/* Page Navigation */}
          <StyledButton
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            type="primary"
            title="Previous Page"
          >
            ←
          </StyledButton>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{ color: "#4a5568", fontSize: "14px", fontWeight: "500" }}
            >
              {pageNumber}/{numPages}
            </span>
          </div>

          <StyledButton
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            type="primary"
            title="Next Page"
          >
            →
          </StyledButton>

          {/* Divider */}
          <div
            style={{
              width: "1px",
              height: "30px",
              backgroundColor: "#e2e8f0",
            }}
          />

          {/* Help Button */}
          <div style={{ position: "relative" }}>
            <StyledButton
              type="help"
              onMouseEnter={() => setShowHelp(true)}
              onMouseLeave={() => setShowHelp(false)}
              title="Show controls help"
            >
              ?
            </StyledButton>

            {/* Help Content */}
            {showHelp && (
              <div
                style={{
                  position: "absolute",
                  bottom: "45px",
                  right: "0",
                  backgroundColor: "white",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  fontSize: "11px",
                  color: "#4a5568",
                  whiteSpace: "nowrap",
                  zIndex: 10,
                }}
                onMouseEnter={() => setShowHelp(true)}
                onMouseLeave={() => setShowHelp(false)}
              >
                Ctrl+Scroll: zoom • Use buttons to navigate
                <div
                  style={{
                    position: "absolute",
                    bottom: "-4px",
                    right: "12px",
                    width: "8px",
                    height: "8px",
                    backgroundColor: "white",
                    transform: "rotate(45deg)",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import StyledButton from "./StyledButton";
import {
  candidatesForPage,
  findSentenceSegments,
  renderTextItemHtml,
  PdfTextItem,
  SentenceSegment,
} from "../pdfHighlight";

// Use external CDN as per official instructions
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Class marking every sentence wrapper; the hover and playing states are added to it. */
const SENTENCE_SELECTOR = "mark[data-sentence-index]";

interface PdfViewerProps {
  file: string | File | null;
  className?: string;
  /** 1-based page the currently playing sentence came from, if known. */
  activePage?: number | null;
  /** Index of the current sentence, highlighted in the page's text layer. */
  activeSentenceIndex?: number | null;
  /** Every sentence in the document, so the ones on this page can be located. */
  sentences?: string[];
  /** 1-based source page per sentence, parallel to `sentences`. */
  sentencePages?: number[];
  /** Alt+click on a sentence in the page asks for playback to start there. */
  onSentenceActivate?: (index: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  file,
  className,
  activePage,
  activeSentenceIndex,
  sentences = [],
  sentencePages = [],
  onSentenceActivate,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);

  /** The page filling most of the viewport - what the readout reports. */
  const [pageNumber, setPageNumber] = useState<number>(1);

  /** Which pages are close enough to the viewport to be worth rendering. */
  const [renderWindow, setRenderWindow] = useState<{
    first: number;
    last: number;
  }>({ first: 1, last: 1 });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [baseWidth, setBaseWidth] = useState<number>(600);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [followPlayback, setFollowPlayback] = useState<boolean>(true);

  /** Text items per 1-based page, for the pages that have rendered. */
  const [textItemsByPage, setTextItemsByPage] = useState<
    Map<number, PdfTextItem[]>
  >(new Map());

  /**
   * Page height as a multiple of its width, from page 1. Unrendered pages are
   * held open by a spacer of this shape so the scrollbar does not lurch as
   * they mount. A document mixing portrait and landscape will therefore shift
   * slightly when an odd page renders.
   */
  const [pageAspect, setPageAspect] = useState<number>(1.414);

  // Bumped once each time pdf.js finishes building the text layer. Rendering
  // is async and wipes the layer's innerHTML, so the classes marking the
  // playing and hovered sentences have to be re-applied against this.
  const [textLayerVersion, setTextLayerVersion] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Scopes every sentence lookup to this page. The sentence list uses the same
  // data-sentence-index attribute, so an unscoped query would hit its rows too.
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<number | null>(null);
  const armedRef = useRef(false);

  /** Page wrappers by 1-based page number, for scrolling and observing. */
  const pageNodes = useRef<Map<number, HTMLDivElement>>(new Map());
  const windowObserver = useRef<IntersectionObserver | null>(null);
  const viewObserver = useRef<IntersectionObserver | null>(null);
  /** Visible height of each page, so the readout can pick the dominant one. */
  const visibleHeights = useRef<Map<number, number>>(new Map());
  /** Pages within rendering distance of the viewport. */
  const nearPages = useRef<Set<number>>(new Set());
  /** What the follow effect last scrolled to, so it does not fight the user. */
  const followedRef = useRef<{ key: string; onMark: boolean } | null>(null);

  const onDocumentLoadSuccess = useCallback(async (pdf: any) => {
    setNumPages(pdf.numPages);
    setLoading(false);
    setError(null);

    try {
      const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
      if (viewport.width > 0) setPageAspect(viewport.height / viewport.width);
    } catch {
      // Keep the A4-ish default; spacers are only an estimate anyway.
    }
  }, []);

  // Fit-to-width, kept correct as the pane is resized. The old code measured
  // once on load and capped the page at 600px, so the view neither reflowed
  // nor used a wide pane.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Measure the root, not the scroll container: the container's clientWidth
    // changes when its own vertical scrollbar appears, which would feed the
    // page width back into the thing being observed and oscillate.
    const measure = () => {
      const width = root.clientWidth;
      if (width > 0) setBaseWidth(Math.max(240, width - 40)); // 40px padding
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [file]);

  // A new document invalidates every page's text.
  useEffect(() => {
    setTextItemsByPage(new Map());
    setPageNumber(1);
    setRenderWindow({ first: 1, last: 1 });
    pageNodes.current.clear();
    visibleHeights.current.clear();
    nearPages.current.clear();
    followedRef.current = null;
  }, [file]);

  const handleTextItems = useCallback((page: number, items: PdfTextItem[]) => {
    setTextItemsByPage((current) => {
      // A page's text cannot change within a document, and scrolling remounts
      // pages repeatedly. Keeping the first result means a remount does not
      // churn the renderer - which would rebuild every mounted text layer.
      if (current.has(page)) return current;
      const next = new Map(current);
      next.set(page, items);
      return next;
    });
  }, []);

  // Where every locatable sentence sits, per page then per text item. Only
  // pages that have actually rendered are in here, so the cost tracks what is
  // on screen rather than the length of the document.
  const segmentsByPage = useMemo(() => {
    const byPage = new Map<number, Map<number, SentenceSegment[]>>();
    textItemsByPage.forEach((items, page) => {
      const candidates = candidatesForPage(sentences, sentencePages, page);
      byPage.set(page, findSentenceSegments(items, candidates));
    });
    return byPage;
  }, [textItemsByPage, sentences, sentencePages]);

  // Deliberately independent of which sentence is playing or hovered:
  // react-pdf lists this callback in the effect that renders the text layer,
  // and that effect clears the layer and re-runs pdf.js from scratch. Anything
  // transient is a class toggled on the marks below instead.
  const customTextRenderer = useCallback(
    ({
      str,
      itemIndex,
      pageNumber: page,
    }: {
      str: string;
      itemIndex: number;
      pageNumber: number;
    }) => renderTextItemHtml(str, segmentsByPage.get(page)?.get(itemIndex)),
    [segmentsByPage],
  );

  // Must be stable: react-pdf wraps this prop in a callback that its render
  // effect depends on, so a fresh arrow would rebuild the layer every render.
  const handleTextLayerRendered = useCallback(() => {
    setTextLayerVersion((version) => version + 1);
  }, []);

  /** Moves the hover class, which is plain DOM work - no re-render, no relayout. */
  const setHoveredSentence = useCallback((index: number | null) => {
    const root = pageAreaRef.current;
    if (!root || hoveredRef.current === index) return;

    const paint = (target: number | null, on: boolean) => {
      if (target === null) return;
      root
        .querySelectorAll(`mark[data-sentence-index="${target}"]`)
        .forEach((node) => node.classList.toggle("pdf-sentence-hover", on));
    };

    paint(hoveredRef.current, false);
    paint(index, true);
    hoveredRef.current = index;
  }, []);

  /** The sentence index under a pointer event, or null if it missed the text. */
  const sentenceIndexAt = (event: React.MouseEvent): number | null => {
    const target = event.target as HTMLElement | null;
    // The target can be a text node, and the endOfContent div, the item spans
    // and the layer itself all miss the selector - all no-ops.
    const mark = target?.closest?.(SENTENCE_SELECTOR);
    if (!mark) return null;
    const index = Number(mark.getAttribute("data-sentence-index"));
    return Number.isInteger(index) ? index : null;
  };

  // Mark the playing sentence. Re-runs after every text layer build, because
  // that build starts by clearing the classes this added.
  useEffect(() => {
    const root = pageAreaRef.current;
    if (!root) return;

    hoveredRef.current = null;
    if (activeSentenceIndex == null) return;

    const nodes = root.querySelectorAll(
      `mark[data-sentence-index="${activeSentenceIndex}"]`,
    );
    nodes.forEach((node) => node.classList.add("pdf-highlight"));

    return () =>
      nodes.forEach((node) => node.classList.remove("pdf-highlight"));
  }, [activeSentenceIndex, textLayerVersion, pageNumber]);

  /** Shows the armed affordance, reading Alt off the pointer event. Watching
   *  for the key itself would mean a window keydown listener, which on Windows
   *  fights Alt's menu-bar activation. */
  const setArmed = useCallback((armed: boolean) => {
    if (armedRef.current === armed) return;
    armedRef.current = armed;
    pageAreaRef.current?.classList.toggle("pdf-armed", armed);
  }, []);

  // Movement rather than pointerover: that only fires on crossing an element
  // boundary, so pressing Alt while already resting on a word would never arm
  // anything. Both calls below compare against a ref first, so an ordinary
  // move costs two boolean checks.
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Mid drag-select pdf.js stretches .endOfContent over the whole layer,
      // and a tint that followed the drag would only flicker.
      if (event.buttons !== 0) return;

      setArmed(event.altKey);
      setHoveredSentence(sentenceIndexAt(event));
    },
    [setArmed, setHoveredSentence],
  );

  const handlePointerLeave = useCallback(() => {
    setArmed(false);
    setHoveredSentence(null);
  }, [setArmed, setHoveredSentence]);

  // Alt+click starts playback at the sentence under the pointer. Alt keeps the
  // gesture clear of text selection, and is the one modifier that means
  // nothing to either macOS or Windows here. Acting on mousedown rather than
  // click means a drag that starts on the sentence still counts.
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !event.altKey) return;

      const index = sentenceIndexAt(event);
      if (index === null) return;

      event.preventDefault();
      onSentenceActivate?.(index);
    },
    [onSentenceActivate],
  );

  /** Scrolls the container so `node` sits just below the top edge. */
  const scrollNodeToTop = useCallback((node: HTMLElement, offset = 8) => {
    const container = containerRef.current;
    if (!container) return;

    const top =
      container.scrollTop +
      node.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      offset;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Animating a jump of many pages would crawl through the spacers standing
    // in for pages that have not rendered, so only short hops are smoothed.
    const isNearby =
      Math.abs(top - container.scrollTop) < container.clientHeight * 2;

    // Deliberately not scrollIntoView: that would also scroll the app's own
    // ancestors, dragging the whole two-pane layout around.
    container.scrollTo({
      top,
      behavior: prefersReducedMotion || !isNearby ? "auto" : "smooth",
    });
  }, []);

  const scrollToPage = useCallback(
    (page: number) => {
      const node = pageNodes.current.get(page);
      if (node) scrollNodeToTop(node);
    },
    [scrollNodeToTop],
  );

  // Two observers, because the two questions have different answers: which
  // pages to render reaches well beyond the viewport, while the page readout
  // must only count what is actually on screen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages) return;

    const pageOf = (entry: IntersectionObserverEntry) =>
      Number((entry.target as HTMLElement).dataset.pageNumber);

    // The containers themselves never change identity; bind them here so the
    // cleanup below is not reading a ref at teardown time.
    const near_ = nearPages.current;
    const heights = visibleHeights.current;

    const near = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const page = pageOf(entry);
          if (entry.isIntersecting) near_.add(page);
          else near_.delete(page);
        });

        const pages = Array.from(near_);
        if (pages.length === 0) return;

        const next = { first: Math.min(...pages), last: Math.max(...pages) };
        setRenderWindow((current) =>
          current.first === next.first && current.last === next.last
            ? current
            : next,
        );
      },
      // Roughly a screen of slack either way, so scrolling meets rendered
      // pages rather than blank spacers.
      { root: container, rootMargin: "120% 0px" },
    );

    const view = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const page = pageOf(entry);
          if (entry.isIntersecting) {
            heights.set(page, entry.intersectionRect.height);
          } else {
            heights.delete(page);
          }
        });

        let dominant = 0;
        let best = 0;
        heights.forEach((height, page) => {
          if (height > best) {
            best = height;
            dominant = page;
          }
        });
        if (dominant > 0) setPageNumber(dominant);
      },
      { root: container, threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] },
    );

    windowObserver.current = near;
    viewObserver.current = view;
    pageNodes.current.forEach((node) => {
      near.observe(node);
      view.observe(node);
    });

    return () => {
      near.disconnect();
      view.disconnect();
      windowObserver.current = null;
      viewObserver.current = null;
      heights.clear();
      near_.clear();
    };
  }, [numPages, file]);

  /** Ref callback on each page wrapper; the returned cleanup needs React 19. */
  const attachPage = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const page = Number(node.dataset.pageNumber);
    pageNodes.current.set(page, node);
    windowObserver.current?.observe(node);
    viewObserver.current?.observe(node);

    return () => {
      pageNodes.current.delete(page);
      visibleHeights.current.delete(page);
      windowObserver.current?.unobserve(node);
      viewObserver.current?.unobserve(node);
    };
  }, []);

  // Follow playback down the document, unless the user has taken over. Scrolls
  // to the sentence itself once its page has rendered, and to the top of the
  // page before that - so a page still mounting is not left off screen.
  useEffect(() => {
    if (!followPlayback) return;
    if (!activePage || !numPages) return;
    if (activePage < 1 || activePage > numPages) return;

    const pageNode = pageNodes.current.get(activePage);
    if (!pageNode) return;

    const mark =
      activeSentenceIndex == null
        ? null
        : pageNode.querySelector<HTMLElement>(
            `mark[data-sentence-index="${activeSentenceIndex}"]`,
          );

    // Re-scroll only when the target changed, or when the sentence's mark has
    // since appeared - otherwise every text-layer rebuild would yank the view.
    const key = `${activePage}:${activeSentenceIndex}`;
    const followed = followedRef.current;
    if (followed?.key === key && (followed.onMark || !mark)) return;
    followedRef.current = { key, onMark: Boolean(mark) };

    // A quarter-screen of lead-in, so the sentence is not flush against the
    // top edge with all its context above the fold.
    if (mark) scrollNodeToTop(mark, (containerRef.current?.clientHeight ?? 0) / 4);
    else scrollNodeToTop(pageNode);
  }, [
    followPlayback,
    activePage,
    activeSentenceIndex,
    numPages,
    textLayerVersion,
    scrollNodeToTop,
  ]);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error("Error loading PDF:", error);
    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  }, []);

  // Paging by hand is an explicit takeover, so it releases follow mode rather
  // than being undone by the next sentence.
  const goToPrevPage = useCallback(() => {
    setFollowPlayback(false);
    scrollToPage(Math.max(1, pageNumber - 1));
  }, [pageNumber, scrollToPage]);

  const goToNextPage = useCallback(() => {
    setFollowPlayback(false);
    scrollToPage(numPages ? Math.min(numPages, pageNumber + 1) : pageNumber);
  }, [numPages, pageNumber, scrollToPage]);

  const zoomIn = useCallback(() => {
    setScale((prevScale) => Math.min(prevScale + 0.25, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prevScale) => Math.max(prevScale - 0.25, 0.5));
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
          height: "100%",
        }}
      >
        PDF preview will appear here
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: "relative", height: "100%" }}
    >
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
          alignItems: "stretch", // The page column centres itself; stretching keeps horizontal scrolling
          padding: "10px",
          backgroundColor: "#f7fafc",
        }}
        tabIndex={0} // Make div focusable for keyboard events
      >
        <div
          ref={pageAreaRef}
          className="pdf-page-area"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onMouseDown={handleMouseDown}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            minWidth: `${baseWidth * scale}px`, // Ensure minimum width for zoomed content
          }}
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
          >
            {/* Every page is laid out so the whole document can be scrolled,
                but only the pages near the viewport are actually rendered -
                the rest are spacers of the same shape, which keeps a long
                document from costing a canvas and a text layer per page. */}
            {Array.from({ length: numPages ?? 0 }, (_, i) => i + 1).map(
              (page) => {
                const width = baseWidth * scale;
                const isRendered =
                  page >= renderWindow.first && page <= renderWindow.last;

                return (
                  <div
                    key={page}
                    ref={attachPage}
                    data-page-number={page}
                    className="pdf-page"
                    style={{
                      width,
                      minHeight: isRendered ? undefined : width * pageAspect,
                      backgroundColor: "white",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    }}
                  >
                    {isRendered && (
                      <Page
                        pageNumber={page}
                        width={width}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        onGetTextSuccess={(textContent) =>
                          handleTextItems(
                            page,
                            (textContent?.items ?? []) as PdfTextItem[],
                          )
                        }
                        customTextRenderer={customTextRenderer}
                        onRenderTextLayerSuccess={handleTextLayerRendered}
                      />
                    )}
                  </div>
                );
              },
            )}
          </Document>
        </div>
      </div>

      {/* Navigation Controls */}
      {numPages && !loading && !error && (
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

          {/* Follow playback */}
          <StyledButton
            type="toolbar"
            active={followPlayback}
            onClick={() => setFollowPlayback((on) => !on)}
            title={
              followPlayback
                ? "Follow playback: on - the page turns with the narration"
                : "Follow playback: off - click to track the narration again"
            }
          >
            <svg
              width="13"
              height="13"
              fill="currentColor"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z" />
              <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z" />
            </svg>
            Follow
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
                Ctrl+Scroll: zoom • Alt+Click text: play from that sentence •
                Follow: page turns with narration
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

import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import { CONFIG } from "../config";
import { runPythonScript } from "../pythonRunner";
import { readPdf, renderPages, stripRunningHeads, stripUnreadSections } from "../pdfText";

const router = Router();
const upload = multer({ dest: CONFIG.UPLOAD_DIR });

// Route to handle PDF file upload and text extraction
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    try {
      const dataBuffer = fs.readFileSync(req.file.path);

      // Each page's runs are collected first, so the text can be laid out
      // against the whole document's body text size. renderPages rebuilds the
      // text from run geometry, which is what keeps OCR'd pages (one
      // positioned run per word, no space characters) from collapsing into
      // "providegrounds".
      const pages = await readPdf(new Uint8Array(dataBuffer));
      const pageTexts = renderPages(pages);

      fs.unlinkSync(req.file.path);

      // Running heads repeat on every page and would otherwise be narrated in
      // the middle of any sentence that spans a page break. They go first, so
      // one cannot sit inside a notes or references section and cut it short.
      const cleanedPages = stripUnreadSections(stripRunningHeads(pageTexts));

      // Sentinels the splitter consumes to tag each sentence with its page.
      const markedText = cleanedPages
        .map((text, i) => `\n\n<<<PDFPAGE:${i + 1}>>>\n\n${text}`)
        .join("");

      const result = await runPythonScript(
        CONFIG.SCRIPTS.SENTENCE_SPLITTER,
        markedText
      );

      if (result.code === 0) {
        const parsed = JSON.parse(result.stdout);
        res.json({
          sentences: parsed.sentences,
          pages: parsed.pages,
          numPages: pages.length,
        });
      } else {
        console.error(`Sentence splitter script error:`, result.stderr);
        res
          .status(500)
          .json({ error: "Failed to execute sentence splitter script." });
      }
    } catch (error) {
      console.error("Error processing PDF:", error);
      res.status(500).json({ error: "Failed to process PDF file." });
    }
  }
);

export default router;

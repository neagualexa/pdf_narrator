import { Router, Request, Response } from "express";
import multer from "multer";
import pdf from "pdf-parse";
import fs from "fs";
import { CONFIG } from "../config";
import { runPythonScript } from "../pythonRunner";

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

      // Capture each page's text as it renders so sentences can be attributed
      // to a source page. This mirrors pdf-parse's own default renderer; we
      // only intercept the per-page result on the way past.
      const pageTexts: string[] = [];
      const data = await pdf(dataBuffer, {
        pagerender: async (pageData: any): Promise<string> => {
          const textContent = await pageData.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false,
          });

          let lastY: number | undefined;
          let text = "";
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += "\n" + item.str;
            }
            lastY = item.transform[5];
          }

          pageTexts.push(text);
          return text;
        },
      });

      fs.unlinkSync(req.file.path);

      // Sentinels the splitter consumes to tag each sentence with its page.
      const markedText = pageTexts
        .map((text, i) => `\n\n<<<PDFPAGE:${i + 1}>>>\n\n${text}`)
        .join("");

      const result = await runPythonScript(CONFIG.SCRIPTS.SENTENCE_SPLITTER, [
        markedText,
      ]);

      if (result.code === 0) {
        const parsed = JSON.parse(result.stdout);
        res.json({
          sentences: parsed.sentences,
          pages: parsed.pages,
          numPages: data.numpages,
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

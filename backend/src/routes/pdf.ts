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
      const data = await pdf(dataBuffer);

      fs.unlinkSync(req.file.path);

      const result = await runPythonScript(CONFIG.SCRIPTS.SENTENCE_SPLITTER, [
        data.text,
      ]);

      if (result.code === 0) {
        const sentences = JSON.parse(result.stdout);
        res.json({ sentences });
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

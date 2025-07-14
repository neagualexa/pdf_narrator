import { Router } from "express";
import pdfRouter from "./pdf";
import audioRouter from "./audio";
import ttsRouter from "./tts";

const router = Router();

// Mount route modules
router.use("/", pdfRouter);
router.use("/", audioRouter);
router.use("/", ttsRouter);

export default router;

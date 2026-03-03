import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { getPeerKeyBundle, upsertMyKeyBundle } from "../controllers/e2ee.controller.js";

const router = Router();

router.put("/me/bundle", authMiddleware, upsertMyKeyBundle);
router.get("/bundles/:role/:profileId", authMiddleware, getPeerKeyBundle);

export default router;

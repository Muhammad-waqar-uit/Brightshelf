import { Router } from "express";

const router = Router();

router.use((_request, response) => {
  response.status(501).json({ error: "Not implemented" });
});

export default router;
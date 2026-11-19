import { Router } from "express";
import { HttpError, uid } from "../lib/http.ts";
import { syncNow, syncStatus, syncUserId } from "../lib/githubSync.ts";

/** GitHub mirror status and a "sync now" trigger, for the account that is mirrored. */
export const syncRouter = Router();

syncRouter.get("/github", async (req, res) => {
  const status = syncStatus();
  if (!status.configured) {
    res.json(status);
    return;
  }
  const owner = await syncUserId();
  // Other accounts on the same server don't see someone else's mirror.
  res.json(owner === uid(req) ? { ...status, isOwner: true } : { configured: false, running: false });
});

syncRouter.post("/github", async (req, res) => {
  if (!syncStatus().configured) throw new HttpError(400, "GitHub sync isn't set up on the server");
  const userId = uid(req);
  if ((await syncUserId()) !== userId) throw new HttpError(403, "GitHub sync is set up for a different account");
  try {
    const result = await syncNow(userId, "Manual sync from DevSpace");
    res.json({ ...result, status: syncStatus() });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : "Sync failed");
  }
});

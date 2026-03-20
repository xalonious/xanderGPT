import { Router } from "express";
import asyncHandler from "../core/asyncHandler";
import { validateRequest } from "../core/validation";
import * as convoService from "../service/conversationService";
import {
  createConversationSchema,
  updateConversationSchema,
  sendMessageSchema,
  sendTempMessageSchema,
} from "../validation/conversation";

const router = Router();

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  return anyErr?.name === "AbortError" || anyErr?.code === "ABORT_ERR";
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const conversations = await convoService.listConversations(req.user!.id);
    res.json({ conversations });
  })
);

router.post(
  "/",
  validateRequest(createConversationSchema),
  asyncHandler(async (req, res) => {
    const conversation = await convoService.createConversation(
      req.user!.id,
      req.body.title,
      req.body.systemPrompt
    );
    res.status(201).json({ conversation });
  })
);

router.post(
  "/temp/stream",
  validateRequest(sendTempMessageSchema),
  asyncHandler(async (req, res) => {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const ac = new AbortController();
    let clientGone = false;

    const markGoneAndAbort = () => {
      if (clientGone) return;
      clientGone = true;
      try {
        ac.abort();
      } catch {
      }
    };

    req.on("aborted", markGoneAndAbort);
    req.on("close", markGoneAndAbort);
    res.on("close", markGoneAndAbort);

    const safeWriteLine = (obj: unknown) => {
      if (clientGone || res.writableEnded) return;
      try {
        res.write(JSON.stringify(obj) + "\n");
      } catch {
        markGoneAndAbort();
      }
    };

    const webSearchMode = (req.body.webSearch ?? "auto") as "auto" | "force" | "off";

    try {
      const result = await convoService.sendTemporaryMessageStream(
        req.body.content,
        req.body.history ?? [],
        req.body.systemPrompt ?? "",
        {
          onToken: (token) => safeWriteLine({ type: "token", token }),
          webSearchMode,
          onToolEvent: (evt) => safeWriteLine(evt),
          signal: ac.signal,
        }
      );

      if (clientGone || result.aborted) {
        try {
          res.end();
        } catch {
        }
        return;
      }

      safeWriteLine({ type: "done" });
      res.end();
    } catch (err: any) {
      if (clientGone || ac.signal.aborted || isAbortError(err)) {
        try {
          res.end();
        } catch {
        }
        return;
      }

      safeWriteLine({ type: "error", message: err?.message ?? "Stream failed" });
      res.end();
      return;
    }
  })
);

router.patch(
  "/:id",
  validateRequest(updateConversationSchema),
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id as string;

    const conversation = await convoService.updateConversation(req.user!.id, conversationId, {
      title: req.body.title,
      systemPrompt: req.body.systemPrompt,
    });

    res.json({ conversation });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id as string;
    await convoService.deleteConversation(req.user!.id, conversationId);
    res.status(204).send();
  })
);

router.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id as string;
    const messages = await convoService.getConversationMessages(req.user!.id, conversationId);
    res.json({ messages });
  })
);

router.post(
  "/:id/messages",
  validateRequest(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id as string;
    const message = await convoService.sendMessageNonStream(
      req.user!.id,
      conversationId,
      req.body.content
    );
    res.status(201).json({ message });
  })
);

router.post(
  "/:id/messages/stream",
  validateRequest(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id as string;

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const ac = new AbortController();
    let clientGone = false;

    const markGoneAndAbort = () => {
      if (clientGone) return;
      clientGone = true;
      try {
        ac.abort();
      } catch {
      }
    };

    req.on("aborted", markGoneAndAbort);
    req.on("close", markGoneAndAbort);
    res.on("close", markGoneAndAbort);

    const safeWriteLine = (obj: unknown) => {
      if (clientGone || res.writableEnded) return;
      try {
        res.write(JSON.stringify(obj) + "\n");
      } catch {
        markGoneAndAbort();
      }
    };

    const webSearchMode = (req.body.webSearch ?? "auto") as "auto" | "force" | "off";

    try {
      const result = await convoService.sendMessageStream(
        req.user!.id,
        conversationId,
        req.body.content,
        {
          onToken: (token) => safeWriteLine({ type: "token", token }),
          webSearchMode,
          onToolEvent: (evt) => safeWriteLine(evt),
          signal: ac.signal,
        }
      );

      if (clientGone || result.aborted) {
        try {
          res.end();
        } catch {
        }
        return;
      }

      if (result.titleUpdated) {
        safeWriteLine({ type: "title", title: result.titleUpdated });
      }

      safeWriteLine({ type: "done" });
      res.end();
    } catch (err: any) {
      if (clientGone || ac.signal.aborted || isAbortError(err)) {
        try {
          res.end();
        } catch {
        }
        return;
      }

      safeWriteLine({ type: "error", message: err?.message ?? "Stream failed" });
      res.end();
      return;
    }
  })
);

export default router;
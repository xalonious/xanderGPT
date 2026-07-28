import Joi from "joi";

const MAX_BASE64_IMAGE_LENGTH = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 4;

const attachmentSchema = Joi.object({
  kind: Joi.string().valid("image").required(),
  name: Joi.string().trim().min(1).max(255).required(),
  mimeType: Joi.string()
    .valid("image/jpeg", "image/png", "image/webp", "image/gif")
    .required(),
  size: Joi.number().integer().min(1).max(8 * 1024 * 1024).required(),
  data: Joi.string().min(4).max(MAX_BASE64_IMAGE_LENGTH).required(),
});

const messageBodyFields = {
  content: Joi.string().allow("").max(20000).required(),
  attachments: Joi.array().items(attachmentSchema).max(4).optional().default([]),
  webSearch: Joi.string().valid("auto", "force", "off").optional().default("auto"),
  thinking: Joi.string().valid("auto", "force", "off").optional().default("auto"),
};

export const createConversationSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    systemPrompt: Joi.string().allow("").max(4000).optional(),
  }),
};

export const updateConversationSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(255).optional(),
    systemPrompt: Joi.string().allow("").max(4000).optional(),
  }).or("title", "systemPrompt"),
};

export const searchConversationsSchema = {
  query: Joi.object({
    q: Joi.string().trim().min(1).max(200).required(),
  }),
};

export const sendMessageSchema = {
  body: Joi.object(messageBodyFields),
};

export const sendTempMessageSchema = {
  body: Joi.object({
    ...messageBodyFields,
    systemPrompt: Joi.string().allow("").max(4000).optional(),
    contextSummary: Joi.string().allow("", null).max(12000).optional(),
    compactedMessageCount: Joi.number().integer().min(0).max(100000).optional().default(0),
    webSearch: Joi.string().valid("auto", "force", "off").optional().default("auto"),
    thinking: Joi.string().valid("auto", "force", "off").optional().default("auto"),
    history: Joi.array()
      .items(
        Joi.object({
          role: Joi.string().valid("user", "assistant").required(),
          content: Joi.string().allow("").max(20000).required(),
          attachments: Joi.array().items(attachmentSchema).max(4).optional().default([]),
        })
      )
      .max(100)
      .default([]),
  }),
};

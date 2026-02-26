import Joi from "joi";

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

export const sendMessageSchema = {
  body: Joi.object({
    content: Joi.string().min(1).max(20000).required(),
    webSearch: Joi.string().valid("auto", "force", "off").optional().default("auto"),
  }),
};
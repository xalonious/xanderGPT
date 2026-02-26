import Joi from "joi";

export const registerSchema = {
  body: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().min(8).max(200).required(),
  }),
};

export const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().max(200).required(),
  }),
};
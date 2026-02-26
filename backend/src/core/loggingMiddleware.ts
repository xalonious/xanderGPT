import type { Request, Response, NextFunction } from 'express';
import { getLogger } from "./logging";

const logger = getLogger();

const getStatusEmoji = (status: number) => {
    if(status >= 500) return "💀";
    if(status >= 400) return "❌";
    if(status >= 300) return "🔀"
    if(status >= 200) return "✅";
    return "🔄";
};

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
    logger.info(`⏩ ${req.method} ${req.url}`);

    res.on("finish", () => {
        const emoji = getStatusEmoji(res.statusCode);
        logger.info(`${emoji} ${req.method} ${res.statusCode} ${req.url}`)
    });

    next();
}
import pino from 'pino';
import { getConfig } from './config.js';

const cfg = getConfig();

export const logger = pino({
  level: cfg.logLevel,
  base: undefined,
  redact: ['req.headers.authorization'],
});

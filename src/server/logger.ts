import pino from 'pino';
export const log = pino({level:process.env.LOG_LEVEL || 'info',redact:{paths:['password','apiKey','access_token','refresh_token','headers.authorization','encryptedKey','token','cookie'],censor:'[REDACTED]'}});

import { z } from 'zod';
import { ERROR_CODES, SOCKET_ERROR_CODES } from '../errors';

/** Codes the engine returns in a command result. */
export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const SocketErrorCodeSchema = z.enum(SOCKET_ERROR_CODES);

/** Codes the server may send in an error message: engine codes plus socket codes. */
export const ServerErrorCodeSchema = z.enum([...ERROR_CODES, ...SOCKET_ERROR_CODES]);

export type ServerErrorCode = z.infer<typeof ServerErrorCodeSchema>;

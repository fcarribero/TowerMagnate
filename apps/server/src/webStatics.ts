import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const HASHED_ASSET_FOLDER = 'assets';
const LONG_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
const SERVER_ROUTE_PREFIXES = ['/api/', '/ws'];

/** Serves the built web client, with the game page as the answer for any other page route. */
export function registerWebStatics(app: FastifyInstance, webDir: string): void {
  const indexFile = join(webDir, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`Web build not found: ${indexFile} is missing`);
  }

  app.register(fastifyStatic, {
    root: webDir,
    wildcard: true,
    cacheControl: false,
    setHeaders: (response, filePath) => {
      response.setHeader('Cache-Control', cacheControlFor(filePath, webDir));
    },
  });

  app.setNotFoundHandler((request, reply) => {
    if (wantsGamePage(request)) {
      return reply.header('Cache-Control', REVALIDATE).sendFile('index.html');
    }
    return sendNotFound(request, reply);
  });
}

function cacheControlFor(filePath: string, webDir: string): string {
  const [topFolder] = relative(webDir, filePath).split(sep);
  return topFolder === HASHED_ASSET_FOLDER ? LONG_CACHE : REVALIDATE;
}

function wantsGamePage(request: FastifyRequest): boolean {
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  const isServerRoute = SERVER_ROUTE_PREFIXES.some((prefix) => request.url.startsWith(prefix));
  const looksLikeFile = /\.[a-z0-9]+(\?|$)/i.test(request.url);
  const acceptsHtml = request.headers.accept?.includes('text/html') ?? false;
  return isRead && !isServerRoute && !looksLikeFile && acceptsHtml;
}

function sendNotFound(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.code(404).send({
    message: `Route ${request.method}:${request.url} not found`,
    error: 'Not Found',
    statusCode: 404,
  });
}

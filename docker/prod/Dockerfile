FROM node:22-alpine AS build

RUN npm install --global pnpm@10.18.3

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @tower-magnate/server... --filter @tower-magnate/web...
RUN pnpm --filter @tower-magnate/web build \
  && pnpm --filter @tower-magnate/server build \
  && pnpm --filter @tower-magnate/server deploy --legacy --prod /deploy/server

FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIR=/app/web

WORKDIR /app/server
COPY --from=build /deploy/server/package.json ./package.json
COPY --from=build /deploy/server/node_modules ./node_modules
COPY --from=build /deploy/server/migrations ./migrations
COPY --from=build /deploy/server/build ./build
COPY --from=build /repo/apps/web/dist /app/web

USER node
EXPOSE 3000
CMD ["node", "build/main.js"]

FROM oven/bun:1.4.4 AS build

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --ignore-scripts

RUN cd apps/site && bun run browser:install && bun run build

FROM oven/bun:1.4.4

WORKDIR /app

COPY --from=build /app /app

WORKDIR /app/apps/site

ENV HOST=0.0.0.0
ENV PORT=4190
ENV NODE_ENV=production

USER 1000

EXPOSE 4190

CMD ["bun", "scripts/serve.ts"]

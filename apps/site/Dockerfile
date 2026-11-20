FROM oven/bun:1.4.4

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

RUN cd apps/site && bun run build

ENV HOST=0.0.0.0
ENV PORT=4190

EXPOSE 4190

CMD ["bun", "apps/site/scripts/serve.ts"]

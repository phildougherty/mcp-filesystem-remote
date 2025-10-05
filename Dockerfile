FROM node:22.12-alpine AS builder
WORKDIR /app
COPY . /app
RUN --mount=type=cache,target=/root/.npm npm install
RUN --mount=type=cache,target=/root/.npm npm run build

FROM node:22-alpine AS release
WORKDIR /app
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
ENV NODE_ENV=production
RUN npm ci --ignore-scripts --omit-dev

# Expose port for SSE transport
EXPOSE 3000

ENTRYPOINT ["node", "/app/dist/index.js"]

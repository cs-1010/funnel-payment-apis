# syntax=docker/dockerfile:1
#
# Security: do NOT add ARG/ENV here for API keys, JWT_SECRET, passwords, etc.
# Those belong only in Railway → Variables (injected at runtime, not in image layers).
# See: https://docs.docker.com/go/dockerfile/rule/secrets-used-in-arg-or-env/

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

# Railway sets PORT; Nest reads process.env.PORT in src/main.ts
CMD ["node", "dist/main.js"]

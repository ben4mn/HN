FROM node:22-alpine

WORKDIR /app

# Install server deps first so the layer caches across static-only changes.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev 2>/dev/null || (cd server && npm install --omit=dev)

# Static PWA + server source
COPY index.html manifest.webmanifest sw.js robots.txt sitemap.xml ./
COPY static ./static
COPY server ./server

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
# Stamp the build into the service worker so every deploy invalidates the cached shell.
RUN sed -i "s/^const VERSION = '\([^']*\)';/const VERSION = '\1+$APP_VERSION';/" sw.js && grep -m1 "const VERSION" sw.js
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]

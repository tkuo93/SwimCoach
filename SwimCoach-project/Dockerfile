FROM node:18-alpine

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy source code (includes public/ frontend)
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser
USER appuser

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:10000/health || exit 1

CMD ["node", "src/index.js"]

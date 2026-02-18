FROM node:20-slim

WORKDIR /app

# Install Playwright system dependencies (minimal set for Chromium)
# These are needed when USE_PLAYWRIGHT=true, but don't hurt when it's false
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

# Install Playwright browsers (only Chromium)
# This ensures Playwright works when USE_PLAYWRIGHT=true
# If Playwright is not installed, this will fail gracefully
RUN npx playwright install chromium || echo "Playwright not available, skipping browser install"

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
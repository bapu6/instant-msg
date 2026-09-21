FROM node:20-alpine

WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building)
RUN npm install

# Copy source files
COPY src/ ./src/
COPY conf/ ./conf/
COPY scripts/ ./scripts/

# Build TypeScript to dist
RUN npm run build

EXPOSE 5000

ENV NODE_ENV=production
ENV BACKEND_PORT=5000

CMD ["node", "dist/server.js"]

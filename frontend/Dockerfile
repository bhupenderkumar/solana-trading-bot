# Frontend Dockerfile for Railway deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

# Copy package files
COPY package*.json ./

# Install dependencies (with native modules support)
RUN npm install --legacy-peer-deps

# Copy source files
COPY . .

# Accept build-time environment variable for API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application (VITE_API_URL will be baked into the bundle)
RUN npm run build

# Production stage - use serve to host static files
FROM node:20-alpine AS runner

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway provides PORT env var)
EXPOSE 3000

# Start the server using PORT env var (Railway sets this)
CMD ["sh", "-c", "serve dist -s -l ${PORT:-3000}"]

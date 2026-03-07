# Use the official Node.js 20 slim image
FROM node:20-slim

# Create and set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# Cloud Run provides PORT env variable (default 8080)
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]

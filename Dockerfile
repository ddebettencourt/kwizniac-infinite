FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/

# Install all dependencies
RUN npm run install:all

# Copy source code
COPY . .

# Build client
RUN npm run build

# Start server
ENV NODE_ENV=production
CMD ["npm", "start"]

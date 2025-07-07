# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your code
COPY . .

# Expose the port your API runs on (change if needed)
EXPOSE 3000

# Start the API
CMD ["node", "src/server.js"]

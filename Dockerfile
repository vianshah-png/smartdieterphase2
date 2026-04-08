# Use the official Node.js runtime as a base image (Debian-based)
FROM node:20-bullseye

# Install dependencies required for canvas and other native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    pkg-config

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY . .

RUN rm -rf node_modules

# Remove node_modules on the host machine, if present

# Install all node modules inside the container
RUN npm install --force

# Copy the rest of your application code

# Expose the port the app runs on
EXPOSE 3000

# Command to run your application
CMD [ "npm", "run" ,"dev" ]

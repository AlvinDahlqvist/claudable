FROM node:20-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4000 5180
CMD ["npm", "run", "dev"]

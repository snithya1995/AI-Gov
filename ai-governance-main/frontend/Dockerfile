FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_BACKEND_URL=/api
ARG VITE_AGENT_URL=/agent

ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_AGENT_URL=${VITE_AGENT_URL}

RUN npm run build


FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

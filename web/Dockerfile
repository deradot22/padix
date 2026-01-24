FROM docker.io/library/node:20-alpine AS build
WORKDIR /app

COPY package.json /app/
RUN npm install

COPY . /app

# Build-time API base URL. For nginx proxy setup we use same-origin (empty).
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM docker.io/library/nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80


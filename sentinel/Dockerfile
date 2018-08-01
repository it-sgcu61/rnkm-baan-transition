FROM node:10-alpine
WORKDIR /backend
VOLUME [ "node_modules/" ]
COPY ./ /backend
RUN npm install
CMD [ "node", "app.js" ]

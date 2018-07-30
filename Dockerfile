FROM node:9
WORKDIR /backend
VOLUME [ "node_modules/" ]
COPY ./ /backend
RUN npm install
CMD [ "node", "app.js" ]
EXPOSE 3000

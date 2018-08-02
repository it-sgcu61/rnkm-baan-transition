FROM node:9
WORKDIR /backend
COPY ./ /backend
RUN npm install
CMD [ "node", "app.js" ]
EXPOSE 3000

var createError = require('http-errors');
var fs = require('fs');
var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var https = require('https');
var path = require('path');
var sha256 = require('sha256')
var cors = require('cors')
var request = require('superagent');

var mongoose = require('mongoose');


var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'twig');

const agent = request.agent();



var houseSchema = mongoose.Schema({
  name: String,
  cap: Number,
  count: Number
});
var personSchema = mongoose.Schema({
  id: String,
  tel: String,
  token: String,
  tokenExpire: Number,
  locked: Number,
  house: String
});
var tokenSchema = mongoose.Schema({
  id: String,
  tel: String,
  token: String,
  tokenExpire: Number
});
mongoose.model('Token', tokenSchema, 'token');
mongoose.model('Person', personSchema, 'person');
mongoose.model('House', houseSchema, 'house');

var options = {
  ca: fs.readFileSync('./bundle.crt'),
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.crt')
}
var config = require('./config')
const personRouter = require('./routes/person');
const infoRouter = require('./routes/info');

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

async function setupDTNL() {
  var challenge_request = await agent.get(`http://${config.dtnlADDR}/api/v1/greeting`).withCredentials()
  var login_result = await agent.post(`http://${config.dtnlADDR}/api/v1/login`)
  .send({
    username: config.dtnlUser,
    password: sha256(sha256(config.dtnlPassword) + challenge_request.body.challenge)
  })
  // .ca(options)
  .withCredentials().catch((err) => console.log(err))
  console.log(challenge_request.body, login_result.body)
  if (login_result.body.permission == -1) {
    throw new Error("Failed to connect to DTNL system.")
  } else {
    var tableFetch = await agent.get(`http://${config.dtnlADDR}/api/v1/get/tableList`).withCredentials()
    if (tableFetch.body.tableList.includes(config.rnkmTablename)) {
      throw new Error("Table configuration invalid.")
    }
    // console.log(agent.);
    return Promise.resolve(agent)
  }
}
app.set('view', 'jade');

const port = normalizePort(process.env.PORT || '3000');
setupDTNL().then((agent) => {
  app.use(cors())
  app.use(logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('/', personRouter(agent));
  app.use('/', infoRouter(agent));

  app.use(function (req, res, next) {
    next(createError(404));
  });
  // error handler
  // app.use(function (err, req, res, next) {
  //   // set locals, only providing error in development
  //   res.locals.message = err.message;
  //   res.locals.error = req.app.get('env') === 'development' ? err : {};
  //   // render the error page
  //   res.status(err.status || 500);
  //   res.send("<h1 style='margin-bottom:30px'>sorry, but something went wrong. </h1> RNKM Middle-API system <br/> © 2018 Computer Engineering Student, Chulalongkorn University")
  // });
  app.set('port', port);
  var server = https.createServer(options, app);
  server.listen(port);
  server.on('error', onError);
})
  .catch((error) => { throw error; process.exit(1) })

var createError = require('http-errors');
var fs = require('fs');
var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var https = require('https');
var path = require('path');
var cors = require('cors')
var admin = require('firebase-admin');

const personRouter = require('./routes/person');
var firebaseKey = require('./firebaseKey.json');
var setupDTNL = require('./utils/connect').setupDTNL;
var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'twig');


var options = {
  ca: fs.readFileSync('./bundle.crt'),
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.crt')
}

admin.initializeApp({
  credential: admin.credential.cert(firebaseKey),
  databaseURL: 'https://rnkm-cu102.firebaseio.com'
});

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

app.set('view', 'jade');

const port = normalizePort(process.env.PORT || '3000');

setupDTNL().then((agent) => {
  app.use(cors())
  app.use(logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('/', personRouter(agent));

  app.use(function (req, res, next) {
    next(createError(404));
  });
  // error handler
  app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    // render the error page
    res.status(err.status || 500);
    res.send("<h1 style='margin-bottom:30px'>sorry, but something went wrong. </h1> RNKM BAAN-TRANSITION-API system <br/> © 2018 Computer Engineering Student, Chulalongkorn University")
  });
  app.set('port', port);
  var server = https.createServer(options, app);
  console.log("Listening on port", port)
  server.listen(port);
  server.on('error', onError);
}).catch((error) => { console.log(error); process.exit(1) })

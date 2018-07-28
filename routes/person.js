var express = require('express');
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require('redis'));
var bcrypt = require('bcrypt');

var util = require('./util'),
  Resp = util.makeResponse;
var config = require('../config');
var query = require('./connect').query; // query to DTNL (batched reponse)

// var conn = mongoose.createConnection(config.mongoURL);

var acc = [];
var lock = 0, cap = 10, delay = 2000;  

module.exports = function (agent) {
  var router = express.Router();
  router.post('/login', async function (req, res, next) {
    var { id, tel } = req.body;
    query(agent, req.body, async (data) => {
      if (data) {
        try {
          std = data[0];
          var token = await bcrypt.hash(Date.now().toString(16), 8);
          var d = new Date();
          d.setTime(d.getTime() + config.tokenAge);

          var person = await Person.findOne({ id: id, tel: tel });
          if (person) {
            // delete old token, update person, create new token
            Token.findOneAndRemove({ token: person.token }).exec();
            Person.findByIdAndUpdate(person._id, {
              token: token,
              tokenExpire: d.getTime()
            }, (err, updated) => {
              if (err)
                res.send(Resp(false, 'Error'));
              else {

                res.send(Resp(true, 'OK!', { token: token, tokenExpire: d.getTime() }))
              }
            })
            Token.create({ token: token, tokenExpire: d.getTime(), id: id, tel: tel })
          }
          else {
            Person.create([{
              id: std[config.idColumn],
              tel: std[config.telColumn],
              token: token,
              tokenExpire: d.getTime(),
              locked: 0,
              house: std[config.houseColumn],
            }])
              .then(() => {
                console.log(`[WARNING] user:${id} not initially in db!`);
                res.send(Resp(true, 'OK??', { token: token, tokenExpire: d.getTime() }))
              });
            Token.create({ token: token, tokenExpire: d.getTime(), id: id, tel: tel })
          }
        }
        catch (err) {
          console.log(err);
          res.send(Resp(false, 'Error'));
        }

      }
      else {
        res.send(Resp(false, 'Login Failed'));
      }
    });
  });

  router.post('/logout', async function (req, res, next) {
    var { token } = req.body;
    Token.findOneAndRemove({ token: token, tokenExpire: { $gt: Date.now() } })
      .then(tok => {
        if (tok) {
          var { id, token } = tok;
          Person.findOneAndUpdate({ id: id, token: token, tokenExpire: { $gt: Date.now() } }, { tokenExpire: 0 })
            .then((err, person) => {
              console.log("mon", err, person);
              if (person) {
                res.send(Resp(true, 'OK'));
              }
              else if (!err) {
                res.send(Resp(false, 'Expired?'));
              } else {
                res.send(Resp(false, 'Error'));
              }
            });
          // });
        }
        else {
          res.send(Resp(false, 'Wrong Token'));
        }

      })
      .catch(err => {
        console.log(err);
        res.send(false, 'Error');
      })
  });

  router.post('/getInfo', async function (req, res, next) {
    var { token } = req.body;

    Token.findOne({ token: token })
      .then(tok => {
        var { id, token } = tok;
        Person.findOne({
          id: id,
          token: token,
          tokenExpire: { $gt: Date.now() }
        })
          .then(
            person => {
              if (person) {
                var { tel, id } = person;
                query(agent, { tel: tel, id: id },
                  (data) => {
                    console.log(data)
                    if (data) {
                      try {
                        data[0]['house'] = person.house;
                        data[0]['locked'] = person.locked;
                        res.send(Resp(true, 'OK', data[0]));
                      }
                      catch (err) {
                        res.send(Resp(false, 'Error'));
                      }
                    }
                    else {
                      console.log(`[WARNING] found user:${id} in mongo but not in DNL`)
                      res.send(Resp(false, 'Not Found'));
                    }
                  })
              }
              else {
                res.send(Resp(false, 'Wtong Token'));
              }
            })
          .catch(err => {
            res.send(Resp(false, 'Error'));
          })

      })
  });

  router.post('/movePerson', async function (req, res, next) {
    var { token, house } = req.body;

    Token.findOne({ token: token })
      .then(tok => {
        var { id, token } = tok;
        Person.findOne({
          id: id,
          token: token,
          tokenExpire: { $gt: Date.now() }
        })
          .then(
            person => {
              if (person) {
                console.log(typeof person, person.save)
                var { tel, id } = person;
                query(agent, { tel: tel, id: id },
                  (data) => {
                    console.log(data)
                    if (data) {
                      try {
                        data[0]['house'] = person.house;
                        data[0]['locked'] = person.locked;
                        res.send(Resp(true, 'OK', data[0]));
                      }
                      catch (err) {
                        res.send(Resp(false, 'Error'));
                      }
                    }
                    else {
                      console.log(`[WARNING] found user:${id} in mongo but not in DNL`)
                      res.send(Resp(false, 'Not Found'));
                    }
                  })
              }
              else {
                res.send(Resp(false, 'Wtong Token'));
              }
            })
          .catch(err => {
            res.send(Resp(false, 'Error'));
          })

      })
  });
  return router
}

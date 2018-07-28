var express = require('express');
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require('redis'));


var util = require('./util'),
    Resp = util.makeResponse;
var config = require('../config');
var client = redis.createClient(6379, config.redisAddr, { no_ready_check: true });
var query = require('./connect').query; // query to DTNL (batched reponse)


var mongoose = require('mongoose');


module.exports = function (agent, db) {
    var router = express.Router();
    
    // router.get('/getHouses', async function(req, res, next) => {

    // });
    // router.post('/logout', async function (req, res, next) {
    //     var {token, id} = req.body;
    //     var user = await client.hgetallAsync(`student:${id}`);
    //     if (user['token'] === token && user['tokenExpire'] > Date.now()) {
    //         client.hmset(`student:${id}`, 'tokenExpire', 0);
    //         res.send(Resp(true));
    //     }
    //     else {
    //         res.send(Resp(false));
    //     }
    // })
    return router
}

var express = require('express');
var query = require('./connect').query;
var util = require('./util');
var config = require('../config');
var houses = config.houses.houses;
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require('redis')); 
var client = redis.createClient(6379, config.redisAddr);
var schedule = require('node-schedule');
client.on('error', (err) => {
    console.error('[Redis] Connection Lost, Retrying', err)
});
var Resp = require('./util').makeResponse;

module.exports = function (agent, db) {
    var router = express.Router();
    var confirm = function (){
        client.keysAsync('student:*').then(async (keys) => {
            for (var i=0; i<keys.length; i++) {
                let key = keys[i];
                await util.sleep(350);
                client.hgetallAsync(key)
                .then( user => {
                    console.log(user);
                    if (+user.locked === 1){
                        return;
                    }
                    else {
                        var useApi = true;
                        if (useApi){
                            agent.post(`${config.apiURL}/confirmHouse`)
                            .send({
                                id: user.id,
                                token: user.token
                            })
                            .withCredentials()
                            .then(res => {
                                if (res.success){
                                    console.log(`[AUTOCONFIRM] success operation on ID:${user.id}`);
                                }
                                else {
                                    console.error(`[AUTOCONFIRM] failed operation on ID:${user.id}, house:${user.house}`, res.message);
                                }

                            }) ;
                        } 
                        else {
                            client.hset(key, 'locked', '1');
                            db.ref(`/houses/${user.house}`).transaction(house => {
                                if (house === null)
                                    return null;
                                else if (house) {
                                    house.avail = (house.avail | 0) - 1;
                                    house.used = (house.used | 0) - 1;
                                    return house;
                                }
                            })
                            return console.log(Resp(true, {
                                modify_list: JSON.stringify({
                                    idList: [user._id],
                                    modifyList: [{
                                        columnName: config.houseColumn,
                                        value: `"${user.house}"`
                                    }]
                                })
                            }));
                            // return agent.post(`https://${config.dtnlADDR}/api/v1/edit/editCheckedData/${config.rnkmTablename}`)
                            //     .send({
                            //         modify_list: JSON.stringify({
                            //             idList: [user._id],
                            //             modifyList: [{
                            //                 columnName: config.houseColumn,
                            //                 value: `"${user.house}"`
                            //             }]
                            //         })
                            //     })
                            //     .withCredentials()
                            //     .then(() => {
                            //         return console.log(Resp(true, `OK ${user._id};${user.id} -> ${user.house}`));
                            //             })
                            //             .catch((err) => { 
                            //                     console.error(`[CONFIRMHOUSE] cannot change ${id}'s house to ${user.house}`,err); 
                            //             return console.error(`[AutoConfirm] Error ${user._id};${user.id} -> ${user.house} Log:`, err);
                            //     })
                        }
                    }
                })
            }
        });
    }
    var fixUsedCount = function() {
        
        client.keysAsync('student:*')
        .then(keys => {
            console.log(keys);
            var prom = []
            for (var i=0; i<keys.length; i++){
                let key = keys[i];
                prom.push(client.hgetallASync(key));
            } 
            Promise.all(prom)
            .then(data => {
                var count = {};
                data.forEach(user => {
                    if (+user.locked !== 1){
                        count[user.house] = (count[user.house] | 0) + 1; 
                    }
                });
                console.log(count);
                return Promise.resolve(count);
            })
            .then(count => {
                for (var h in count) {
                    db.ref(`/houses/${user.house}`).transaction(house => {
                        if (house === null)
                            return null;
                        else if (house) {
                            house.avail = (house.avail | 0) + count[h];
                            house.used = (house.used | 0) + count[h];
                            return house;
                        }
                    })
                }
            })
            .catch(err => {
                console.error('[FixUsedCount] Something went wrong', err);
            })
        }); 
    }
    router.get('/fixCount', async function(req, res, next){
        fixUsedCount();
        res.send(Resp(true, 'OK'));
    })
    router.get('/initFirebase', async function (req, res, next) {
        for (var house in houses) {
            await util.sleep(500);
            let h = house;
            console.log(h);
            query(agent, h)
            .then(count => {
                console.log(count);
                db.ref(`/houses/${h}`).set({
                    count: count,
                    cap: houses[h].cap,
                    avail: houses[h].cap-count,
                    used: 0
                }).then(() => {
                    console.log('success', h, {
                        count: count,
                        cap: houses[h].cap,
                        avail: houses[h].cap-count,
                        used: 0
                    });
                })
                .catch(err => {
                    console.log(err);
                })
            })
            .catch(err => {
                console.log("cb", err);
            })
        }
        res.send('OMEGALUL K');
    });

    router.get('/forceConfirm', function (req, res, next) {
        confirm();
        res.send(Resp(true, 'forced!'));
    })
    return router;
}

var j = schedule.scheduleJob("0 11 4 8 2018", () => confirm);
var j2 = schedule.scheduleJob("30 12 4 8 2018", () => confirm);

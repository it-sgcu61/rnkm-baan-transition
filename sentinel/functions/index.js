var request = require('superagent');
var util = require('./util');
var config = require('../config');
var Promise = require('bluebird');
var query = require('./connect');
var redis = Promise.promisifyAll(require('redis'));
var admin = require('firebase-admin');

var Resp = util.makeResponse;
const agent = request.agent()

module.exports =  {
    confirm:function (DTNLagent){
        console.log("AUTOMATE CONFIRMATION...")
        var db = admin.database();
        var client = redis.createClient(6379, config.redisAddr);
        client.on('error', (err) => {
            console.error('[Redis] Connection Lost, Retrying', err)
        });
        client.keysAsync('student:*').then(async (keys) => {
            for (var i=0; i<keys.length; i++) {
                let key = keys[i];
                await util.sleep(350);
                client.hgetallAsync(key)
                .then( user => {
                    if (+user.locked === 1){
                        return;
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
                        // return console.log(Resp(true, {
                        //     modify_list: JSON.stringify({
                        //         idList: [user._id],
                        //         modifyList: [{
                        //             columnName: config.houseColumn,
                        //             value: `"${user.house}"`
                        //         }]
                        //     })
                        // }));
                        return DTNLagent.post(`http://${config.dtnlADDR}/api/v1/edit/editCheckedData/${config.rnkmTablename}`)
                            .send({
                                modify_list: JSON.stringify({
                                    idList: [user._id],
                                    modifyList: [{
                                        columnName: config.houseColumn,
                                        value: `"${user.house}"`
                                    }]
                                })
                            })
                            .withCredentials()
                            .then(() => {
                                console.log(Resp(true, `OK ${user._id};${user.id} -> ${user.house}`));
                            })
                            .catch((err) => {
                                console.error(`[CONFIRMHOUSE] cannot change ${user.id}'s house to ${user.house}`,err);
                                console.error(`[AutoConfirm] Error ${user._id};${user.id} -> ${user.house} Log:`, err);
                            })
                        }
                })
            }
        });
    },
    fixUsedCount:function() {
        var client = redis.createClient(6379, config.redisAddr);
        client.keysAsync('student:*').then(keys => {
            console.log(keys);
            var prom = []
            for (var i=0; i<keys.length; i++){
                let key = keys[i];
                prom.push(client.hgetallASync(key));
            }
            Promise.all(prom).then(data => {
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
    },
    query:query,
    ...util
}

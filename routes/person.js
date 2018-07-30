var express = require('express');
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require('redis'));
var bcrypt = require('bcrypt');

var util = require('./util'),
    Resp = util.makeResponse;
var config = require('../config');
var query = require('./connect').query; // query to DTNL (batched reponse)
var client = redis.createClient(6379, config.redisAddr);
var assert = require('assert');
client.on('error', (err) => {
    console.log('error?', err)
    console.log(client.connected);
    console.log('reconnect?');
});

// var conn = mongoose.createConnection(config.mongoURL);

// var acc = [];
// var lock = 0, cap = 10, delay = 2000;


module.exports = function (agent, db) {
    var router = express.Router();
    var login = router.post('/login', async function (req, res, next) {
        try {
            var { id, tel } = req.body;
            id = id.toString();
            tel = tel.toString();
        }
        catch (err) {
            return res.send(Resp(false, 'bad request'));
        }
        query(agent, req.body, async (data) => {
            if (data) {
                try {
                    assert.strictEqual(data.length, 1, `Query Error: More than 1 student returned. query: (${id},${tel})`)

                    var std = data[0];
                    var house = std[config.houseColumn], locked = std['locked'];
                    var token = await bcrypt.hash(Date.now().toString(16), 8);
                    var id = std[config.idColumn],
                     tel = std[config.telColumn],
                    _id = std['_id'];
                    client.hgetallAsync(`student:${id}`)
                        .then(async student => {
                            console.log(student);
                            if (student === null) {
                                client.hmset(`student:${id}`, { token: token, house: house, locked: 0, tel: tel, id: id, _id: _id });
                                db.ref(`/houses/${house}`).transaction(house => {
                                    if (house === null)
                                        return null;
                                    else if (house) {
                                        house.avail = (house.avail | 0) + 1;
                                        house.used = (house.used | 0) + 1;
                                        return house;
                                    }
                                })
                            }
                            else {
                                client.hmset(`student:${id}`, { token: token });
                            }
                            res.send(Resp(true, 'OK', { token: token }))
                        });
                }
                catch (err) {
                    console.error('ERROR', err);
                    return res.send(Resp(false, 'Error'));
                }
            }
            else { // id/tel incorrect
                return res.send(Resp(false, 'Login Failed'));
            }
        });
    });

    var logout = router.post('/logout', async function (req, res, next) {
        try {
            var { id, token } = req.body;
            id = id.toString();
            token = token.toString();
        }
        catch (err) {
            return res.send(Resp(false, 'bad request'));
        }
        client.hgetAsync(`student:${id}`, 'token')
            .then(tok => {
                if (tok === token) {
                    client.hdelAsync(`student:${id}`, 'token')
                        .then(() => {
                            return res.send(Resp(true, 'OK'));
                        })
                }
                else {
                    return res.send(Resp(false, 'Wrong Token'));
                }
            })
    });

    var getInfo = router.post('/getInfo', async function (req, res, next) {
        try {
            var { id, token } = req.body;
            id = id.toString();
            token = token.toString();
        }
        catch (err) {
            return res.send(Resp(false, 'bad request'));
        }
        var user = await client.hgetallAsync(`student:${id}`);
        if (user && user.token === token) {
            var { id, tel } = user;
            query(agent, { tel: tel, id: id },
                (data) => {
                    try {
                        assert.strictEqual(data.length, 1, `Query Error: More than 1 student returned. query: (${id},${tel})`)
                        if (data) {
                            var std = data[0];
                            try { // note that Locked/currentHouse is stored in DTNL (update as you change house!)
                                std['currentHouse'] = user.house;
                                std['locked'] = user.locked;
                                return res.send(Resp(true, 'OK', std));
                            }
                            catch (err) {
                                return res.send(Resp(false, 'Error'));
                            }
                        }
                        else {
                            console.warn(`[WARNING] found user:${id} in mongo but not in DNL`)
                            return res.send(Resp(false, 'Not Found'));
                        }
                    }
                    catch (err) {
                        console.error('[GETINFO]', err);
                        return res.send(Resp(false, 'Error'));
                    }
                });
        }
        else {
            return res.send(Resp(false, 'Wrong Token'));
        }
    });

    var movePerson = router.post('/movePerson', async function (req, res, next) {
        try {
            var id = req.body.id.toString();
            var token = req.body.token.toString();
            var newHouse = req.body.house.toString();
        }
        catch (err) {
            return res.send(Resp(false, 'bad request'));
        }
        // get 
        var user = await client.hgetallAsync(`student:${id}`)
        if (user && user.token === token) {
            try {
                var locked = user.locked,
                    oldHouse = user.house;

                if (locked === '1')
                    return res.send(Resp(false, "You've already confirmed your house"));

                // Move !
                return db.ref(`/houses/${newHouse}`).transaction((house) => {
                    if (house === null) {
                        return null;
                    }
                    else if (house.count < house.cap) {
                        house.count += 1;
                        house.used =  (house.used | 0 ) + 1;
                        return house;
                    }
                    else {
                        return;
                    }
                }, (err, commited, snapshot) => {
                    if (err) {
                        console.error('[MOVEPERSON] firebase error', err);
                        return res.send(Resp(false, 'Error'));
                    }
                    else if (snapshot.val() === null) {
                        return res.send(Resp(false, 'Invalid House'));
                    }
                    else if (commited === true) { // when null --> moving to non existent house
                        return db.ref(`/houses/${oldHouse}`).transaction((house) => {
                            if (house === null) {
                                return null;
                            }
                            else if (house) {
                                house.count -= 1;
                                house.used = (house.used | 0 ) - 1;
                                return house;
                            }
                            else {
                                return;
                            }
                        }, () => {
                                client.hset(`student:${id}`, 'house', newHouse);
                                return res.send(Resp(true, 'OK'));
                            });
                    }
                    else
                        return res.send(Resp(false, 'Full House'));
                });
            }
            catch (err) {
                console.error('[GETINFO]', err);
                return res.send(Resp(false, 'Error'));
            }
        }
        else {
            return res.send(Resp(false, 'Wrong Token'));
        }
    });
    var getHouses = router.get('/getHouses', function (req, res, next) {
        return db.ref('/houses').once('value')
            .then(snapshot => {
                return res.send(Resp(true, 'OK', snapshot.val()));
            })
            .catch(err => {
                console.error('[GETHOUSES] firebase error', err);
                return res.send(Resp(false, 'Error'));
            })
    })

    var confirmHouse = router.post('/confirmHouse', async function (req, res, next) {
        try {
            var { id, token } = req.body;
            id = id.toString();
            token = token.toString();
        }
        catch (err) {
            return res.send(Resp(false, 'bad request'));
        }

        var user = await client.hgetallAsync(`student:${id}`);
        if (user.token === token) {
            client.hset(`student:${id}`, 'locked', '1'); // redis always store as String
            if (user.locked !== '1'){
                db.ref(`/houses/${user.house}`).transaction(house => {
                    if (house === null)
                        return null;
                    else if (house) {
                        house.avail = (house.avail | 0) - 1;
                        house.used = (house.used | 0) - 1;
                        return house;
                    }
                })
            }
            return res.send(Resp(true, {
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
            //                 value: `"${newHouse}"`
            //             }]
            //         })
            //     })
            //     .withCredentials()
            //     .then(() => {
            //         return res.send(Resp(true, 'OK'));
            //     })
            //     .catch((err) => { 
            //         console.error(`[CONFIRMHOUSE] cannot change ${id}'s house to ${user.house}`,err); 
            //         return res.send(Resp(false,'Something went wrong'));
            //     })
    
                 // OK
        }
        else {
            client.hdel(`student:${id}`, 'token');
            console.warn('[MOVEPERSON] Leftover token')
            return res.send(Resp(false, 'Wrong token'));
        }
    });
    var register = router.post('/register', function (req, res, next) {
        try {
            var formData = req.body.formData; // form info as JSON, send to DTNL
            if (typeof formData !== 'object') {
                formData = JSON.parse(formData);
            }
            var tel = formData[config.telColumn].toString();
            var id = formData[config.idColumn].toString();
            var house = formData[config.houseColumn].toString();
            var lang = req.body.lang;
            var formId = config.formId[lang].toString();

        }
        catch (err) {
            console.log(err);
            return res.send(Resp(false, 'Bad request'));
        }
        return query(agent, { tel: tel, id: id }, (data) => {
            if (data && data.length) {
                console.log(data)
                return res.send(Resp(false, `You've already registered`));
            }
            else {
                return db.ref(`/houses/${house}`).transaction((house) => {
                    if (house === null) {
                        return null;
                    }
                    else if (house.count < house.cap) {
                        house.count += 1;
                        return house;
                    }
                    else {
                        return;
                    }
                }, (err, commited, snapshot) => {
                    if (err) {
                        console.error("[REGISTER] Firebase Error", err);
                        return res.send(Resp(false, 'Error'))
                    }
                    else if (snapshot.val() === null) {
                        return res.send(Resp(false, 'Invalid House'));
                    }
                    else if (commited) { // register success and person will be added to DB,  when null --> moving to non existent house
                        return res.send(Resp(true, 'OK? should sent to DTNL')) // don't forget to revert in case of error

                        // 
                        // return agent.post(`https://${config.dtnlADDR}/api/v1/form/submit/${formId}`)
                        //     .send(formData)
                        //     .then(() => {
                        //         return res.send(Resp(true, 'OK'));
                        //     }).catch((err) => {
                        //         console.error('[REGIST] error', err);
                        //         db.ref(`/houses/${house}/count`).transaction(count => count-1)
                        //         return res.send(Resp(false, 'Error, try checking the form again'));
                        //     });
                    }
                    else { // register failed coz house is full 
                        return res.send({ success: false, message: 'full house' });
                    }
                });
            }
        })
    });

    return router

}

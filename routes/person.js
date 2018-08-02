var express = require('express');
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require('redis'));
var bcrypt = require('bcrypt');

var setupDTNL = require('../utils/connect').setupDTNL;
var util = require('../utils/util')
var config = require('../config');
var query = require('../utils/connect').query; // query to DTNL (batched reponse)
var client = redis.createClient(6379, config.redisAddr);
var assert = require('assert');
var admin = require('firebase-admin');
var Resp = util.makeResponse;
var dtnlAgent;
client.on('error', (err) => {
    console.error('[Redis] Connection Lost, Retrying', err)
});

const reconnectDTNL = (agent) => {
    dtnlAgent = agent
}


module.exports = function (agent) {
    dtnlAgent = agent
    var router = express.Router();
    var login = router.post('/login', async function (req, res, next) {
        var db = admin.database();
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
                    var house = std[config.houseColumn]
                    var token = await bcrypt.hash(Date.now().toString(16), 8);
                    var id = std[config.idColumn],
                     tel = std[config.telColumn],
                    _id = std['_id'];
                    client.hgetallAsync(`student:${id}`)
                        .then(async student => {
                            if (student === null) {
                                client.hmset(`student:${id}`, { token: token, house: house, locked: 0, cooldown: 0,tel: tel, id: id, _id: _id });
                                db.ref(`/houses/${house}`).transaction(house => {
                                    if (house === null)
                                        return null;
                                    else if (house) {
                                        house.avail = (house.avail | 0) + 1;
                                        house.used = (house.used | 0) + 1;
                                        return house;
                                    }
                                })
                                res.send(Resp(true, 'OK', { token: token, oldHouse: house , currentHouse: house, fullname: std['dynamic/fullname'] }))
                            }
                            else {
                                if (student.locked == "0") {
                                    client.hmset(`student:${id}`, { token: token });
                                    res.send(Resp(true, 'OK', { token: token, oldHouse: house, currentHouse: student.house, fullname: std['dynamic/fullname'], expireTime: process.env.endTime }))
                                }else{
                                    res.send(Resp(false, "You've already confirmed your house", {}))
                                }
                            }
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
        }, reconnectDTNL);
    });

    var movePerson = router.post('/movePerson', async function (req, res, next) {
        var db = admin.database();
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
        if (user && user.token && user.token === token) {
            try {
                var locked = user.locked,
                    oldHouse = user.house;
                var cd = await client.hincrbyAsync(`student:${id}`, 'cooldown', 1);
                if (cd > 1){
                    client.hincrby(`student:${id}`, 'cooldown', -1);
                    return res.send(Resp(false, 'Please wait until last operation complete'));
                }
                if (+locked === 1){
                    client.hincrby(`student:${id}`, 'cooldown', -1);
                    return res.send(Resp(false, "You've already confirmed your house"));
                }
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
                        client.hincrby(`student:${id}`, 'cooldown', -1);
                        return res.send(Resp(false, 'Error'));
                    }
                    else if (snapshot.val() === null) {
                        client.hincrby(`student:${id}`, 'cooldown', -1);
                        return res.send(Resp(false, 'Invalid House'));
                    }
                    else if (commited === true) { // when null --> moving to non existent house
                        db.ref(`/houses/${oldHouse}`).transaction((house) => {
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
                        }, async function(){
                            console.log(`set ${id} house to ${newHouse}`)
                            await client.hsetAsync(`student:${id}`, 'house', newHouse);
                            client.hincrby(`student:${id}`, 'cooldown', -1);
                            return res.send(Resp(true, 'OK'));
                        });
                    }
                    else{
                        client.hincrby(`student:${id}`, 'cooldown', -1);
                        return res.send(Resp(false, 'Full House'));
                    }
                });
            }
            catch (err) {
                console.error('[GETINFO]', err);
                client.hincrby(`student:${id}`, 'cooldown', -1);
                return res.send(Resp(false, 'Error'));
            }
        }
        else {
            return res.send(Resp(false, 'Wrong Token'));
        }
    });

    var getHouses = router.get('/getHouses', function (req, res, next) {
        var db = admin.database();
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
        var db = admin.database();
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
            var cd = await client.hincrbyAsync(`student:${id}`, 'cooldown', 1);
            if (cd > 1){
                client.hincrby(`student:${id}`, 'cooldown', -1);
                return res.send(Resp(false, 'Please wait until last operation complete'));
            }
            if (+user.locked === 1){
                client.hincrby(`student:${id}`, 'cooldown', -1);
                return res.send(Resp(false, `You've already confirmed your house`));
            }
            await client.hsetAsync(`student:${id}`, 'locked', '1'); // redis always store as String
            client.hincrby(`student:${id}`, 'cooldown', -1); // await previous line so we ensure that user are locked when we reset cooldown
            db.ref(`/houses/${user.house}`).transaction(house => {
                if (house === null)
                    return null;
                else if (house) {
                    house.avail = (house.avail | 0) - 1;
                    house.used = (house.used | 0) - 1;
                    return house;
                }
            })
            return agent.post(`http://${config.dtnlADDR}/api/v1/edit/editCheckedData/${config.rnkmTablename}`)
                .send({
                    modify_list: JSON.stringify({
                        idList: [user._id],
                        modifyList: [{
                            columnName: config.houseColumn,
                            value: `'${user.house}'`
                        },{
                            columnName: "isTransfered",
                            value: "true"
                        }]
                    })
                })
                .withCredentials()
                .then(async function() {
                    await client.hdelAsync(`student:${id}`, 'token')
                    return res.send(Resp(true, 'OK'));
                })
                .catch(async function(err)  {
                    reconnectDTNL(await setupDTNL())
                    console.error(`[CONFIRMHOUSE] cannot change ${id}'s house to ${user.house}`,err);
                    return res.send(Resp(false,'Something went wrong'));
                })

        }
        else {
            client.hdel(`student:${id}`, 'token');
            console.warn('[CONFIRMHOUSE] Leftover token')
            return res.send(Resp(false, 'Wrong token'));
        }
    });

    var register = router.post('/register', function (req, res, next) {
        var db = admin.database();
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
            console.error('[REGISTER] Error',err);
            return res.send(Resp(false, 'Bad request'));
        }
        return query(agent, { tel: tel, id: id }, (data) => {
            if (data && data.length) {
                return res.send(Resp(false, `You've already registered`));
            }
            else {
                return db.ref(`/houses/${house}`).transaction((house) => {
                    if (house === null) {
                        return null;
                    }
                    else if (house.count < house.cap) {
                        house.count += 1;
                        house.avail -= 1;
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
                        return agent.post(`http://${config.dtnlADDR}/api/v1/form/submit/${formId}`)
                            .send(formData)
                            .then(() => {
                                return res.send(Resp(true, 'OK'));
                            }).catch(async function(err) {
                                reconnectDTNL(await setupDTNL())
                                console.error('[REGIST] error', err);
                                db.ref(`/houses/${house}`).transaction(house => ({...house, count: house.count-1, avail: house.avail+1}))
                                return res.send(Resp(false, 'Error, try checking the form again'));
                            });
                    }
                    else { // register failed coz house is full
                        return res.send({ success: false, message: 'full house' });
                    }
                });
            }
        }, reconnectDTNL)
    });

    var checkStatus = router.get('/checkStatus', async function (req, res, next) {
        var db = admin.database();
        var dtnl = await agent.get(`http://${config.dtnlADDR}/api/v1/loginStatus`).withCredentials();
        var fb = await db.ref('.info/connected').once('value');
        if (db.val() === true && dtnl.user === config.dtnlUser && client.connected){
            return res.send('true');
        }
        return res.send('false');
    });
    return router

}

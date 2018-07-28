var express = require('express');
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require('redis'));
var bcrypt = require('bcrypt');

var util = require('./util'),
    Resp = util.makeResponse;
var config = require('../config');
var query = require('./connect').query; // query to DTNL (batched reponse)
var client = redis.createClient(6379, config.redisAddr, { no_ready_check: true });


// var conn = mongoose.createConnection(config.mongoURL);

// var acc = [];
// var lock = 0, cap = 10, delay = 2000;

module.exports = function (agent, db) {
    var router = express.Router();
    router.post('/login', async function (req, res, next) {
        var { id, tel } = req.body;
        query(agent, req.body, async (data) => {
            if (data) {
                try {
                    if (data.length !== 1)
                        throw new Error(`Query Error: More than 1 student returned. query: (${id},${tel})`);

                    std = data[0];
                    var token = await bcrypt.hash(Date.now().toString(16), 8);
                    var tokenExpire = new Date();
                    tokenExpire.setTime(tokenExpire.getTime() + config.tokenAge);

                    client.hgetAsync(`student:${id}`, 'token')
                        .then(async oldToken => {
                            if (oldToken && oldToken.token) {
                                client.del(`token:${oldToken.token}`);
                            }
                            await client.hmsetAsync(`student:${id}`, { token: token });
                            console.log(`set ${id}`)
                            await client.hmsetAsync(`token:${token}`, { id: id, tel: tel, _id: std['_id'], tokenExpire: tokenExpire.getTime() })
                            return res.send(Resp(true, 'OK', { token: token, tokenExpire: tokenExpire.getTime() }))
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

    router.post('/logout', async function (req, res, next) {
        var { token } = req.body;
        try {
            var tok = await client.hgetallAsync(`token:${token}`)
            if (tok) {
                client.hdel(`student:${tok.id}`, 'token');
                client.del(`token:${token}`)
                return res.send(Resp(true, 'OK'));
            }
            else {
                return res.send(Resp(false, 'Wrong token'));
            }
        }
        catch (err) {
            console.error('[LOGOUT]', err)
            return res.send(Resp(false, 'Error'));
        }
    });

    router.post('/getInfo', async function (req, res, next) {
        var { token } = req.body;

        var tok = await client.hgetallAsync(`token:${token}`);
        if (tok && Date.now() < tok.tokenExpire) {
            var { id, tel } = tok;
            var student = await client.hgetallAsync(`student:${id}`);
            if (student.token === token) {
                query(agent, { tel: tel, id: id },
                    (data) => {
                        try {
                            if (data.length !== 1)
                                throw new Error(`Query Error: More than 1 student returned. query: (${id},${tel})`);
                            if (data) {
                                var std = data[0];
                                try { // note that Locked/currentHouse is stored in DTNL (update as you change house!)
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
                    })
            }
            else {
                client.delAsync(`token:${token}`);
                client.hdelAsync(`student:${id}`, 'token');
                console.warn('[MOVEPERSO] Leftover token')
                return res.send(Resp(false, 'Wrong token'));
            }
        }
        else {
            return res.send(Resp(false, 'Wrong Token'));
        }
    });

    router.post('/movePerson', async function (req, res, next) {
        var { token, newHouse } = req.body;

        // get 
        var tok = await client.hgetallAsync(`token:${token}`)
        if (tok && Date.now() < tok.tokenExpire) {
            var { id, tel, _id } = tok;
            var student = await client.hgetallAsync(`student:${id}`);
            if (student.token === token) {
                query(agent, { tel: tel, id: id }, // we need to query to check whether user is locked and oldHouse (may be cache it ? TODO)
                    (data) => {
                        try {
                            if (data) {
                                if (data.length !== 1)
                                    throw new Error(`Query Error: More than 1 student returned. query: (${id},${tel})`);
                                var std = data[0]; // note that Locked/currentHouse is stored in DTNL (update as you change house!)
                                var oldHouse = std[config.houseColumn];
                                if (std.locked)
                                    return res.send(Resp(false, "You've already confirmed your house"));

                                // Move !
                                return db.ref(`/houses/${newHouse}`).transaction((house) => {
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
                                },(err, commited, snapshot) => {
                                        if (err) {
                                            console.error('[MOVEPERSON] firebase error', err);
                                            return res.send(Resp(false, 'Error'));
                                        }
                                        else if (snapshot.val() === null) {
                                            return res.send(Resp(false, 'Invalid House'));
                                        }
                                        else if (commited === true) { // when null --> moving to non existent house
                                            return db.ref(`/houses/${oldHouse}/count`).transaction((count) => count - 1
                                                , () => {
                                                    return res.send(Resp(true, 'OK?', {
                                                        modify_list: JSON.stringify({
                                                            idList: [_id],
                                                            modifyList: [{
                                                                columnName: config.houseColumn,
                                                                value: `"${newHouse}"`,
                                                            }]
                                                        })
                                                    }));
                                                    // modify_list: `{"idList":["${_id}"],"modifyList":[{"columnName":"${config.houseColumn}","value":"\\"${esc(house.val())}\\""}]}`

                                                });
                                        }
                                        else
                                            return res.send(Resp(false, 'Full House'));
                                    });
                            }
                            else {
                                console.warn(`[WARNING] found user:${id} in redis but not in DNL`)
                                return res.send(Resp(false, 'Not Found'));
                            }
                        }
                        catch (err) {
                            console.error('[GETINFO]', err);
                            return res.send(Resp(false, 'Error'));
                        }
                    })
            }
            else {
                client.delAsync(`token:${token}`);
                client.hdelAsync(`student:${id}`, 'token');
                console.warn('[MOVEPERSON] Leftover token')
                return res.send(Resp(false, 'Wrong token'));
            }
        }
        else {
            return res.send(Resp(false, 'Wrong Token'));
        }
    });
    router.get('/getHouses', function(req, res, next){
        return db.ref('/houses').once('value')
            .then(snapshot => {
                return res.send(Resp(true, 'OK', snapshot.val()));
            })
            .catch(err => {
                console.error('[GETHOUSES] firebase error', err);
                return res.send(Resp(false, 'Error'));
            })
    })

    router.post('/confirmHouse', async function (req, res, next) {
        var { token } = req.body;

        var tok = await client.hgetallAsync(`token:${token}`);
        if (tok && Date.now() < tok.tokenExpire) {
            var { id, tel, _id } = tok;
            console.log(tok);
            var student = await client.hgetallAsync(`student:${id}`);
            if (student.token === token) {
                console.log(id, tel, _id);
                return res.send(Resp(true, {
                    modify_list: JSON.stringify({
                        idList: [_id],
                        modifyList: [{
                            columnName: 'locked',
                            value: "1"
                        }]
                    })
                }));
            }
            else {
                client.delAsync(`token:${token}`);
                client.hdelAsync(`student:${id}`, 'token');
                console.warn('[MOVEPERSO] Leftover token')
                return res.send(Resp(false, 'Wrong token'));
            }
        }
        else {
            return res.send(Resp(false, 'Wrong Token'));
        }
    });
    router.post('/register', function (req, res, next){
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
            return res.send({ success: false, message: 'bad request' });
        }
        return query(agent, {tel: tel, id: id}, (data) => {
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

                            // `
                            // return agent.post(`${config.prot}://${config.dtnlADDR}/api/v1/form/submit/${formId}`)
                            //     .send(formData)
                            //     .then(() => {
                            //         return db.ref(`/person/${url(id)}`).set({ id: id, house: house, locked: 0 }).then(() => {
                            //             return res.send({ success: true, message: 'OK' });
                            //             // return res.send('OK');
                            //         });
                            //     }).catch((err) => {
                            //         console.log('regist error', err);
                            //         return db.ref(`/houses/${house}/count`).transaction(count => count - 1).then(() => { // revert
                            //             return res.send({ success: false, message: 'DTNL error, also try checking form again' });
                            //         });
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

var functions = require('firebase-functions');
var bcrypt = require('bcrypt');
var config = require('./config');
var connector = require('./connector');
var sha256 = require('sha256');

var esc = require('./util').stringEscape;
var db = require('./connector').adminClient;

exports.login = functions.https.onRequest((req, res) => {
    try {
        var tel = req.body.tel.toString();
        var id = req.body.id.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return connector.setupDTNL().then((agent) => {
        if (!agent) {
            console.log('error connecting to DTNL', err);
            return res.send({ success: false, message: 'error connecting to DTNL' });
        }
        else {
            return agent.post(`${config.prot}://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`)
                .send({
                    sortby: "",
                    orderby: "",
                    filter: `[{"column_name":"${config.telColumn}","expression":"like","value": "^${esc(tel)}$"},{"column_name":"${config.idColumn}","expression":"like","value": "^${esc(id)}$"}]`,
                })
                .withCredentials().catch((err) => { console.log(err) })
                .then((data) => {
                    if (data && data.body.body.length > 1) {
                        return res.send({ success: false, message: 'duplicate row' });
                    }
                    else if (data && data.body.body) {
                        return bcrypt.hash(Date.now().toString(16), 8, (err, token) => {
                            if (err) {
                                console.log('token generation err', err);
                                return res.send({ success: false, message: 'error' });
                            }
                            else {
                                var d = new Date();
                                d.setTime(d.getTime() + config.tokenAge); // 4hours 
                                return db.ref('/person/' + id).once('value')
                                    .then((snapshot) => {
                                        var user = snapshot.val();
                                        if (user !== null) {
                                            return db.ref('/person/' + id).update({ token: token, tokenExpire: d.getTime() }).then(() => {
                                                return res.send({ success: true, message: 'OK', token: token, expire: d.toUTCString() });
                                            });
                                        }
                                        else { // DEBUG? remove this later

                                            // DEBUG
                                            house = data.body.body[0]['final-house'] || data.body.body[0]['head/house1'];
                                            return db.ref('/person/' + id).set({
                                                token: token, tokenExpire: d.getTime(),
                                                id: id, house: house, locked: 0
                                            })
                                                .then(() => {
                                                    return db.ref('/houses/' + house + '/count').transaction(count => {
                                                        return count + 1;
                                                    })
                                                        .then(() => {
                                                            return res.send({ success: true, message: 'warning user initially not in Firebase', token: token, expire: d.toUTCString() });
                                                        })
                                                })
                                        }


                                    });
                            }
                        });
                    }
                    else {
                        return res.send({ success: false, message: 'wrong tel/id' });
                    }
                });
        }

    });
});

exports.logout = functions.https.onRequest((req, res) => {
    try {
        var id = req.body.id.toString();
        var token = req.body.token.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person/' + id).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.id === id && token === user.token && Date.now() < user.tokenExpire) {
            return snapshot.ref.child('tokenExpire').set(0).then(() => {
                return res.send({ success: true, message: 'OK' });
            })
        }
        else {
            return res.send({ success: false, message: 'wrong credentials' });
        }
    });
});

exports.loginOld = functions.https.onRequest((req, res) => {
    try {
        var tel = req.body.tel.toString();
        var id = req.body.id.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person/' + id).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && id === user.id) {
            return bcrypt.compare(password, user.password, (err, same) => {
                if (err) {
                    console.log('error logging in', err);
                    return res.send({ success: false, message: 'error hashing password' });
                }
                else if (same) {
                    return bcrypt.hash(Date.now().toString(16), 8, (err, token) => {
                        // send token
                        if (err) {
                            console.log('token generation err', err);
                            return res.send({ success: false, message: 'error generating token' });
                        }
                        else {
                            var d = new Date();
                            d.setTime(d.getTime() + config.tokenAge); // 4hours 
                            return db.ref('/person/' + id).update({ token: token, tokenExpire: d.getTime() }).then(() => {
                                return res.send({ success: true, message: 'OK', token: token, expire: d.toUTCString() });

                            });
                        }
                    });
                }
                else {
                    return res.send({ success: false, message: 'wrong username/password' });
                }
            });
        }
        else {
            return res.send({ success: false, message: 'wrong username/password' });
        }
    });
});

exports.register = functions.https.onRequest((req, res) => {
    try {
        var formData = req.body.formData; // form info as JSON, send to DTNL
        if (typeof formData !== 'object') {
            formData = JSON.parse(formData);
        }
        console.log(formData);
        var tel = formData[config.telColumn].toString();
        var id = formData[config.idColumn].toString();
        var house = formData[config.houseColumn].toString();
        var lang = req.body.lang;
        var formId = config.formId[lang].toString();
        var key = req.body.key;
        var time = req.body.time; // epoch
        if (key !== config.key)
            return res.send({ success: false, message: 'invalid adminKey' });
        // just let the server verify 4HEad 
    }
    catch (err) {
        console.log(err);
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person/' + id).once('value').then((snapshot) => {
        if (snapshot.val() !== null) {
            return res.send({ success: false, message: 'you already registered' });
        }
        else {
            return db.ref('/houses/' + house).transaction((house) => {
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
                    console.log("add person err:", err);
                    return res.send({ success: false, message: 'server error' })
                }
                else if (snapshot.val() === null) {
                    return res.send({ success: false, message: 'invalid house' });
                }
                else if (commited) { // register success and person will be added to DB,  when null --> moving to non existent house
                    return connector.setupDTNL().then(agent => {
                        if (!agent) {
                            console.log('error connecting to DTNL');
                            return db.ref('/houses/' + house + '/count').transaction(count => count - 1).then(() => { // revert
                                return res.send({ success: false, message: 'error connecting to DTNL' });
                            });
                        }
                        else {
                            return agent.post(`${config.prot}://${config.dtnlADDR}/api/v1/form/submit/${formId}`)
                                .send(formData)
                                .then(() => {
                                    return db.ref('/person/' + id).set({ id: id, house: house, locked: 0 }).then(() => {
                                        return res.send({ success: true, message: 'OK' });
                                        // return res.send('OK');
                                    });
                                }).catch((err) => {
                                    console.log('regist error', err);
                                    return db.ref('/houses/' + house + '/count').transaction(count => count - 1).then(() => { // revert
                                        return res.send({ success: false, message: 'DTNL error, also try checking form again' });
                                    });
                                });
                        }
                    });
                }
                else { // register failed coz house is full 
                    return res.send({ success: false, message: 'full house' });
                }
            });
        }
    })
});

exports.onPersonDelete = functions.database.ref('/person/{id}/').onDelete((snapshot, context) => {
    var user = snapshot.val();
    var house = user.house;
    console.log(user.id, house, 'deleted')
    return db.ref('/houses/' + house + '/count').transaction((count) => {
        return count - 1;
    });
});
/*
exports.ADMIN_resetPassword = functions.https.onRequest((req, res) => {
    try {
        var username = req.body.username.toString();
        var newPassword = req.body.password.toString();
        var key = req.body.key.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    if (key !== config.key) { // to prevent accidental use
        return res.send({ success: false, message: 'invalid key' });
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null) {
            return bcrypt.hash(newPassword, 8, (err, hash) => {
                if (err) {
                    console.log('password reset failed', err);
                    return res.send({ success: false, message: 'error hashing password' });
                }
                else {
                    return db.ref('/person/' + username).update({ hash: true, password: hash, token: 0, tokenExpire: 0 }).then(() => {
                        return res.send({ success: true, message: 'OK' });
                    })
                }
            });
        }
        else {
            return res.send({ success: false, message: 'user doesn\'t exist' });
        }
    });
});
*/
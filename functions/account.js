var functions = require('firebase-functions');
var bcrypt = require('bcrypt');
var config = require('./config');
var connector = require('./connector');


var esc = require('./util').stringEscape;
var verify = require('./util').verifyForm;
var db = require('./connector').adminClient;



exports.login = functions.https.onRequest((req, res) => {
    try {
        var username = req.body.username.toString();
        var password = req.body.password.toString();
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
            return agent.post(`http://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`)
                .send({
                    sortby: "",
                    orderby: "",
                    filter: `[{"column_name":"${config.telColumn}","expression":"like","value": "^${esc(username)}$"},{"column_name":"${config.idColumn}","expression":"eq","value": "^${esc(password)}$"}]`,
                })
                .withCredentials().catch((err) => { console.log(err) })
                .then((data) => {
                    if (data && data.body.body) {
                        return bcrypt.hash(Date.now().toString(16), 8, (err, token) => {
                            if (err) {
                                console.log('token generation err', err);
                                return res.send({ success: false, message: 'error' });
                            }
                            else {
                                var d = new Date();
                                d.setTime(d.getTime() + config.tokenAge); // 4hours 
                                return db.ref('/person/' + username).update({ token: token, tokenExpire: d.getTime() }).then(() => {
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
        
    });
});

exports.loginOld = functions.https.onRequest((req, res) => {
    try {
        var username = req.body.username.toString();
        var password = req.body.password.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && username === user.username) {
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
                            d.setTime(d.getTime() + 4 * 60 * 60 * 1000); // 4hours 
                            return db.ref('/person/' + username).update({ token: token, tokenExpire: d.getTime() }).then(() => {
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
        var tel = formData['tel'].toString();
        var id = formData['id'].toString();
        var house = formData['house'].toString();
        // add some more verify here (ex tel phone verify)
        if (verify(formData) === false)
            return res.send({success: false, message: 'please check your form data again'});
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
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
                    return db.ref('/houses/' + house + '/count').transaction(count => count-1).then(() => { // revert
                        return res.send({ success: false, message: 'error connecting to DTNL' });
                    });   
                }
                else {
                    return agent.post(`http://${config.dtnlADDR}/api/v1/form/submit/${config.formId}`)
                    .send(formData)
                    .then(() => {
                        return db.ref('/person/' + tel).set({ username: tel, password: id, house: house, locked: 0 }).then(() => {
                            return res.send({ success: true, message: 'OK' });
                                // return res.send('OK');
                            });
                    }).catch((err) => {
                        console.log('regist error',err);
                        return db.ref('/houses/' + house + '/count').transaction(count => count-1).then(() => { // revert
                            return res.send({success: false, message: 'DTNL error'});
                        });
                    });
                }
            });
        }
        else { // register failed coz house is full 
            return res.send({ success: false, message: 'full house' });
        }
    });
});

exports.initPerson = functions.database.ref('/person/{username}').onCreate((snapshot, context) => {
    // when import data from DTNL (house results + other infos ) create db in /person 
    // and hash Their password 
    // if password sent is already hashed I will remove hashing 
    // incase of DB is int (please use string even for ID and tel)
    var user = snapshot.val();
    var username = user.username.toString();
    var password = user.password.toString();
    return db.ref('/person/' + username).update({ locked: 0 }).then(() => {
        return bcrypt.hash(password, 8, (err, hash) => {
            if (err) {
                console.log("error hashing", err);
                return db.ref('/person/' + username).update({ hashed: false, token: 0, tokenExpire: 0 });
            }
            else {
                return db.ref('/person/' + username).update({ hashed: true, password: hash, token: 0, tokenExpire: 0 });
            }
        });
    });
});

exports.onPersonDelete = functions.database.ref('/person/{username}/').onDelete((snapshot, context) => {
    var user = snapshot.val();
    var house = user.house;
    return db.ref('/houses/' + house + '/count').transaction((count) => {
        if (typeof count === 'number' ){
            return count - 1;
        }
        else {
            return ;
        }
    });
});

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

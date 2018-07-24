var functions = require('firebase-functions');
var config = require('./config');

var connector = require('./connector');
var db = connector.adminClient;
var esc = require('./util').stringEscape;
var url = require('./util').makeUrl;

exports.movePerson = functions.https.onRequest((req, res) => {
    try {
        var newHouse = req.body.house.toString();
        var id = req.body.id.toString();
        var token = req.body.token.toString();
    } catch (error) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref(`/person/${url(id)}`).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.id === id && token === user.token && Date.now() < user.tokenExpire) {
            if (user.locked) {
                return res.send({ success: false, message: 'you already confirmed your house!' })
            }
            else {
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
                }, (err, commited, snapshot) => {
                    if (err) {
                        console.log('movePerson failed', err);
                        return res.send('err');
                    }
                    else if (snapshot.val() === null) {
                        return res.send({ success: false, message: 'invalid house' });
                    }
                    else if (commited === true) { // when null --> moving to non existent house
                        return db.ref(`/houses/${user.house}/count`).transaction((count) => count - 1
                            , () => {
                                return db.ref(`/person/${url(id)}/house`).set(newHouse)
                                    .then(() => {
                                        return res.send({ success: true, message: 'OK' });
                                    });
                            });
                    }
                    else
                        return res.send({ success: false, message: 'full house' });
                });
            }
        }
        else {
            return res.send({ success: false, message: 'wrong credentials' });
        }
    });
});

exports.confirmHouse = functions.https.onRequest((req, res) => {
    try {
        var id = req.body.id.toString();
        var token = req.body.token.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref(`/person/${url(id)}`).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.id === id && user.token === token && Date.now() < user.tokenExpire) {
            return db.ref(`/person/${url(id)}/locked`).set(1).then(() => {
                return res.send({ success: true, message: 'OK' })
            });
        }
        else {
            return res.send({ success: false, message: 'invalid credentials' });
        }
    });
});

exports.onHouseConfirmed = functions.database.ref('/person/{id}/{id2}/locked').onUpdate((snapshot, context) => {
    var id = context.params.id + context.params.id2;
    // console.log(typeof snapshot, snapshot);
    if (snapshot.after.val() === 1) { // confirmed 
        return connector.setupDTNL().then(agent => {
            if (!agent) { // eror when agent == undefined (when connection err ?)
                console.log('error connecting to DTNL', err);
                return 0;
                // return res.send({ success: false, message: 'error connecting to DTNL' });
            }
            else {
                return agent.post(`${config.prot}://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`) // find _id of DTNL db first so we can update
                    .send({
                        sortby: "",
                        orderby: "",
                        filter: `[{"column_name":"${config.idColumn}","expression":"like","value": "^${esc(id)}$"}]`
                    })
                    .withCredentials().catch((err) => { console.log(err); response["result"] = "error"; })
                    .then((data) => { // now edit data
                        var _id = data.body.body[0]["_id"];
                        return snapshot.after.ref.parent.child('house').once('value').then((house) => {
                            return agent.post(`${config.prot}://${config.dtnlADDR}/api/v1/edit/editCheckedData/${config.rnkmTablename}`)
                                .send({
                                    modify_list: `{"idList":["${_id}"],"modifyList":[{"columnName":"${config.houseColumn}","value":"\\"${esc(house.val())}\\""}]}`
                                })
                                .withCredentials().catch((err) => { console.log(err); return res.send({ success: false, message: 'DTNL error' }) }) // OK
                        })
                    });
            }
        });
    }
    return 1;
});
exports.onHouseConfirmed2 = functions.database.ref('/person/{id}/{id2}/locked').onUpdate((snapshot, context) => {
    var id = context.params.id + context.params.id2;
    // console.log(typeof snapshot, snapshot);
    if (snapshot.after.val() === 1) { // confirmed 
        return db.ref(`/person/${url(id)}/house`).once('value')
        .then(snapshot => {
            return snapshot.val()
        })
        .then( house => {
            return db.ref(`/rawData/${url(id)}/realHouseURL`).set(house);
        })
    }
    return 1;
});

exports.ADMIN_lockAll = functions.https.onRequest((req, res) => { // to lockall person and submit data to DTNL, 
    try {
        var key = req.body.key.toString();
        if (key !== config.key)
            return res.send({ success: false, message: 'invalid key' });
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person').on('child_added', (snapshot) => {
        return snapshot.ref.child('locked').set(1);
    });
});
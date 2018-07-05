var functions = require('firebase-functions');
var config = require('./config');

var connector = require('./connector');
var db = connector.adminClient;


exports.movePerson = functions.https.onRequest((req, res) => {
    // use username (telephone number) and token (from login) to authenticate
    try {
        var newHouse = req.body.house.toString();
        var username = req.body.username.toString();
        var token = req.body.token.toString();
    } catch (error) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.username === username && token === user.token && Date.now() < user.tokenExpire) {
            if (user.locked) {
                return res.send({ success: false, message: 'you already confirmed your house!' })
            }
            else {
                return db.ref('/houses/' + newHouse).transaction((house) => {
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
                        return db.ref('/houses/' + user.house + '/count').transaction((count) => count - 1
                            , () => {
                                return db.ref('/person/' + username + '/house').set(newHouse)
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
        var username = req.body.username.toString();
        var token = req.body.token.toString();
    }
    catch (err) {
        return res.send({ success: false, message: 'bad request' });
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.username === username && user.token === token && Date.now() < user.tokenExpire) {
            return db.ref('/person/' + username + '/locked').set(1).then(() => {
                return res.send({ success: true, message: 'OK' })
            });
        }
        else {
            return res.send({ success: false, message: 'invalid credentials' });
        }
    });
});



exports.onHouseConfirmed = functions.database.ref('/person/{username}/locked').onUpdate((snapshot, context) => {
    var username = context.params.username;
    if (snapshot.val() === 1) { // confirmed 
        return connector.setupDTNL().then(agent => {
            if (!agent) { // eror when agent == undefined (when connection err ?)
                console.log('error connecting to DTNL', err);
                return res.send({ success: false, message: 'error connecting to DTNL' });
            }
            else {
                return agent.post(`http://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`) // find _id of DTNL db first so we can update
                    .send({
                        sortby: "",
                        orderby: "",
                        filter: `[{"column_name":"${config.telColumn}","expression":"like","value": "^${esc(username)}$"}]`
                    })
                    .withCredentials().catch((err) => { console.log(err); response["result"] = "error"; })
                    .then((data) => { // now edit data
                        var _id = data.body.body[0]["_id"];
                        return agent.post(`http://${config.dtnlADDR}/api/v1/edit/editCheckedData/${config.rnkmTablename}`)
                            .send({
                                modify_list: `{"idList":["${_id}"],"modifyList":[{"columnName":"${config.houseColumn}","value":"\\"${esc(user.house)}\\""}]}`
                            })
                            .withCredentials().catch((err) => { console.log(err); return res.send({ success: false, message: 'DTNL error' }) })
                            .then(() => {
                                return res.send({ success: true, message: 'OK' })
                            })

                    });
            }
        });
    }
    return;
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
var functions = require('firebase-functions');
var admin = require('firebase-admin');
var connector = require('./connector');
var config = require('./config');
var db = connector.adminClient;

var esc = require('./util').stringEscape;

exports.getHouses = functions.https.onRequest((req, res) => { 
    return db.ref('/houses').once('value').then(snapshot => {
        return res.send({success: true, message:'OK', data:snapshot.val()});
    });
});

exports.getPersonInfoOld = functions.https.onRequest((req, res) => {
    try {
        var username = req.body.username.toString();
        var token = req.body.token.toString();
    }
    catch (err) {
        return res.send({success: false, message: 'bad request'});
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && username === user.username && token === user.token && Date.now() < user.tokenExpire) {
            return res.send({success:true, message:'OK', data:{ username: user.username, house: user.house, locked: user.locked }});
        }
        else {
            return res.send({success: false, message: 'wrong credentials'});
        }
    });
});
exports.getPersonInfo = functions.https.onRequest((req, res) => {
    // maybe we sent person's name/other info too?? (currently what house and whether person has confirmed his choice)
    try {
        var username = req.body.username.toString();
        var token = req.body.token.toString();
    }
    catch (err) {
        return res.send({success: false, message: 'bad request'});
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && username === user.username && token === user.token && Date.now() < user.tokenExpire) {
            return connector.setupDTNL().then((agent) => {
                if (!agent) {
                    console.log('error connecting to DTNL');
                    return res.send({ success: false, message: 'error connecting to DTNL' });
                }
                else {
                    return agent.post(`https://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`)
                        .send({
                            sortby: "",
                            orderby: "",
                            filter: `[{"column_name":"${config.telColumn}","expression":"like","value": "^${esc(username)}$"}]`
                        })
                        .withCredentials().catch((err) => { console.log(err); response["result"] = "error"; })
                        .then((data) => {
                            data.body.body[0]['house'] = user.house;
                            data.body.body[0]['is_confirmed'] = user.locked; 
                            return res.send({success: true, message:'OK', data:data.body.body[0]});
                        });
                }
            });
        }
        else {
            return res.send({success: false, message: 'wrong credentials'});
        }
    });
});
var functions = require('firebase-functions');
var admin = require('firebase-admin');


var db = require('./connector').adminClient;


exports.getHouses = functions.https.onRequest((req, res) => {
    return db.ref('/houses').once('value').then(snapshot => {
        return res.send({success: true, message:'OK', data:snapshot.val()});
    });
});

exports.getPersonInfo = functions.https.onRequest((req, res) => {
    // maybe we sent person's name/other info too?? (currently what house and whether person has confirmed his choice)
    try {
        var username = req.body.username;
        var token = req.body.token;
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
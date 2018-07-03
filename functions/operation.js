var functions = require('firebase-functions');

var db = require('./connector').adminClient;


exports.movePerson = functions.https.onRequest((req, res) => {
    // use username (telephone number) and token (from login) to authenticate
    try {
        var newHouse = req.body.house.toString();
        var username = req.body.username.toString();
        var token = req.body.token.toString();
    } catch (error) {
        return res.send({success: false, message: 'bad request'});
    }
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.username === username && token === user.token && Date.now() < user.tokenExpire) {
            if (user.locked) {
                return res.send({success: false, message: 'you already confirmed your house!'})
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
                                        return res.send({success: true, message: 'OK'});
                                    });
                            });
                    }
                    else
                        return res.send({success: false, message: 'full house'});
                });
            }
        }
        else {
            return res.send({success: false, message: 'wrong credentials'});
        }
    });
});


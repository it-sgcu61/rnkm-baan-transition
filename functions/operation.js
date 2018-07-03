var functions = require('firebase-functions');

var db = require('./connector').adminClient;


exports.movePerson = functions.https.onRequest((req, res) => {
    // use username (telephone number) and token (from login) to authenticate
    try {
        var newHouse = req.body.house.toString();
        var username = req.body.username.toString();
        var token = req.body.token.toString();
    } catch (error) {
        return res.send('bad request');
    }
    console.log(`req: ID:${username} house:${newHouse}`);
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.username === username && token === user.token && Date.now() < user.tokenExpire) {
            if (user.locked) {
                return res.send('you have already confirmed your house')
            }
            else {
                return db.ref('/houses/' + newHouse).transaction((house) => {
                    console.log('new house:', house);
                    if (house === null) {
                        return null;
                    }
                    else if (house.count < house.cap) {
                        house.count += 1;
                        console.log('moved!');
                        return house;
                    }
                    else {
                        console.log('not');
                        return;
                    }
                }, (err, commited, snapshot) => {
                    console.log('add person', err, commited, snapshot.val());
                    if (err)
                        return res.send('err');
                    else if (commited === true && snapshot.val() !== null) { // when null --> moving to non existent house
                        return db.ref('/houses/' + user.house + '/count').transaction((count) => count - 1
                            , () => {
                                return db.ref('/person/' + username + '/house').set(newHouse)
                                    .then(() => {
                                        return res.send('Moved!');
                                    });
                            });
                    }
                    else
                        return res.send('Full house/ house doesn\'t exist');
                });
            }
        }
        else {
            return res.send('wrong token/pass/username');
        }
    });
});


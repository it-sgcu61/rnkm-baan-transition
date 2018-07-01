var firebase = require("firebase");
var functions = require('firebase-functions');
var admin = require('firebase-admin'); // not needed anymore?
// admin.initializeApp();
var bcrypt = require('bcrypt');
var config = {
    apiKey: "AIzaSyDtoVaA50nTikqo62rNzn6lAquMJlpjvCA",
    authDomain: "rnkm2018-house-ad25ge.firebaseapp.com",
    databaseURL: "https://rnkm2018-house-ad25ge.firebaseio.com",
    storageBucket: "rnkm2018-house-ad25ge.appspot.com"
};
firebase.initializeApp(config);
var db = firebase.database()


exports.getHouses = functions.https.onRequest((req, res) => {
    return db.ref('/houses').once('value').then(snapshot => {
        return res.send(snapshot.val())
    });
});

exports.addPersonToHouse = functions.https.onRequest((req, res) => {
    // need some identification ? 
    // id should be ID number(13 digit)?

    var newHouse = req.query.house.trim();
    var id = req.query.id.trim();
    console.log(`req: ID:${id} house:${newHouse}`);
    return db.ref('/houses/' + newHouse).transaction((house) => {
        console.log('new house:', house);
        if (house === null){
            return null;
        }
        else if (house.count < house.cap){
            house.count += 1;
            console.log('moved!')
            return house;
        }
        else {
            console.log('not')
            return ;
        }
    }, (err, commited, snapshot) => {
        if (err)
            return res.send('err');
        else if (commited)
            return db.ref('/person/' + id).once('value').then((snapshot) => {
                var oldHouse = snapshot.val().house;
                return db.ref('/houses/' + oldHouse + '/count').transaction((count) => count-1
                ,() => {
                    return db.ref('/person/' + id + '/house').set(newHouse)
                    .then( () => {
                        return res.send('Moved!');
                    }); 

                });
            });   
        else
            return res.send('Full house');
    });
});


exports.initPerson = functions.database.ref('/secure/{userId}').onCreate((snapshot, context) => {
    // when import data from DTNL (house results + other infos ) create db in /person 
    // and hash Their password 
    // if password sent is already hashed I will remove hashing 
    var user = snapshot.val();
    var id = user.idNumber;
    var house = user.house; 
    var password = user.password;
    return db.ref('/person/' + id).set({house: house}).then(() => {
        return bcrypt.hash(password, 8, (err, hash) => {
            if (err){
                console.log("error hashing", err);
                return snapshot.ref.update({hashed: false});
            }
            else {
                return snapshot.ref.update({hashed: true, password: hash});
            }
        });
    });
});

// send cookie ?? (IDK about security OMEGALUL)
exports.login = functions.https.onRequest((req, res) => {
    var id = req.body.id;
    var tel = req.body.tel;
    var password = req.body.password;
    // return res.send(id + '--' +tel);
    return db.ref('/secure/' + id).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (id == user.id && tel == user.tel){
            return bcrypt.compare(password, user.password, (err, same) => {
                if (err){
                    console.log('error logging in', err);
                    return res.send('');
                }
                else{

                }
            });
        } 
        else {
            return res.send('');
        }
    });
   

});
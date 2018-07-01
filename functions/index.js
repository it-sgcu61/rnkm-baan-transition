// Set the configuration for your app
// TODO: Replace with your project's config object
var firebase = require("firebase");
var config = {
    apiKey: "AIzaSyDtoVaA50nTikqo62rNzn6lAquMJlpjvCA",
    authDomain: "rnkm2018-house-ad25ge.firebaseapp.com",
    databaseURL: "https://rnkm2018-house-ad25ge.firebaseio.com",
    storageBucket: "rnkm2018-house-ad25ge.appspot.com"
};
firebase.initializeApp(config);


// Get a reference to the database service

var functions = require('firebase-functions');
var admin = require('firebase-admin');
// admin.initializeApp();
var db = firebase.database()

// var db = admin.database();


// exports.addPerson = functions.https.onRequest((req, res) => {
//     const id = req.query.id;
//     const house = req.query.house;
//     return db.ref('/person/' + id).set({ id: id, house: '4House'}).then((snapshot) => {
//         return res.send('add person' + id);
//     });

// });

exports.getHouses = functions.https.onRequest((req, res) => {
    return db.ref('/houses').once('value').then(snapshot => {
        return res.send(snapshot.val())
    });
});

exports.addPersonToHouse = functions.https.onRequest((req, res) => {
    var newHouse = req.query.house.trim();
    var id = req.query.id.trim();
    // var db = admin.database();
    console.log(`req: ID:${id} house:${newHouse}`);
    return db.ref('/houses/' + newHouse).transaction( (house) => {
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



exports.login = functions.https.onRequest((req, res) => {
    var username = req.body.username;
    var password = req.body.password;
    return db.ref('/secure/' + id).once('value').then((snapshot) => {
        var usr = snapshot.val().username;
        var pwHash = snapshot.val().hash;


    });

});
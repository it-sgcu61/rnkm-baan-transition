// var firebase = require("firebase");
var functions = require('firebase-functions');
var admin = require('firebase-admin'); 
admin.initializeApp();
var bcrypt = require('bcrypt');
var db = admin.database();


exports.getHouses = functions.https.onRequest((req, res) => {
    return db.ref('/houses').once('value').then(snapshot => {
        return res.send(snapshot.val());
    });
});

exports.movePerson_2 = functions.https.onRequest((req, res) => {
    // use username (telephone number) and token (from login) to authenticate
    try {
        var newHouse = req.body.house.trim();
        var username = req.body.username.trim();
        var token = req.body.token.trim();
    } catch (error) {
        return res.send('bad request');
    }
    console.log(`req: ID:${username} house:${newHouse}`);    
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && user.username === username && token === user.token && Date.now() < user.tokenExpire){
            if (user.locked){
                return res.send('you have already confirmed your house')
            }
            return db.ref('/houses/' + newHouse).transaction((house) => {
                console.log('new house:', house);
                if (house === null){
                    return null;
                }
                else if (house.count < house.cap){
                    house.count += 1;
                    console.log('moved!');
                    return house;
                }
                else {
                    console.log('not');
                    return ;
                }
            }, (err, commited, snapshot) => {
                console.log('add person', err, commited, snapshot.val());
                if (err)
                    return res.send('err');
                else if (commited === true && snapshot.val() !== null){ // when null --> moving to non existent house
                    return db.ref('/houses/' + user.house + '/count').transaction((count) => count-1
                    ,() => {
                        return db.ref('/person/' + username + '/house').set(newHouse)
                        .then( () => {
                            return res.send('Moved!');
                        });     
                    });
                } 
                else
                    return res.send('Full house');
            });
        }
        else {
            return res.send('wrong token/pass/username');
        }
    });
});

// send cookie ?? (IDK about security OMEGALUL)
exports.login = functions.https.onRequest((req, res) => {
    try {
        var username = req.body.username.toString(); 
        var password = req.body.password.toString();
    }
    catch (err) {
        return res.send('bad request');
    }
    // return res.send(id + '--' +tel);
    return db.ref('/person/' + username).once('value').then((snapshot) => {
        var user = snapshot.val();
        if (user !== null && username === user.username){
            // console.log('cmp', password,'and' ,user.password);
            return bcrypt.compare(password, user.password, (err, same) => {
                if (err){
                    console.log('error logging in', err);
                    return res.cookie('token', '0', {maxAge: 0, secure: true,  encode:String}).send('Failed');
                }
                else if (same) {
                    return bcrypt.hash(Date.now().toString(16), 10, (err, token) => {
                        // send token
                        if (err){
                            console.log('token generation err', err);
                            return res.cookie('token', '0', {maxAge: 0, secure: true,  encode:String}).send('Failed');
                        }
                        else {
                            var d = new Date();
                            d.setTime(d.getTime() + 4*60*60*1000); // 4hours 
                            return db.ref('/person/' + username).update({token: token, tokenExpire: d.getTime()}).then(() => {
                                return res.cookie('token', token, {maxAge: 600*1000, secure: true,  encode:String}).send('OK');
                            });
                        }
                    });
                }
                else{
                    return res.cookie('token', '0', {maxAge: 0, secure: true,  encode:String}).send('Wrong pass'); //change later
                }
            });
        } 
        else {
            return res.cookie('token', '0', {maxAge: 0, secure: true,  encode:String}).send('Wrong username'); //change later
        }
    });
});

exports.getPersonInfo = functions.https.onRequest((req, res) => {
    // maybe we sent person's name/other info too?? (currently what house and whether person has confirmed his choice)
    try{
        var username = req.body.username;
        var token = req.body.token;
    }   
    catch (err) {
        return res.send('bad request');
    }
    return db.ref('/person/' + username).once('value').then((snapshot) =>{
        var user = snapshot.val();
        if (user !== null && username === user.username && token === user.token && Date.now() < user.tokenExpire){
            return res.send({username: user.username, house: user.house, locked: user.locked});
        }
        else {
            return res.send('wrong token/pass/username');
        }
    });
});

// use when register ??? need something to protect
exports.addPerson = functions.https.onRequest((req, res) => { 
    try {
        var tel=req.body.tel.trim();
        var id=req.body.id.trim();
        var house=req.body.house.trim();
    }
    catch (err) {
        return res.send('bad request');
    }
    return db.ref('/houses/' + house).transaction((house) =>{
        console.log('add person: house ->', house);
        if (house === null){
            return null;
        }
        else if (house.count < house.cap){
            house.count += 1;
            console.log('addperson: moved!')
            return house;
        }
        else {
            console.log('addperson: not')
            return ;
        }
    }, (err, commited, snapshot) =>{
        if (err){
            console.log("add person err:", err);
            return res.send('Failed')
        }        
        else if (commited && snapshot.val() !== null){ // register success and person will be added to DB,  when null --> moving to non existent house
            return db.ref('/person/' + tel).set({username: tel, password: id, house:house, locked: 0}).then((snapshot) => {
                return res.send('OK');
            });
        }
        else { // register failed coz house is full 
            return res.send('Full house');
        }
    });
});

// only  runs when user added by /addPerson which is likely when new user register
exports.initPerson = functions.database.ref('/person/{username}').onCreate((snapshot, context) => {
    // when import data from DTNL (house results + other infos ) create db in /person 
    // and hash Their password 
    // if password sent is already hashed I will remove hashing 
    // incase of DB is int (please use string even for ID and tel)
    var user = snapshot.val();
    var username = user.username.toString();
    var password = user.password.toString();
    return db.ref('/person/' + username).update({locked: 0}).then(() => {
        return bcrypt.hash(password, 8, (err, hash) => {
            if (err){
                console.log("error hashing", err);
                return db.ref('/person/' + username).update({hashed: false});
            }
            else {
                return db.ref('/person/' + username).update({hashed: true, password: hash});
            }
        });
    });
});

exports.onPersonDelete = functions.database.ref('/person/{username}/').onDelete((snapshot, context) => {
    var user = snapshot.val();
    var house = user.house;
    return db.ref('/houses/' + house + '/count').transaction((count) => count-1);
});

exports.onHouseLocked = functions.database.ref('/person/')
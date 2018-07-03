var admin = require('firebase-admin');


var info = require('./info');
var operation = require('./operation');
var account = require('./account');



// var db = admin.database();


exports.getHouses = info.getHouses;
exports.getPersonInfo = info.getPersonInfo;
exports.getPersonInfoOld = info.getPersonInfoOld;
// operation related to changing person
exports.movePerson = operation.movePerson;
exports.confirmHouse = operation.confirmHouse;


// operations related to accounts
exports.login = account.login;
exports.loginOld = account.loginOld; 
exports.addPerson = account.addPerson;
exports.initPerson = account.initPerson
exports.onPersonDelete = account.onPersonDelete;
exports.ADMIN_resetPassword = account.ADMIN_resetPassword;


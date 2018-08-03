var houses = ["a-aum","abnormal","achuan","agape","buchayun","buem","dork","duidui","dung",
"fyo","indiana","indy","jadson","jo","jodeh","khunnoo","kids","koh","koom",
"laijai","mheenoi","nhai","pak-tak-agard","phee","por","preaw","rang","rhoy",
"seiyw","sod","soeitee","tem","wang","wanted","work","yim"];
var ids = require('./dtnlUsers.json').ids;
var m = ids.length;
var n = houses.length;
var randInt = x => Math.floor(Math.random()*x);
var util = require('../utils/util');
var config = require('../config');
var sha256 = require('sha256');
var user = config.dtnlUser,
    pass = config.dtnlPassword;


genPass = async function (requestParams, context, ee, next) {
    context.vars.start = Date.now();
    context.vars = {
        ...context.vars,
        username: config.dtnlUser,
        password: sha256(sha256(config.dtnlPassword) + context.vars.challenge)
    } 
    return next();
}

makeRequest = async function (requestParams, context, ee, next) {
    context.vars.start = Date.now();
    context.vars.house = houses[randInt(n)];
    context.vars.id = ids[randInt(m)];
    var {id, house } = context.vars; 
    await util.sleep(randInt(100));
    context.vars['modify_list'] = JSON.stringify({
        idList: [id],
        modifyList: [{
            columnName: config.houseColumn,
            value: `"${house}"`
        },{
            columnName: "isTransfered",
            value: "true"
        }]
    })
    console.log('test', context.vars['modify_list'])
    return next();
}
logRes = async function (requestParams, response, context, ee, next) {
    context.vars.end = Date.now();
    var {end, start, id, house} = context.vars;
    console.log(`${end-start}ms ${context.vars['$loopCount']}/5 ${JSON.stringify(response.body)}??`);
    return next();
}
module.exports = {
    genPass: genPass,
    makeRequest: makeRequest,
    logRes: logRes
};


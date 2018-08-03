var houses = ["a-aum","abnormal","achuan","agape","buchayun","buem","dork","duidui","dung",
"fyo","indiana","indy","jadson","jo","jodeh","khunnoo","kids","koh","koom",
"laijai","mheenoi","nhai","pak-tak-agard","phee","por","preaw","rang","rhoy",
"seiyw","sod","soeitee","tem","wang","wanted","work","yim"];
var n = houses.length;
var randInt = x => Math.floor(Math.random()*x);
var util = require('../utils/util');

randomHouse = async function(requestParams, context, ee, next) {
    context.vars['house'] = houses[randInt(n)];
    context.vars.start = Date.now();
    var {id, token} = context.vars;
    requestParams = context.vars;
    // await util.sleep(randInt(100));
    return next();
}
logRes = function (requestParams, response, context, ee, next) {
    var {id, tel, house} = requestParams;
    context.vars.end = Date.now();
    var {end, start} = context.vars;
    console.log(`${end-start}ms ${context.vars['$loopCount']}/10 ${context.vars.id} moving to ${context.vars.house} is ${JSON.parse(response.body).message}`);
    return next();
}

module.exports = {
    randomHouse: randomHouse,
    logRes: logRes
}
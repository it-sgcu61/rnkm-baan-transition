var config = require('../config');
var util = require('../utils/util');
var request = require('superagent');
var sha256 = require('sha256')
var config = require('../config')

var acc = [];
var lock = 0;
var delay = config.batchSendInterval, cap = config.batchSendSize;
const agent = request.agent();

async function setupDTNL() {
    var challenge_request = await agent.get(`http://${config.dtnlADDR}/api/v1/greeting`).withCredentials()
    var login_result = await agent.post(`http://${config.dtnlADDR}/api/v1/login`)
    .send({
      username: config.dtnlUser,
      password: sha256(sha256(config.dtnlPassword) + challenge_request.body.challenge)
    }).withCredentials().catch((err) => console.log(err))

    if (login_result.body.permission == -1) {
      throw new Error("Failed to connect to DTNL system.")
    } else {
      var tableFetch = await agent.get(`http://${config.dtnlADDR}/api/v1/get/tableList`).withCredentials()
      if (tableFetch.body.tableList.includes(config.rnkmTablename)) {
        throw new Error("Table configuration invalid.")
      }
      return Promise.resolve(agent)
    }
  }


var queryDTNL = async function (agent, reqs, fallback) {
    // reqs = {data: {...}, cb: callback}
    // call back with data of student of which 'tel' and 'nationalID' match the data
    let ids = reqs.map(x => x.data.id)
    console.log({
        filter: JSON.stringify([{
            column_name: config.idColumn,
            expression: 'like',
            value: util.makeRegex(ids)
        }])
    })
    var dtnlData = await agent.post(`http://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`)
        .send({
            sortby: "",
            orderby: "",
            filter: JSON.stringify([{
                column_name: config.idColumn,
                expression: 'like',
                value: util.makeRegex(ids)
            }])
        })
        .withCredentials().catch(async (err) => {
            const newConn = await setupDTNL()
            fallback(newConn)
            queryDTNL(newConn, reqs, fallback)
        })

    for (var i = 0; i < reqs.length; i++) {
        var { cb, data } = reqs[i];
        cb(dtnlData.body.body ? dtnlData.body.body.filter(x => x[config.telColumn] === data.tel) : [])
    }
}
var query = async function (agent, data, cb, fallback) {
    // data = {id: 'xxxxxxxxxx', tel: '0xx-xxx-xxxx'}
    acc.push({ data: data, cb: cb });

    //  resolve immediately if theres at least cap(20) requests
    if (acc.length > cap) {
        to_resolve = acc.slice(0, cap); acc = acc.slice(cap);
        queryDTNL(agent, to_resolve, fallback);
    }
    // default : resolve after 2 secs
    if (lock === 0) {
        lock = 1;
        await util.sleep(delay);
        to_resolve = acc.slice(0, cap); acc = acc.slice(cap);
        queryDTNL(agent, to_resolve, fallback);
        lock = 0;
    }
}
var modify = async function (agent, ids, changes) {
    agent.post('')


}
module.exports = {
    query: query,
    queryDTNL: queryDTNL,
    setupDTNL: setupDTNL
}

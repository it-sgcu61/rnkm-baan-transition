var request = require('superagent');
var sha256 = require('sha256')
var admin = require('firebase-admin');

var config = require('./config')
var firebaseKey = require('./firebaseKey.json');
var sentinelFunc = require('./functions');
var schedule = require('node-schedule');

const agent = request.agent()
var houses = config.houses
var query = sentinelFunc.query
var forceConfirm = sentinelFunc.confirm
var sleep = sentinelFunc.sleep

admin.initializeApp({
  credential: admin.credential.cert(firebaseKey),
  databaseURL: 'https://rnkm-cu102.firebaseio.com'
})

async function setupDTNL() {
  var challenge_request = await agent.get(`http://${config.dtnlADDR}/api/v1/greeting`).withCredentials()
  var login_result = await agent.post(`http://${config.dtnlADDR}/api/v1/login`)
  .send({
    username: config.dtnlUser,
    password: sha256(sha256(config.dtnlPassword) + challenge_request.body.challenge)
  })
  .withCredentials().catch((err) => console.log(err))
  if (login_result.body.permission == -1) {
    throw new Error("Failed to connect to DTNL system.")
  } else {
    console.log(login_result.body);
    var tableFetch = await agent.get(`http://${config.dtnlADDR}/api/v1/get/tableList`).withCredentials()
    if (tableFetch.body.tableList.includes(config.rnkmTablename)) {
      throw new Error("Table configuration invalid.")
    }
    return Promise.resolve(agent)
  }
}
setupDTNL().then(async (agent) => {
  var db = admin.database();
  for (var house in houses) {
    await sleep(100);
    let h = house;
    console.log(h);
    query(agent, h).then(count => {
        console.log(count);
        db.ref(`/houses/${h}`).set({
            count: count,
            cap: houses[h].cap,
            avail: houses[h].cap-count,
            used: 0
        }).then(() => {
            console.log('--> success', h, {
                count: count,
                cap: houses[h].cap,
                avail: houses[h].cap-count,
                used: 0
            });
        })
        .catch(err => {
            console.log(err);
        })
    })
    .catch(err => {
        console.log("DTNL fallback", err);
    })
  }
}).catch((error) => { throw error; process.exit(1) })
console.log("firebase db setup completed.")
var j = schedule.scheduleJob("0 11 4 8 2018", forceConfirm);
var j2 = schedule.scheduleJob("30 12 4 8 2018", forceConfirm);

var request = require('superagent');
var sha256 = require('sha256');
var config = require('./config');
var agent = request.agent();

var admin = require('firebase-admin');
admin.initializeApp();
exports.adminClient = admin.database();

exports.setupDTNL = function () { // dtnl interface
    return agent.get(`http://${config.dtnlADDR}/api/v1/greeting`).withCredentials().then((challenge_request) => {
        return agent.post(`http://${config.dtnlADDR}/api/v1/login`)
            .send({
                username: config.dtnlUser,
                password: sha256(sha256(config.dtnlPassword) + challenge_request.body.challenge)
            })
            .withCredentials()
            .then(login_result => {
                if (login_result.body.permission === -1) {
                    console.log('Failed to connect to DTNL system.')
                    throw new Error("Failed to connect to DTNL system.");
                } else {
                    return agent.get(`http://${config.dtnlADDR}/api/v1/get/tableList`).withCredentials().then(tableFetch => {
                        if (tableFetch.body.tableList.includes(config.rnkmTablename)) {
                            console.log('Table configuration invalid.');
                            throw new Error("Table configuration invalid.");
                        }
                        return Promise.resolve(agent);
                    });
                }
            }).catch((err) => console.log("DTNL", err));
    });
}
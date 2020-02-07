const Discord = require("discord.js"); // eslint-disable-line no-unused-vars
const dashboard = require("../dashboard/index.js");

exports.run = async client => {
  console.log(`Bot client is ready, starting the list..`);
  dashboard(client);
  client.emit("updatePresence");
};

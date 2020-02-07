const Discord = require("discord.js");
const client = new Discord.Client();
const fs = require("fs");
client.config = require("./config.js");
client.commands = new Discord.Collection();
const config = require("./config.js");
const mongoose = require("mongoose");
const bots = require("./models/bots.js");

var maintenanceData = fs.readFileSync("maintenance.json", "utf8");
maintenanceData = JSON.parse(maintenanceData);
if (maintenanceData && maintenanceData.maintenance === true) {
  client.maintenance = true;
} else {
  client.maintenance = false;
}
client.maintenanceData = maintenanceData;

var notice = fs.readFileSync("notice.json", "utf8");
notice = JSON.parse(notice);
client.notice = notice.notice;

var suspended = fs.readFileSync("suspended.json", "utf8");
suspended = JSON.parse(suspended);
client.suspendedUsers = suspended;

mongoose.connect(config.dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });

fs.readdir("./events/", (err, files) => {
  if (err) return console.error(err);
  files.forEach(file => {
    let eventFunction = require(`./events/${file}`);
    console.log(`Event Loaded: ${file.split(".")[0]}`);
    let eventName = file.split(".")[0];
    client.on(eventName, (...args) => eventFunction.run(client, ...args));
  });
});

fs.readdir("./commands/", (err, files) => {
  if (err) console.log(err);
  let jsfile = files.filter(f => f.split(".").pop() === "js");
  if (jsfile.length <= 0) {
    console.log("No commands were found!");
    return;
  }

  jsfile.forEach((f, i) => {
    let props = require(`./commands/${f}`);
    console.log(`Command Loaded: ${f.split(".")[0]}`);
    client.commands.set(props.help.name, props);
  });
});

client.on("updatePresence", async () => {
  const totalBots = await bots.countDocuments({ approved: true });
  await client.user.setActivity(`${totalBots} bots on list`, {
    type: "WATCHING"
  });
});

client.login(client.config.token);

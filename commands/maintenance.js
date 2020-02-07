const Discord = require("discord.js");
const fs = require("fs");

module.exports.run = async (client, message, args, reply) => {
  if (!["367302593753645057", "542058542853521461"].includes(message.author.id)) return reply("You are not authorized to edit maintenance.");
  
  if (!args[0]) return reply("Valid options are `on`, `off` and `add-bypassed-user`.");
  if (args[0].toLowerCase() == "on") {
    if (client.maintenance === true) return reply("Maintenance is already active.");
    client.maintenance = true;
    client.maintenanceData.maintenance = true;
    fs.writeFileSync("maintenance.json", JSON.stringify(client.maintenanceData, null, 4), { encoding: "utf8" });
    reply("Toggled maintenance mode to on.");
  } else if (args[0].toLowerCase() == "add-bypassed-user") {
    if (!message.mentions.users.first() && !client.users.get(args[1])) return reply("You need to either mention an user or to specify an id.");
    const user = message.mentions.users.first() || client.users.get(args[1]);
    if (client.maintenanceData.bypassers.includes(user.id)) return reply("This user is already bypassed by the maintenance mode.");
    client.maintenanceData.bypassers.push(user.id);
    fs.writeFileSync("maintenance.json", JSON.stringify(client.maintenanceData, null, 4), { encoding: "utf8" });
    reply(`Maintenance mode now bypasses **${user.tag}**.`)
  } else if (args[0].toLowerCase() == "off") {
    if (client.maintenance === false) return reply("Maintenance is already inactive.");
    client.maintenance = false;
    client.maintenanceData.maintenance = false;
    fs.writeFileSync("maintenance.json", JSON.stringify(client.maintenanceData, null, 4), { encoding: "utf8" });
    reply("Toggled maintenance mode to off.");
   } else {
    return reply("Valid options are `on` and `add-bypassed-user`.");
  }
};

module.exports.help = {
  name: "maintenance"
};
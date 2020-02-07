const Discord = require("discord.js");
const fs = require("fs");

function getIndex(array, fn) {
  for (var x = 0; x < array.length; x++) {
    if (fn(array[x]) === true) {
      return x;
      break;
    }
  }
  return -1;
}

// ^ Handmade function

module.exports.run = async (client, message, args, reply) => {
  if (!["367302593753645057", "542058542853521461"].includes(message.author.id)) return reply("You are not authorized to edit suspended users.");
  
  if (!args[0]) return reply("Valid options are `add` and `remove`.");
  if (args[0].toLowerCase() === "add") {
    if (!args[1]) return reply("You have to provide an ID to suspend from using website.");
    var user;
    try {
      user = await client.users.fetch(args[1]);
    } catch (e) {
      return reply("Invalid user id provided.")
    }
    if (!user) return reply("Failed to fetch the user.");
    var index = getIndex(client.suspendedUsers, (id) => id === user.id);
    if (index !== -1) return reply("This user is already suspended.");
    
    client.suspendedUsers.push(user.id);
    fs.writeFileSync("suspended.json", JSON.stringify(client.suspendedUsers, null, 4), { encoding: "utf8" });
    
    return reply(`**${user.tag}** is now suspended from using discord bot house website.`);
  } else if (args[0].toLowerCase() === "remove") {
    if (!args[1]) return reply("You have to provide an id to un-suspend from using website.");
    var user;
    try {
      user = await client.users.fetch(args[1]);
    } catch (e) {
      return reply("Invalid user id provided.");
    }
    if (!user) return reply("Failed to fetch the user.");
    var index = getIndex(client.suspendedUsers, (id) => id === user.id);
    if (index < 0) return reply("There are no suspended users with this id.");
    client.suspendedUsers.splice(index, 1);
    
    fs.writeFileSync("suspended.json", JSON.stringify(client.suspendedUsers, null, 4), { encoding: "utf8" });
    
    return reply(`**${user.tag}** is no longer suspended from using discord bot house website.`);
  } else {
    return reply("Valid options are `add` and `remove`.");
  }
};

module.exports.help = {
  name: "suspend"
};
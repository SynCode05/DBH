const Discord = require("discord.js");
const fs = require("fs");

module.exports.run = async (client, message, args, reply) => {
  if (!["367302593753645057", "542058542853521461"].includes(message.author.id)) return reply("You are not authorized to edit maintenance.");
  var types = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
  if (args[0] === "type") {
    console.log(args[1]);
    const embed = new Discord.MessageEmbed()
      .setTitle("Type Samples")
      .setColor("#2C2F33")
      .setImage("https://cdn.discordapp.com/attachments/637368145153359895/663888802133049374/Screenshot_from_2020-01-07_01-36-43.png");
    if (!args[1]) return message.channel.send("Valid types are `primary`, `secondary`, `success`, `danger`, `warning`, `info`, `light`, `dark`.", embed);
    if (!types.includes(args[1])) return message.channel.send("Valid types are `primary`, `secondary`, `success`, `danger`, `warning`, `info`, `light`, `dark`.", embed);
    client.noticeType = args[1];
    return reply("Notice theme has been sent. The theme will be set to default (danger) upon restart and you have to set a custom type again.");
  } else if (args[0] === "reset") {
    client.notice = null;
    fs.writeFileSync("notice.json", JSON.stringify({ notice: null }, null, 4), { encoding: "utf8" });
    return reply("Notice is now hidden.");
  }
  
  if (!args[0]) return reply("Set a notice on the website.");
  client.notice = args.join(" ");
  fs.writeFileSync("notice.json", JSON.stringify({ notice: client.notice }, null, 4), { encoding: "utf8" });
  reply("The notice has been set.");
};

module.exports.help = {
  name: "notice"
};
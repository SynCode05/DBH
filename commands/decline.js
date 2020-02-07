const Discord = require("discord.js");
const bots = require("../models/bots");
const profiles = require("../models/profile");

module.exports.run = async (client, message, args, reply) => {
  const userProfile = await profiles.findOne({ id: message.author.id });
  if (!userProfile || userProfile.mod !== true && userProfile.admin !== true) return reply(`You can't do this.`);

  var bot = message.mentions.users.first() || { id: args[0] };
  if (bot) bot = bot.id;

  const reason = args.slice(1).join(" ");
  if (!bot) return reply("Please specify a bot to reject.");
  if (!reason) return reply("Please specify a reason for the rejection.");

  const bot1 = await bots.findOne({ id: bot });
  await bots.findOneAndDelete({ id: bot });

  if (!bot1) return reply("The specified bot was not found in the queue.")

  const bt = await client.users.fetch(bot1.id);

  var allOwners = bot1.owners;
  allOwners.unshift(bot1.mainOwner);
  allOwners = allOwners.map(u => `<@${u}>`);

  client.channels.get(client.config.channels.declineLogsChannel).send(`<@${bot}> by ${allOwners.join(" ")} has been rejected by ${message.author}.`);

  const declineEmbed = new Discord.MessageEmbed()
    .setColor("RED")
    .setTitle("Bot Rejected")
    .setDescription(`**Bot**: ${bt.tag} (ID: ${bt.id})\n**Moderator**: ${message.author.tag} (ID: ${message.author.id})\n**Reason**: ${reason}`)
    .setTimestamp();
  client.channels.get(client.config.channels.rejectedAuditChannel).send(declineEmbed);

  const user = client.users.get(bot1.mainOwner);
  if (user) user.send(`Your bot <@${bot}> has been rejected by ${message.author.tag}.`);
  reply("Bot has been rejected.");
};

module.exports.help = {
  name: "decline"
};
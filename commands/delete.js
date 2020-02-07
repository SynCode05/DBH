const Discord = require("discord.js");
const bots = require("../models/bots");
const profiles = require("../models/profile");

module.exports.run = async (client, message, args, reply) => {
  const userProfile = await profiles.findOne({ id: message.author.id });
  if (!userProfile || userProfile.mod !== true && userProfile.admin !== true) return reply(`You can't do this.`);

  var bot = message.mentions.users.first() || { id: args[0] };
  if (bot) bot = bot.id;

  const reason = args.slice(1).join(" ");
  if (!bot) return reply("Please specify a bot to forcefully delete.");
  if (!reason) return reply("Please specify a reason to forcefully delete the bot.");

  const bot1 = await bots.findOne({ id: bot });
  if (!bot1) return reply("The specified bot couldn't be found.");
  await bots.findOneAndDelete({ id: bot });
  if (client.guilds.get(client.config.baseGuildId).members.get(bot1.id)) await client.guilds.get(client.config.baseGuildId).members.get(bot1.id).kick("Forcefully deleted.");
  const bt = await client.users.fetch(bot1.id);

  var allOwners = bot1.owners;
  allOwners.unshift(bot1.mainOwner);
  allOwners = allOwners.map(u => `<@${u}>`);

  client.channels.get(client.config.channels.botDeletionLogsChannel).send(`<@${bot}> by ${allOwners.join(" ")} has been forcefully deleted by ${message.author}.`);

  for (const owner of allOwners) {
    const theOwner = client.guilds.get(client.config.baseGuildId).members.get(owner);
    if (theOwner) {
      var allBots = await bots.find();
      allBots.filter(b => b.mainOwner === owner || b.owners.includes(owner));
      if (allBots.length > 0) return;
      if (theOwner.roles.has(client.config.developerRole)) theOwner.roles.remove(client.guilds.get(client.config.baseGuildId).roles.get(client.config.developerRole));
    }
  }

  const deleteEmbed = new Discord.MessageEmbed()
    .setColor("RED")
    .setTitle("Bot Forcefull Deleted")
    .setDescription(`**Bot**: ${bt.tag} (ID: ${bt.id})\n**Moderator**: ${message.author.tag} (ID: ${message.author.id})\n**Reason**: ${reason}`)
    .setTimestamp();
  client.channels.get(client.config.channels.botDeletionAuditChannel).send(deleteEmbed);
  const user = client.users.get(bot1.mainOwner);
  if (user) user.send(`Your bot <@${bot}> has been forcefully deleted from the list by ${message.author.tag}.`);
  reply("Successfully forcefully deleted bot.");
};

module.exports.help = {
  name: "delete"
};
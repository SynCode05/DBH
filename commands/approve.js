const Discord = require("discord.js");
const bots = require("../models/bots");
const profiles = require("../models/profile");

module.exports.run = async (client, message, args, reply) => {
  const userProfile = await profiles.findOne({ id: message.author.id });
  if (!userProfile || (userProfile.mod !== true && userProfile.admin !== true))
    return reply(`You are not allowed to perform this action`);

  var bot = message.mentions.users.first() || { id: args[0] };
  if (bot) bot = bot.id;
  if (!bot) return reply("Please specify a bot to approve.");

  await bots.findOne({ id: bot }, async (err, res) => {
    if (err) console.log(err);
    if (!res) return reply(`The specified bot was not found in the queue.`);
    res.approved = true;
    await res.save().catch(e => console.log(e));
    if (
      client.guilds.get(client.config.baseGuildId).members.get(res.mainOwner)
    ) {
      client.guilds
        .get(client.config.baseGuildId)
        .members.get(res.mainOwner)
        .roles.add(
          client.guilds
            .get(client.config.baseGuildId)
            .roles.get(client.config.developerRole)
        );
    }

    for (const owner of res.owners) {
      if (client.guilds.get(client.config.baseGuildId).members.get(owner))
        client.guilds
          .get(client.config.baseGuildId)
          .members.members.get(owner)
          .roles.add(
            client.guilds
              .get(client.config.baseGuildId)
              .roles.get(client.config.developerRole)
          );
    }

    var allOwners = res.owners;
    allOwners.unshift(res.mainOwner);
    allOwners = allOwners.map(u => `<@${u}>`);
    await client.channels
      .get(client.config.channels.approveLogsChannel)
      .send(
        `<@${res.id}> by ${allOwners.join(" ")} has been approved by <@${
          message.author.id
        }>.`
      );
    const user = client.users.get(res.mainOwner);
    if (user)
      user.send(`Your bot <@${bot}> was approved by ${message.author.tag}.`);
    client.emit("updatePresence");
    const Embed = new Discord.MessageEmbed()
      .setDescription(
        `Sucessfully approved <@${bot}>. Invite Link: ${res.invite}`
      )
      .setColor("GREEN");
    reply(Embed);
  });
};

module.exports.help = {
  name: "approve"
};

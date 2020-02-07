const Discord = require("discord.js");
const request = require("request");
const profiles = require("../models/profile.js");

module.exports.run = async (client, message, args, reply) => {
  const userProfile = await profiles.findOne({ id: message.author.id });
  if (userProfile.admin !== true) return reply(`You can't do this.`);

  const error = `Provide the appropriate security profile
    \`1\` - Essentially Off
    \`2\` - Low
    \`3\` - Medium
    \`4\` - High
    \`5\` - Under Attack
    `;
  if (!args) return reply(error);
  if (
    args[0] !== "1" &&
    args[0] !== "2" &&
    args[0] !== "3" &&
    args[0] !== "4" &&
    args[0] !== "5"
  )
    return reply(error);
  let value;
  if (args[0] == "1") value = "essentially_off";
  if (args[0] == "2") value = "low";
  if (args[0] == "3") value = "medium";
  if (args[0] == "4") value = "high";
  if (args[0] == "5") value = "under_attack";
  let dataString;
  if (args[0] == "1") dataString = `{"value":"essentially_off"}`;
  if (args[0] == "2") dataString = `{"value":"low"}`;
  if (args[0] == "3") dataString = `{"value":"medium"}`;
  if (args[0] == "4") dataString = `{"value":"high"}`;
  if (args[0] == "5") dataString = `{"value":"under_attack"}`;
  var headers = {
    "X-Auth-Email": "tanznolan@@gmail.com",
    "X-Auth-Key": "e89f1617d007f97620b1e1f44a4797e76f249",
    "Content-Type": "application/json"
  };

  var options = {
    url:
      "https://api.cloudflare.com/client/v4/zones/8adc97e44e8c0d095ee47ec9a808b21b/settings/security_level",
    method: "PATCH",
    headers: headers,
    body: dataString
  };

  function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
      message.channel.send(
        `<:greenTick:568885198519926784> Mode has been set to \`${value}\`.`
      );
    } else {
      message.channel.send("Status code : " + response.statusCode);
      if (error)
        message.channel.send(
          "<:redTick:568885082321059865> Error while updating mode: " + error
        );
    }
  }

  request(options, callback);
};

module.exports.help = {
  name: "ddos"
};

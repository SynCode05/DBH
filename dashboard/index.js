const url = require("url");
const path = require("path");
const Discord = require("discord.js");
const express = require("express");
const app = express();
const moment = require("moment");
require("moment-duration-format");
const passport = require("passport");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const Strategy = require("passport-discord").Strategy;
const helmet = require("helmet");
const md = require("marked");
const validUrl = require("valid-url");
const Profiles = require("../models/profile");
const Bots = require("../models/bots");
const config = require("../config");
const mongoose = require("mongoose");

mongoose.connect(config.dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });

module.exports = client => {
  const dataDir = path.resolve(`${process.cwd()}${path.sep}dashboard`);
  const templateDir = path.resolve(`${dataDir}${path.sep}templates`);
  app.use(
    "/public",
    express.static(path.resolve(`${dataDir}${path.sep}public`))
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  const validateBotForID = async id => {
    try {
      const bot = await client.users.fetch(id);
      if (bot.bot) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  };

  const getClientIp = req => {
    var ipAddress = req.connection.remoteAddress;
    if (!ipAddress) {
      return "";
    }

    if (ipAddress.substr(0, 7) == "::ffff:") {
      ipAddress = ipAddress.substr(7);
    }

    return ipAddress;
  };

  const msToHMS = ms => {
    var seconds = ms / 1000;
    var hours = parseInt(seconds / 3600);
    seconds = seconds % 3600;
    var minutes = parseInt(seconds / 60);
    seconds = seconds % 60;
    return `${hours} hours, ${minutes} minutes and ${Math.round(
      seconds
    )} seconds`;
  };

  const paginate = (arr, pageSize, selectedPage) => {
    --selectedPage;
    const output = arr.slice(
      selectedPage * pageSize,
      (selectedPage + 1) * pageSize
    );
    return output;
  };

  const fetchInviteURL = async invite => {
    try {
      const inv = await client.fetchInvite(invite);
      return { valid: true, temporary: false };
    } catch (e) {
      return { valid: false, temporary: null };
    }
  };

  const renderTemplate = (res, req, template, data = {}) => {
    const baseData = {
      bot: client,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null
    };
    res.render(
      path.resolve(`${templateDir}${path.sep}${template}`),
      Object.assign(baseData, data)
    );
  };

  passport.use(
    new Strategy(
      {
        clientID: client.user.id,
        clientSecret: client.config.dashboard.oauthSecret,
        callbackURL: client.config.dashboard.callbackURL,
        scope: ["identify", "email"]
      },
      (accessToken, refreshToken, profile, done) => {
        process.nextTick(() => done(null, profile));
      }
    )
  );

  app.use(
    session({
      store: new MemoryStore({ checkPeriod: 86400000 }),
      secret: client.config.dashboard.sessionSecret,
      resave: false,
      saveUninitialized: false
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(helmet());

  app.locals.domain = client.config.dashboard.domain;
  app.engine("html", require("ejs").renderFile);
  app.set("view engine", "html");
  var bodyParser = require("body-parser");
  app.use(bodyParser.json());
  app.use(
    bodyParser.urlencoded({
      extended: true
    })
  );

  function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.backURL = req.url;
    res.redirect("/login");
  }

  app.get("/discord", (req, res) => res.redirect(client.config.discordInvite));

  app.get(
    "/login",
    (req, res, next) => {
      if (req.session.backURL) {
        req.session.backURL = req.session.backURL; // eslint-disable-line no-self-assign
      } else if (req.headers.referer) {
        const parsed = url.parse(req.headers.referer);
        if (parsed.hostname === app.locals.domain) {
          req.session.backURL = parsed.path;
        }
      } else {
        req.session.backURL = "/";
      }
      next();
    },
    passport.authenticate("discord")
  );

  app.get(
    "/callback",
    passport.authenticate("discord", { failureRedirect: "/forbidden" }),
    async (req, res) => {
      session.us = req.user;
      let userdata = await Profiles.findOne({ id: req.user.id });
      if (!userdata) {
        const usr = new Profiles({
          id: req.user.id,
          bio: "I'm a very mysterious person.",
          certifiedDev: false,
          bg: null,
          karma: 0,
          totalKarma: 0,
          mod: false,
          admin: false
        });
        await usr.save().catch(e => console.log(e));
        userdata = {
          id: req.user.id,
          bio: "I'm a very mysterious person.",
          certifiedDev: false,
          bg: null,
          mod: false,
          admin: false
        };
      }

      if (userdata.mod === true) req.session.permLevel = 1;
      if (userdata.admin === true) req.session.permLevel = 2;
      if (!req.session.permLevel) req.session.permLevel = 0;

      if (req.session.backURL) {
        const url = req.session.backURL;
        req.session.backURL = null;
        res.redirect(url);
      } else {
        res.redirect("/");
      }
    }
  );

  app.get("/logout", function(req, res) {
    req.session.destroy(() => {
      req.logout();
      res.redirect("/");
    });
  });

  app.use((req, res, next) => {
    if (client.maintenance && !req.user) {
      return renderTemplate(res, req, "maintenance.ejs");
    } else if (client.maintenance && client.maintenanceData.bypassers.includes(req.user.id)) {
      next();
    } else {
      next();
    }
  });
  
  app.use((req, res, next) => {
    if (req.user) {
      if (client.suspendedUsers.includes(req.user.id)) {
        return renderTemplate(res, req, "suspended.ejs");
      } else {
        next();
      }
    } else {
      next();
    }
  });
  
  app.get("/", async (req, res) => {
    let results = await Bots.find({ featured: true, approved: true });
    let newbot = await Bots.find({ approved: true }).sort({ _id: -1 });
    let topBots = await Bots.find({ approved: true }).sort([
      ["upvotes", "descending"]
    ]);
    renderTemplate(res, req, "index.ejs", {
      featuredBots: results.splice(0, 4),
      newBots: newbot.splice(0, 8),
      topBots: topBots.splice(0, 8)
    });
  });

  // app.get("/api/bot/:id", async (req, res) => {
  //   res.setHeader("Content-Type", "application/json");
  //   if (typeof req.params.id !== "string") return res.status(400).send(JSON.stringify({ "msg": "Bad Request.", "code": 400 }, null, 4));
  //   const data = await Bots.findOne({ id: req.params.id, approved: true });;
  //   if (!data) return res.status(404).send(JSON.stringify({ "msg": "Not Found.", "code": 404 }, null, 4));
  //   const obj = {
  //     "msg": "Sucessfull request.",
  //     "code": 200,
  //     "id": data.id,
  //     "owner": data.mainOwner,
  //     "owners": data.owners,
  //     "library": data.library,
  //     "monthlyUpvotes": data.upvotes,
  //     "allTimeUpvotes": data.totalVotes,
  //     "website": data.website,
  //     "votes": data.votes,
  //     "githubUrl": data.github,
  //     "supportServerInvite": data.server,
  //     "prefix": data.prefix,
  //     "verified": data.verified,
  //     "trusted": data.trusted,
  //     "vanityUrl": data.vanityUrl,
  //     "stats": data.stats,
  //     "inviteUrl": data.invite,
  //     "tags": data.tags,
  //     "shardID": data.shardID,
  //     "serverCount": data.serverCount,
  //     "shardCount": data.shardCount
  //   };
  //   return res.status(200).send(JSON.stringify(obj, null, 4));
  // });

  // app.get("/api/profiles/:id", async (req, res) => {
  //   res.setHeader("Content-Type", "application/json");
  //   if (typeof req.params.id !== "string") return res.status(400).send(JSON.stringify({ "msg": "Bad Request.", "code": 400 }, null, 4));
  //   const data = await Profiles.findOne({ id: req.params.id, });
  //   if (!data) return res.status(404).send(JSON.stringify({ "msg": "Not Found.", "code": 404 }, null, 4));
  //   const obj = {
  //     "msg": "Sucessfull request.",
  //     "code": 200,
  //     "id": data.id,
  //     "bio": data.bio,
  //     "karma": data.karma,
  //     "totalKarma": data.totalKarma,
  //     "certifiedDev": data.certifiedDev,
  //     "customBackground": data.bg,
  //     "mod": data.mod,
  //     "admin": data.admin
  //   };
  //   return res.status(200).send(JSON.stringify(obj, null, 4));
  // });
  //
  
  app.post("/api/stats/bot/:id", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (typeof req.params.id !== "string")
      return res
        .status(400)
        .send(JSON.stringify({ msg: "Bad Request.", code: 400 }, null, 4));
    if (!req.body)
      return res.status(400).send(
        JSON.stringify(
          {
            msg: "Bad Request.",
            code: 400,
            error: "No body was found within the request.",
            errorCode: "NO_STATS_POST_BODY"
          },
          null,
          4
        )
      );
    if (!req.body.serverCount)
      return res.status(400).send(
        JSON.stringify(
          {
            msg: "Bad Request.",
            code: 400,
            error: "No serverCount key was found within the request body.",
            errorCode: "NO_STATS_POST_SERVERCOUNT"
          },
          null,
          4
        )
      );
    if (!req.body.authorization)
      return res.status(400).send(
        JSON.stringify(
          {
            msg: "Bad Request.",
            code: 400,
            error: "No authorization key was found within the request body.",
            errorCode: "NO_STATS_POST_AUTHORIZATION"
          },
          null,
          4
        )
      );
    if (isNaN(parseInt(req.body.serverCount)))
      return res.status(400).send(
        JSON.stringify(
          {
            msg: "Bad Request.",
            code: 400,
            error: "serverCount must be a number.",
            errorCode: "STATS_POST_INVALID_SERVERCOUNT"
          },
          null,
          4
        )
      );
    if (typeof req.body.authorization !== "string")
      return res.status(400).send(
        JSON.stringify(
          {
            msg: "Bad Request.",
            code: 400,
            error: "authorization must be a string.",
            errorCode: "STATS_POST_INVALID_AUTHORIZATION"
          },
          null,
          4
        )
      );
    if (req.body.shardCount && isNaN(parseInt(req.body.shardCount)))
      return res.status(400).send(
        JSON.stringify(
          {
            msg: "Bad Request.",
            code: 400,
            error: "shardCount must be a number.",
            errorCode: "STATS_POST_INVALID_SHARDCOUNT"
          },
          null,
          4
        )
      );
    Bots.findOne({ id: req.params.id, approved: true }, async (err, itself) => {
      if (err) console.log(err);
      if (!itself)
        return res
          .status(404)
          .send(JSON.stringify({ msg: "Not Found.", code: 404 }, null, 4));
      if (req.body.authorization !== itself.token)
        return res.status(401).send(
          JSON.stringify(
            {
              msg: "Unauthorized.",
              code: 401,
              error: "Invalid authorization token was provided for this bot."
            },
            null,
            4
          )
        );
      itself.serverCount = parseInt(req.body.serverCount);
      if (req.body.shardCount)
        itself.shardCount = parseInt(req.body.shardCount);
      await itself.save().catch(e => console.log(e));
      res
        .status(200)
        .send(
          JSON.stringify({ msg: "Sucessful request.", code: 200 }, null, 4)
        );
    });
  });

  app.get("/api/upvotes/bot/:id", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    Bots.findOne({ id: req.params.id }, async (err, entry) => {
      if (err) console.log(err);
      if (!entry)
        return res.status(404).send(
          JSON.stringify(
            {
              msg: "Not Found.",
              code: 404,
              error: "No bot found.",
              errorCode: "NOT_FOUND"
            },
            null,
            4
          )
        );
      const authorization = req.query.authorization;
      if (!authorization || typeof authorization !== "string")
        return res.status(400).send(
          JSON.stringify(
            {
              msg: "Bad Request.",
              code: 400,
              error:
                "No authorization key was found within the reuqest headers.",
              errorCode: "NO_REQUEST_UPVOTES_AUTHORIZATION"
            },
            null,
            4
          )
        );
      if (entry.token !== authorization)
        return res.status(401).send(
          JSON.stringify(
            {
              msg: "Unauthorized.",
              code: 401,
              error: "Invalid authorization token was provided for this bot."
            },
            null,
            4
          )
        );
      var upvotes = entry.votes.filter(
        u => Date.now() - u.timestamp < 43200000
      );
      upvotes = upvotes.map(u => u.id);

      res
        .status(200)
        .send(
          JSON.stringify(
            { msg: "Sucessful request.", code: 200, upvotes: upvotes },
            null,
            4
          )
        );
    });
  });

  app.get("/profile/:userID", async (req, res) => {
    const discordUser = client.users.get(req.params.userID);
    if (!discordUser) return res.redirect("/");
    const bots = await Bots.find({ mainOwner: discordUser.id, approved: true });
    var userData = await Profiles.findOne({ id: discordUser.id });
    if (!userData)
      userData = {
        bg: null,
        bio: "I'm a very misteryious person.",
        certifiedDev: null,
        mod: false,
        admin: false
      };
    renderTemplate(res, req, "/profile.ejs", {
      profile: userData,
      bots,
      discordUser
    });
  });

  app.get("/contact", checkAuth, (req, res) => {
    renderTemplate(res, req, "contact.ejs");
  });

  app.post("/contact", checkAuth, async (req, res) => {
    if (!req.body.message) return res.redirect("/contact");

    const embed = new Discord.MessageEmbed()
      .setAuthor("Contact Form", req.user.avatarURL)
      .setDescription(req.body.message)
      .addField(
        "Submitted by:",
        `${req.user.username}#${req.user.discriminator} (ID: ${req.user.id})`
      )
      .addField("Internet Protocol:", `${getClientIp(req)}`)
      .addField("E-mail:", `${req.user.email}`)
      .setColor("RANDOM")
      .setTimestamp();

    client.channels.get(client.config.channels.contactEmbedChannel).send(embed);
    res.redirect("/");
  });

  app.get("/list/top", async (req, res) => {
    var currentPage = req.query.page || "1";
    if (isNaN(parseInt(currentPage))) {
      currentPage = 1;
    } else {
      currentPage = parseInt(currentPage);
    }

    let results = await Bots.find({ approved: true }).sort([
      ["upvotes", "descending"]
    ]);
    const lengthOfRes = results.length;
    var totalPages;
    if (Math.round(lengthOfRes / 16) === lengthOfRes / 16) {
      totalPages = lengthOfRes / 16;
    } else {
      totalPages = Math.round(lengthOfRes / 16);
    }
    results = paginate(results, 16, currentPage);
    renderTemplate(res, req, "lists/top.ejs", {
      featuredBots: results,
      numberOfPages: totalPages
    });
  });

  app.get("/search", async (req, res) => {
    var currentPage = req.query.page || "1";
    if (isNaN(parseInt(currentPage))) {
      currentPage = 1;
    } else {
      currentPage = parseInt(currentPage);
    }

    const queryName = req.query.name;
    if (!queryName) return res.redirect("/");

    const query = new RegExp(queryName, "i");
    var results = await Bots.find({ name: query, approved: true }).sort([
      ["upvotes", "descending"]
    ]);
    const lengthOfRes = results.length;
    var totalPages;
    if (Math.round(lengthOfRes / 16) === lengthOfRes / 16) {
      totalPages = lengthOfRes / 16;
    } else {
      totalPages = Math.round(lengthOfRes / 16);
    }

    results = paginate(results, 16, currentPage);
    renderTemplate(res, req, "search.ejs", {
      featuredBots: results,
      numberOfPages: totalPages,
      searchedName: queryName
    });
  });

  app.get("/list/new", async (req, res) => {
    var currentPage = req.query.page || "1";
    if (isNaN(parseInt(currentPage))) {
      currentPage = 1;
    } else {
      currentPage = parseInt(currentPage);
    }

    let results = await Bots.find({ approved: true }).sort({ _id: -1 });
    const lengthOfRes = results.length;
    var totalPages;
    if (Math.round(lengthOfRes / 16) === lengthOfRes / 16) {
      totalPages = lengthOfRes / 16;
    } else {
      totalPages = Math.round(lengthOfRes / 16);
    }
    results = paginate(results, 16, currentPage);

    renderTemplate(res, req, "lists/new.ejs", {
      featuredBots: results,
      numberOfPages: totalPages
    });
  });

  app.get("/leaderboard", async (req, res) => {
    var currentPage = req.query.page || "1";
    if (isNaN(parseInt(currentPage))) {
      currentPage = 1;
    } else {
      currentPage = parseInt(currentPage);
    }
    let tags = [];
    let usernames = [];
    let pfps = [];
    let results = await Profiles.find().sort({ karma: -1 });
    results = results.filter(res => res.totalKarma > 0);

    const lengthOfRes = results.length;
    var totalPages;
    if (Math.round(lengthOfRes / 16) === lengthOfRes / 16) {
      totalPages = lengthOfRes / 16;
    } else {
      totalPages = Math.round(lengthOfRes / 16);
    }
    results = paginate(results, 16, currentPage);
    for (var i = 0; i < results.length; i++) {
      var theuser = await client.users.get(results[i].id);
      if (theuser) {
        tags.push(theuser.tag);
        usernames.push(theuser.username);
        pfps.push(theuser.displayAvatarURL({ size: 128 }));
      } else {
        tags.push("Unknown#0000");
        usernames.push("Deleted user");
        pfps.push(
          "https://discordapp.com/assets/dd4dbc0016779df1378e7812eabaa04d.png",
        );
      }
    }
    renderTemplate(res, req, "leaderboard.ejs", {
      BestDevs: results,
      pfps,
      tags,
      usernames,
      numberOfPages: totalPages,
      currentPage
    });
  });

  app.get("/tag/:name", async (req, res) => {
    var currentPage = req.query.page || "1";
    if (isNaN(parseInt(currentPage))) {
      currentPage = 1;
    } else {
      currentPage = parseInt(currentPage);
    }

    let results = await Bots.find({ approved: true }).sort([
      ["upvotes", "descending"]
    ]);
    results = results.filter(bot => bot.tags.includes(req.params.name));
    const lengthOfRes = results.length;
    var totalPages;
    if (Math.round(lengthOfRes / 16) === lengthOfRes / 16) {
      totalPages = lengthOfRes / 16;
    } else {
      totalPages = Math.round(lengthOfRes / 16);
    }
    results = paginate(results, 16, currentPage);
    renderTemplate(res, req, "tags.ejs", {
      tag: req.params.name,
      featuredBots: results,
      numberOfPages: totalPages
    });
  });

  app.get("/bot/new", checkAuth, (req, res) => {
    renderTemplate(res, req, "bot/new.ejs", { sucess: null, fail: null });
  });

  app.post("/bot/new", checkAuth, async (req, res) => {
    var bodyData = {
      clientID: req.body.clientID,
      library: req.body.library,
      prefix: req.body.prefix,
      shortDesc: req.body.shortDesc,
      longDesc: req.body.longdesc,
      supportServer: `https://discord.gg/${req.body.supportServer}`,
      tags: req.body.tags,
      supportServerCode: req.body.supportServer,
      otherOwners: req.body.otherOwners,
      inviteURL: req.body.inviteURL,
      github: req.body.github,
      website: req.body.website
    };
    if (typeof bodyData.tags === "string") bodyData.tags = [bodyData.tags];

    const validBot = await validateBotForID(bodyData.clientID);
    if (validBot === false)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail: "Invalid ClientID or provided ClientID was not a bot."
      });
    const isBot = await Bots.findOne({ id: bodyData.clientID });
    if (isBot)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail:
          "This bot is already on the website listing or in the verification queue."
      });
    if (bodyData.shortDesc.length < 30)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail: "Short description must be at least 30 characters long."
      });
    if (bodyData.shortDesc.length > 84)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail: "Short description can have 80 characters at maximum."
      });
    if (bodyData.longDesc.length < 250)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail: "Long description must be at least 250 characters long."
      });
    if (bodyData.tags.lengh > 3)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail: "You can add maximum 3 tags to your bot."
      });
    const invDetails = await fetchInviteURL(bodyData.supportServer);
    if (invDetails.valid === false)
      return renderTemplate(res, req, "bot/new.ejs", {
        sucess: null,
        fail: "Invalid invite code provided."
      });

    let self = await client.users.fetch(bodyData.clientID);

    const newBot = new Bots({
      id: bodyData.clientID,
      mainOwner: req.user.id,
      name: self.username,
      owners:
        bodyData.otherOwners.split(", ")[0] !== ""
          ? bodyData.otherOwners.split(", ")
          : [],
      library: bodyData.library,
      upvotes: 0,
      totalVotes: 0,
      website: bodyData.website || "none",
      votes: [],
      rates: [],
      github: bodyData.github || "none",
      shortDesc: bodyData.shortDesc,
      longDesc: bodyData.longDesc,
      server: bodyData.supportServer,
      prefix: bodyData.prefix,
      verified: false,
      trusted: false,
      certified: false,
      vanityUrl: null,
      invite:
        bodyData.inviteURL.indexOf(
          "https://discordapp.com/api/oauth2/authorize"
        ) !== 0
          ? `https://discordapp.com/api/oauth2/authorize?client_id=${bodyData.clientID}&permissions=0&scope=bot`
          : bodyData.inviteURL,
      featured: null,
      tags: bodyData.tags,
      token: null,
      shardID: 0,
      serverCount: 0,
      shardCount: 0,
      approved: false,
      createdAt: Date.now()
    });

    await newBot.save().catch(e => console.log(e));

    client.channels
      .get(client.config.channels.botAddLogsChannel)
      .send(`<@${req.user.id}> added <@${bodyData.clientID}>.`);
    const embed = new Discord.MessageEmbed()
      .setTitle("New Bot Added")
      .setDescription(
        `**Bot**: ${self.tag} (ID: ${bodyData.clientID})\n**Owner**: ${
          req.user.username
        }#${req.user.discriminator} (ID: ${req.user.id})\n**Prefix**: \`${
          bodyData.prefix
        }\`\n**Sort Desc**: ${
          bodyData.shortDesc
        }\n**Tags**: ${bodyData.tags.join(", ")}\n**Library**: ${
          bodyData.library
        }\n**Website**: ${
          bodyData.website.length < 1 ? "No Website" : bodyData.website
        }\n**GitHub**: ${
          bodyData.github.length < 1 ? "No GitHub" : bodyData.github
        }\n**Support Server**: ${bodyData.supportServer}\n**Other Owners**: ${
          bodyData.otherOwners.split(", ")[0] !== ""
            ? bodyData.otherOwners.split(", ").join(", ")
            : "No Other Owners"
        }\n**Invite**: ${
          bodyData.inviteURL.indexOf(
            "https://discordapp.com/api/oauth2/authorize"
          ) !== 0
            ? `https://discordapp.com/api/oauth2/authorize?client_id=${bodyData.clientID}&permissions=0&scope=bot`
            : `${bodyData.inviteURL}`
        }`
      )
      .setColor("BLUE");
    client.channels.get(client.config.channels.botAddAuditChannel).send(embed);
    renderTemplate(res, req, "bot/new.ejs", {
      sucess: "The bot has been successfully added in to queue.",
      fail: null
    });
  });

  app.get("/bot/:id", async (req, res) => {
    var Botsdata = await Bots.findOne({ vanityUrl: req.params.id });
    if (!Botsdata) Botsdata = await Bots.findOne({ id: req.params.id });
    if (!Botsdata) return res.redirect("/");
    if (Botsdata.approved !== true && req.session.permLevel < 1)
      return res.redirect("/");
    var fail = null;
    if (Botsdata.approved !== true) {
      fail =
        "<strong>WARNING:</strong> This page is not visible to the public, this bot is not approved yet.";
    }
    renderTemplate(res, req, "bot/page.ejs", {
      thebot: Botsdata,
      alertSuccess: null,
      alertFail: fail,
      md
    });
  });

  app.post("/bot/:id", checkAuth, async (req, res) => {
    var Botsdata = await Bots.findOne({ vanityUrl: req.params.id });
    if (!Botsdata) Botsdata = await Bots.findOne({ id: req.params.id });
    if (Botsdata.approved === false) return res.redirect("/");
    if (!Botsdata) return res.redirect("/");

    if (!req.body.reason)
      return renderTemplate(res, req, "bot/page.ejs", {
        thebot: Botsdata,
        alertSuccess: null,
        alertFail:
          "Hmm, looks like something went wrong, please make sure you are logged in then try again.",
        md
      });
    const bot = await client.users.fetch(Botsdata.id);
    const botOwner = await client.users.fetch(Botsdata.mainOwner);

    const embed = new Discord.MessageEmbed()
      .setTitle("Bot Report")
      .setDescription(
        `**User**: ${req.user.username}#${req.user.discriminator} (ID: ${req.user.id})\n**Bot**: ${bot.tag} (ID: ${bot.id})\n**Bot Owner**: ${botOwner.tag} (ID: ${botOwner.id})\n**Reason**: ${req.body.reason}`
      )
      .setColor("BLUE")
      .setTimestamp();
    client.channels.get(client.config.botReportsAuditChannel).send(embed);
    renderTemplate(res, req, "bot/page.ejs", {
      thebot: Botsdata,
      alertSuccess:
        "Your report has been submited to our moderation team, we will review it as soon as possible.",
      alertFail: null,
      md
    });
  });

  app.get("/bot/:id/delete", checkAuth, async (req, res) => {
    var Bot = await Bots.findOne({ vanityUrl: req.params.id });
    if (!Bot) Bot = await Bots.findOne({ id: req.params.id });
    if (!Bot) return res.redirect("/");
    if (req.user.id !== Bot.mainOwner && req.session.permLevel < 1)
      return res.redirect("/");
    renderTemplate(res, req, "bot/delete.ejs", { theBot: Bot, md });
  });

  app.post("/bot/:id/delete", checkAuth, async (req, res) => {
    const name = req.body.name || "";
    const conset = req.body.consent || "no";
    var Bot = await Bots.findOne({ vanityUrl: req.params.id });
    if (!Bot) Bot = await Bots.findOne({ id: req.params.id });
    if (!Bot) return res.redirect("/");
    if (req.user.id !== Bot.mainOwner && req.session.permLevel < 1)
      return res.redirect("/");
    if (name.toLowerCase() !== Bot.name.toLowerCase()) return res.redirect("/");
    if (conset !== "on") return res.redirect("/");
    var allOwners = Bot.owners;
    allOwners.unshift(Bot.mainOwner);
    allOwners = allOwners.map(u => `<@${u}>`);

    for (const owner of allOwners) {
      const theOwner = client.guilds
        .get(client.config.baseGuildId)
        .members.get(owner);
      if (theOwner) {
        var allBots = await Bots.find();
        allBots.filter(b => b.mainOwner === owner || b.owners.includes(owner));
        if (allBots.length > 1) return;
        if (theOwner.roles.has(client.config.developerRole))
          theOwner.roles.remove(
            client.guilds
              .get(client.config.baseGuildId)
              .roles.get(client.config.developerRole)
          );
      }
    }
    if (Bot.vanityUrl === req.params.id) {
      await Bots.findOneAndDelete({ vanityUrl: req.params.id }).catch(e =>
        console.log(e)
      );
    } else {
      await Bots.findOneAndDelete({ id: req.params.id }).catch(e =>
        console.log(e)
      );
    }
    client.channels
      .get(client.config.channels.botDeleteLogsChannel)
      .send(
        `<@${req.user.id}> Deleted \`${Bot.name}\` ID \`${Bot.id}\` <@${Bot.id}>.`
      );
    client.guilds
      .get(client.config.baseGuildId)
      .members.get(Bot.id)
      .kick(`Bot deleted from the list.`);
    return res.redirect("/");
  });

  app.get("/bot/:id/edit", checkAuth, async (req, res) => {
    var Bot = await Bots.findOne({ vanityUrl: req.params.id });
    if (!Bot) Bot = await Bots.findOne({ id: req.params.id });
    if (!Bot) return res.redirect("/");

    if (
      req.user.id === Bot.mainOwner ||
      Bot.owners.includes(req.user.id) ||
      req.session.permLevel > 0
    ) {
      renderTemplate(res, req, "bot/edit.ejs", {
        theBot: Bot,
        sucess: null,
        fail: null,
        md
      });
    } else {
      res.redirect(`/bot/${Bot.id}`);
    }
  });

  app.post("/bot/:id/edit", checkAuth, async (req, res) => {
    var Bot = await Bots.findOne({ vanityUrl: req.params.id });
    if (!Bot) Bot = await Bots.findOne({ id: req.params.id });
    if (!Bot) return res.redirect("/");
    if (
      req.user.id === Bot.mainOwner ||
      Bot.owners.includes(req.user.id) ||
      req.session.permLevel > 0
    ) {
      const bodyData = {
        clientID: req.body.clientID,
        library: req.body.library,
        prefix: req.body.prefix,
        shortDesc: req.body.shortDesc,
        longDesc: req.body.longdesc,
        supportServer: `https://discord.gg/${req.body.supportServer}`,
        tags: req.body.tags,
        supportServerCode: req.body.supportServer,
        otherOwners: req.body.otherOwners,
        mainOwner: req.body.mainOwner,
        inviteURL: req.body.inviteURL,
        github: req.body.github,
        website: req.body.website
      };

      const validBot = await validateBotForID(bodyData.clientID);
      if (validBot === false)
        return renderTemplate(res, req, "bot/edit.ejs", {
          theBot: Bot,
          sucess: null,
          fail: "Invalid ClientID/provided ClientID was not a bot.",
          md
        });
      if (bodyData.shortDesc.length < 30)
        return renderTemplate(res, req, "bot/edit.ejs", {
          theBot: Bot,
          sucess: null,
          fail: "Short description must be at least 30 characters long.",
          md
        });
      if (bodyData.shortDesc.length > 84)
        return renderTemplate(res, req, "bot/edit.ejs", {
          theBot: Bot,
          sucess: null,
          fail: "Short description can have 80 characters at maximum.",
          md
        });
      if (bodyData.longDesc.length < 250)
        return renderTemplate(res, req, "bot/edit.ejs", {
          theBot: Bot,
          sucess: null,
          fail: "Long description must be at least 250 characters long.",
          md
        });
      if (bodyData.tags.lengh > 3)
        return renderTemplate(res, req, "bot/edit.ejs", {
          sucess: null,
          fail: "You can add at maximum 3 tags to your bot.",
          md
        });
      const invDetails = await fetchInviteURL(bodyData.supportServer);
      if (invDetails.valid === false)
        return renderTemplate(res, req, "bot/edit.ejs", {
          theBot: Bot,
          sucess: null,
          fail: "Invalid invite code provided.",
          md
        });

      let self = await client.users.fetch(bodyData.clientID);

      if (Bot.vanityUrl === req.params.id) {
        Bots.findOne({ vanityUrl: req.params.id }, async (err, entry) => {
          entry.name = self.username;
          entry.owners =
            bodyData.otherOwners.split(", ")[0] !== ""
              ? bodyData.otherOwners.split(", ")
              : [];
          entry.mainOwner = bodyData.mainOwner;
          entry.library = bodyData.library;
          entry.website = bodyData.website || "none";
          entry.github = bodyData.github || "none";
          entry.shortDesc = bodyData.shortDesc;
          entry.longDesc = bodyData.longDesc;
          entry.server = bodyData.supportServer;
          entry.prefix = bodyData.prefix;
          entry.invite =
            bodyData.inviteURL.indexOf(
              "https://discordapp.com/api/oauth2/authorize"
            ) !== 0
              ? `https://discordapp.com/api/oauth2/authorize?client_id=${bodyData.clientID}&permissions=0&scope=bot`
              : bodyData.inviteURL;
          entry.tags = bodyData.tags;

          await entry.save().catch(e => console.log(e));
        });
      } else {
        Bots.findOne({ id: req.params.id }, async (err, entry) => {
          entry.name = self.username;
          entry.owners =
            bodyData.otherOwners.split(", ")[0] !== ""
              ? bodyData.otherOwners.split(", ")
              : [];
          entry.mainOwner = bodyData.mainOwner;
          entry.library = bodyData.library;
          entry.website = bodyData.website || "none";
          entry.github = bodyData.github || "none";
          entry.shortDesc = bodyData.shortDesc;
          entry.longDesc = bodyData.longDesc;
          entry.server = bodyData.supportServer;
          entry.prefix = bodyData.prefix;
          entry.invite =
            bodyData.inviteURL.indexOf(
              "https://discordapp.com/api/oauth2/authorize"
            ) !== 0
              ? `https://discordapp.com/api/oauth2/authorize?client_id=${bodyData.clientID}&permissions=0&scope=bot`
              : bodyData.inviteURL;
          entry.tags = bodyData.tags;

          await entry.save().catch(e => console.log(e));
        });

        client.channels
          .get(client.config.botEditLogsChannel)
          .send(`<@${req.user.id}> edited <@${Bot.id}>.`);
        res.redirect("/bot/" + Bot.id);
      }
    } else {
      res.redirect("/");
    }
  });

  app.get("/bot/:id/vote", checkAuth, async (req, res) => {
    var But = await Bots.findOne({ vanityUrl: req.params.id });
    if (!But) But = await Bots.findOne({ id: req.params.id });
    if (!But) return res.redirect("/");

    Bots.findOne({ id: But.id }, async (err, Bot) => {
      if (err) console.log(err);
      var user = await Profiles.findOne({ id: Bot.mainOwner });
      const uVoteIndex = Bot.votes.findIndex(u => u.id === req.user.id);
      if (uVoteIndex > -1) {
        if (Date.now() - Bot.votes[uVoteIndex].timestamp < 43200000)
          return renderTemplate(res, req, "bot/page.ejs", {
            thebot: Bot,
            alertSuccess: null,
            alertFail: `You have aleady voted for this bot. Try again in ${msToHMS(
              43200000 - (Date.now() - Bot.votes[uVoteIndex].timestamp)
            )}.`,
            md
          });
        Bot.votes.splice(uVoteIndex, 1);
      }

      const voteObj = {
        timestamp: Date.now(),
        id: req.user.id
      };

      Bot.upvotes = Bot.upvotes + 1;
      Bot.totalVotes = Bot.totalVotes + 1;
      user.karma = user.karma + 1;
      user.totalKarma = user.totalKarma + 1;
      Bot.votes.push(voteObj);
      await Bot.save().catch(e => console.log(e));
      await user.save().catch(e => console.log(e));
      renderTemplate(res, req, "bot/page.ejs", {
        thebot: Bot,
        alertSuccess: "Your vote has been counted.",
        alertFail: null,
        md
      });
    });
  });

  app.get("/bot/:id/rate", checkAuth, async (req, res) => {
    var But = await Bots.findOne({ vanityUrl: req.params.id });
    if (!But) But = await Bots.findOne({ id: req.params.id });
    if (!But) return res.redirect("/");
    req.query.stars = parseInt(req.query.stars);
    if (
      req.query.stars !== 1 &&
      req.query.stars !== 2 &&
      req.query.stars !== 3 &&
      req.query.stars !== 4 &&
      req.query.stars !== 5
    )
      return res.redirect("/bot/" + req.params.id);

    Bots.findOne({ id: But.id }, async (err, Bot) => {
      if (err) console.log(err);

      const urateIndex = Bot.rates.findIndex(u => u.id === req.user.id);
      if (urateIndex > -1) {
        Bot.rates.splice(urateIndex, 1);
      }
      const rateObj = {
        rate: req.query.stars,
        id: req.user.id
      };
      Bot.rates.push(rateObj);
      await Bot.save().catch(e => console.log(e));
      renderTemplate(res, req, "bot/page.ejs", {
        thebot: Bot,
        alertSuccess: "Your rating has been counted.",
        alertFail: null,
        md
      });
    });
  });
  
  app.get("/staff", checkAuth, async (req, res) => {
    // const guild = client.guilds.get(""); // TO ADD
    // const member = guild.members.get(req.user.id);
    // if (!member) return res.redirect("/");
    // if (!member.roles.has("")) return res.redirect("/"); // TO ADD
   
    var theBots = await Bots.find();
    renderTemplate(res, req, "staff/main.ejs", { bots: theBots });
  });

  app.get("/staff/:botID", checkAuth, async (req, res) => {
      // const guild = client.guilds.get(""); // TO ADD
      // const member = guild.members.get(req.user.id);
      // if (!member) return res.redirect("/");
      // if (!member.roles.has("")) return res.redirect("/"); // TO ADD
      const thebot = client.users.get(req.params.botID);
      if (!thebot || !thebot.bot) return res.redirect("/staff");

      var theBot = await Bots.find({ id: thebot.id });
      if (!theBot) res.redirect("/staff");
      renderTemplate(res, req, "staff/edit.ejs", { db: theBot, botClient: thebot });
  });

  app.post("/staff/:botID", checkAuth, async (req, res) => {
    const approved = req.body.approved;
    const featured = req.body.featured;
    const trusted = req.body.trust;
    const vanity = req.body.vanity;
  
    const daBot = await Bots.findOne({ id: req.params.botID });
    daBot.approved = approved == "on" ? true : false;
    daBot.featured = featured == "on" ? true : false;
    daBot.trusted = trusted == "on" ? true : false;
    daBot.vanityUrl = vanity && typeof vanity == "string" ? vanity : null;

    await daBot.save().catch(e => {});
    res.redirect("/staff");
  });
  
  app.get("/privacy", (req, res) => {
    renderTemplate(res, req, "formalities/privacy.ejs");
  });

  app.get("/terms", (req, res) => {
    renderTemplate(res, req, "formalities/terms.ejs");
  });

  app.get("/license", (req, res) => {
    renderTemplate(res, req, "formalities/license.ejs");
  });

  app.get("*", (req, res) => renderTemplate(res, req, "404.ejs"));
  app.post("*", (req, res) => renderTemplate(res, req, "404.ejs"));

  client.site = app.listen(client.config.dashboard.port, null, null, () =>
    console.log("Discord Palace Bot List is up and running.")
  );
};

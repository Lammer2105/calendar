const data = require("sqlite-sync");
data.connect("database/calendar.db");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const bot = new TelegramBot(process.env.DB_WORKER, { polling: true });
var adminPanelMenu = [
  [{ text: "« Admin panel »", callback_data: "supermoderator" }],
];
var fs = require("fs");
var done_keyboard = [
  [
    {
      text: "☑️ Done",
      callback_data: "done",
    },
  ],
];
var malling = {};
var ignore = {};
var media_group = {};
module.exports = {
  adminPanelMenu: adminPanelMenu,
  malling: sendAnyMessage,
  getFiles: getFiles,
  register: (input, mainBot) => {
    try {
      if (input.data) {
        mainBot.editMessageText(
          data.run('select * from phrases where keyword = "registration"')[0]
            .content,
          {
            message_id: input.message.message_id,
            chat_id: input.message.chat.id,
            reply_markup: { inline_keyboard: eduprogskeyboard() },
          }
        );
        input = input.message;
      } else
        mainBot.sendMessage(
          input.chat.id,
          data.run('select * from phrases where keyword = "registration"')[0]
            .content,
          {
            reply_markup: { inline_keyboard: eduprogskeyboard() },
            parse_mode: "HTML",
          }
        );
      data.insert("users", {
        user_id: input.chat.id,
        username: input.chat.username,
        first_name: input.chat.first_name,
      });
    } catch (error) {}
  },
  adminPanel: function adminPanel(input, mainBot) {
    var users = data.run("select * from users");
    var chatId = input.data ? input.message.chat.id : input.chat.id;
    var current_admin = data.run(
      "select * from admins where rank not null and rank <> 'moderator' and chat_id = ?",
      [chatId]
    );
    if (current_admin.length) {
      if (!input.data) {
        if (chatId in malling) {
          if (input.text && parseInt(input.text) % 1 === 0) {
            if (
              data.run(
                "select count(*) as cnt from ignorelist where user_id = ?",
                [parseInt(input.text)]
              )[0].cnt > 0 ||
              !(
                data.run(
                  "select count(*) as cnt from users where user_id = ?",
                  [parseInt(input.text)]
                )[0].cnt > 0 ||
                malling[chatId].chats.indexOf(parseInt(input.text)) >= 0
              )
            ) {
              malling[chatId].text =
                malling[chatId].text + "\n<s>" + input.text + "</s> ";
            } else {
              malling[chatId].chats.push(parseInt(input.text));
              malling[chatId].text =
                malling[chatId].text + "\n➕ " + input.text + " ";
            }
            mainBot.editMessageText(malling[chatId].text, {
              message_id: malling[chatId].message_id,
              chat_id: chatId,
              reply_markup: {
                inline_keyboard: malling[chatId].keyboard,
              },
              parse_mode: "HTML",
            });
            mainBot.deleteMessage(input.chat.id, input.message_id);
            return;
          }
          if (input.text && input.text === "all") {
            for (let i = 0; i < users.length; i++) {
              const user = users[i];
              if (
                malling[chatId].chats.indexOf(user.user_id) != -1 ||
                data.run(
                  "select count(*) as cnt from ignorelist where user_id = ?",
                  [user.user_id]
                )[0].cnt > 0
              )
                continue;
              malling[chatId].chats.push(user.user_id);
            }
            mainBot.deleteMessage(input.chat.id, input.message_id);
            malling[chatId].text = malling[chatId].text + "\nAdded all users";
            mainBot.editMessageText(malling[chatId].text, {
              message_id: malling[chatId].message_id,
              chat_id: chatId,
              reply_markup: {
                inline_keyboard: malling[chatId].keyboard,
              },
              parse_mode: "HTML",
            });
            console.log(malling[chatId].chats);
            return;
          }
          malling[chatId].text = malling[chatId].text + "\n---\n";
          mallingFunction(input, chatId, mainBot);
          return;
        }
        if (chatId in ignore && input.text && parseInt(input.text) % 1 === 0) {
          mainBot.deleteMessage(chatId, input.message_id);
          if (ignore[chatId].adding) {
            data.insert(
              "ignorelist",
              { user_id: parseInt(input.text) },
              (callback) => {
                if (callback.error) {
                  ignore[chatId].text =
                    ignore[chatId].text + "\n❌ " + input.text;
                } else {
                  ignore[chatId].text =
                    ignore[chatId].text + "\n➕ " + input.text;
                }
                mainBot.editMessageText(ignore[chatId].text, {
                  message_id: ignore[chatId].message_id,
                  chat_id: chatId,
                  reply_markup: {
                    inline_keyboard: ignore[chatId].keyboard,
                  },
                });
              }
            );
            return;
          }
          if (ignore[chatId].removing) {
            data.delete(
              "ignorelist",
              { user_id: parseInt(input.text) },
              (callback) => {
                if (callback.error) {
                  ignore[chatId].text =
                    ignore[chatId].text + "\n❌ " + input.text;
                } else {
                  ignore[chatId].text =
                    ignore[chatId].text + "\n➖ " + input.text;
                }
                mainBot.editMessageText(ignore[chatId].text, {
                  message_id: ignore[chatId].message_id,
                  chat_id: chatId,
                  reply_markup: {
                    inline_keyboard: ignore[chatId].keyboard,
                  },
                });
              }
            );
            return;
          }
        }
        if (current_admin[0].rank == "god" && input.text) {
          // search by users
          let user = [];
          var text = "";
          if (parseInt(input.text) % 1 === 0) {
            user = data.run("select * from users where user_id = ?", [
              parseInt(input.text),
            ]);
          } else if (input.text.indexOf("@") != -1) {
            let username = input.text.slice(
              input.text.indexOf("@") + 1,
              input.text.length
            );
            user = data.run("select * from users where user_username like ?", [
              username,
            ]);
          } else {
            user = data.run("select * from users where first_name like ?", [
              input.text,
            ]);
          }
          if (user.length) {
            mainBot.deleteMessage(chatId, input.message_id);
            user.forEach((user_element) => {
              text +=
                '<a href="tg://user?id=' +
                (user_element.user_id
                  ? user_element.user_id
                  : user_element.chat_id) +
                '">' +
                user_element.first_name +
                "</a> " +
                (user_element.user_id
                  ? user_element.user_id
                  : user_element.chat_id) +
                "\n";
            });
            mainBot.sendMessage(chatId, text, { parse_mode: "HTML" });
          }
          return;
        }
      }
      if (input.data) {
        if (input.data == "supermoderator") {
          var text = "Admin panel";
          mainBot.editMessageText(
            text +
              "\n" +
              (current_admin[0].rank == "god" ? process.env.PASSWORD : ""),
            {
              chat_id: chatId,
              parse_mode: "HTML",
              message_id: input.message.message_id,
              reply_markup: { inline_keyboard: keyboardForSuperadmin() },
            }
          );
          return;
        }

        if (input.data.indexOf("&") != -1) {
          let query = input.data.slice(0, input.data.indexOf("&"));
          users = data.run(`select * from ${query}`);
          let page = parseInt(
            input.data.slice(input.data.indexOf("&") + 1, input.data.length)
          );
          let users_count = users.length;
          users = data.run(`select * from ${query} limit ${page * 50}, 50`);
          var text = users_count + ` ${query}\n`;
          var row = 0;
          var keyboard = [[]];
          for (let i = 0; i < users.length; i++) {
            const user = users[i];
            text +=
              '<a href="tg://user?id=' +
              (user.user_id ? user.user_id : user.chat_id) +
              '">' +
              (query == "admins" || query == "blockedusers"
                ? user.first_name
                : data.run("select first_name from users where user_id = ?", [
                    user.user_id,
                  ])[0].first_name) +
              "</a> " +
              (user.user_id ? user.user_id : user.chat_id) +
              (query == "admins" ? " " + user.rank : "") +
              "\n";
            if (current_admin[0].rank === "god" && query == "admins") {
              if (user.rank === "god") continue;
              if ((i - 1) % 2 == 0) {
                row++;
                keyboard.push([]);
              }
              keyboard[row].push({
                text: user.first_name,
                callback_data: user.chat_id,
              });
            }
          }
          if (page > 0) {
            keyboard[0].push({
              text: "⏮",
              callback_data: query + "&0",
            });
            keyboard[0].push({
              text: "⏪",
              callback_data: query + "&" + (page - 1),
            });
          }
          if (page < parseInt(users_count / 50)) {
            keyboard[0].push({
              text: "⏩",
              callback_data: query + "&" + (page + 1),
            });
            keyboard[0].push({
              text: "⏭",
              callback_data: query + "&" + parseInt(users_count / 50),
            });
          }
          if (query == "users") {
            keyboard.push([]);
            if (data.run("select count(*) as cnt from ignorelist")[0].cnt > 0) {
              keyboard[1].push({
                text: "📃 Ignore list",
                callback_data: "ignorelist&0",
              });
            }
            keyboard[1].push({ text: "📩 Malling", callback_data: "malling" });
            keyboard.push([]);
            keyboard[2].push({
              text: "➕ Add user to ignore list",
              callback_data: "ignore%add",
            });
          }
          if (
            query == "ignorelist" &&
            data.run("select count(*) as cnt from ignorelist")[0].cnt > 0
          )
            keyboard.push([
              {
                text: "🧑‍💻 Users",
                callback_data: "users&0",
              },
              {
                text: "➖ Remove user from list",
                callback_data: "ignore%remove",
              },
            ]);
          keyboard.push(adminPanelMenu[0]);
          mainBot.editMessageText(text, {
            chat_id: chatId,
            parse_mode: "HTML",
            message_id: input.message.message_id,
            reply_markup: {
              inline_keyboard: keyboard,
            },
          });
          return;
        }
        if (input.data.indexOf("%") != -1) {
          var before_dot = input.data.slice(0, input.data.indexOf("%"));
          var after_dot = input.data.slice(
            input.data.indexOf("%") + 1,
            input.data.length
          );
          if (after_dot == "add") {
            ignore[chatId] = { adding: true };
            mainBot
              .sendMessage(
                chatId,
                "Send user id (adding users to ignorelist)",
                {
                  reply_markup: {
                    inline_keyboard: done_keyboard,
                  },
                }
              )
              .then((onfulfilled) => {
                ignore[chatId].message_id = onfulfilled.message_id;
                ignore[chatId].text = onfulfilled.text;
                ignore[chatId].keyboard =
                  onfulfilled.reply_markup.inline_keyboard;
              });
          }
          if (after_dot == "remove") {
            ignore[chatId] = { removing: true };
            ignore[chatId].parent_message_id = input.message.message_id;
            mainBot
              .sendMessage(
                chatId,
                "Send user id (removing users from ignorelist)",
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: "🗑 Remove all users",
                          callback_data: "ignore%removeall",
                        },
                        done_keyboard[0][0],
                      ],
                    ],
                  },
                }
              )
              .then((onfulfilled) => {
                ignore[chatId].message_id = onfulfilled.message_id;
                ignore[chatId].text = onfulfilled.text;
                ignore[chatId].keyboard =
                  onfulfilled.reply_markup.inline_keyboard;
              });
          }
          if (after_dot == "removeall") {
            mainBot.deleteMessage(chatId, input.message.message_id);
            data.run("select * from ignorelist").forEach((ignoreuser) => {
              data.delete("ignorelist", { user_id: ignoreuser.user_id });
            });
            mainBot.editMessageText("All users deleted from ignorelist", {
              chat_id: chatId,
              parse_mode: "HTML",
              message_id: ignore[chatId].parent_message_id,
              reply_markup: {
                inline_keyboard: adminPanelMenu,
              },
            });
            delete ignore[chatId];
          }
          return;
        }

        if (input.data == "malling") {
          malling[chatId] = { chats: [] };
          mainBot
            .sendMessage(
              chatId,
              "Send chatId, or all, if you want send message to all users",
              {
                reply_markup: {
                  inline_keyboard: done_keyboard,
                },
                parse_mode: "HTML",
              }
            )
            .then((onfulfilled) => {
              malling[chatId].message_id = onfulfilled.message_id;
              malling[chatId].text = onfulfilled.text;
              malling[chatId].keyboard =
                onfulfilled.reply_markup.inline_keyboard;
              malling[chatId].iterator = 0;
              malling[chatId].ms = 300;
            });
          return;
        }

        if (input.data == "done") {
          var keyboard = [[]];
          var mode = {};
          if (chatId in malling) {
            keyboard = [[{ text: "📩 Malling", callback_data: "malling" }]];
            malling[chatId].text += "\n/start";
            mode = malling;
          }
          if (chatId in ignore) {
            if (ignore[chatId].adding)
              keyboard = [
                [
                  {
                    text: "➕ Add user to ignore list",
                    callback_data: "ignore%add",
                  },
                ],
              ];
            if (ignore[chatId].removing)
              keyboard = [
                [
                  {
                    text: "➖ Remove user from list",
                    callback_data: "ignore%remove",
                  },
                ],
              ];
            ignore[chatId].text += "\n/start";
            mode = ignore;
          }
          mainBot.editMessageText(mode[chatId].text, {
            chat_id: chatId,
            parse_mode: "HTML",
            message_id: input.message.message_id,
            reply_markup: {
              inline_keyboard: keyboard,
            },
          });
          delete malling[chatId];
          delete ignore[chatId];
          return;
        }

        if (input.data == "statistics") {
          var text = "";
          var eduprogs_statistics = data.run(
            "select eduprogs.name, number_of_visits from statistics inner join eduprogs on statistics.name = eduprogs.query"
          );
          var keyboard_statistics = data.run(
            "select * from statistics inner join menu_keyboard on statistics.name = menu_keyboard.callback_data"
          );
          for (let i = 0; i < eduprogs_statistics.length; i++) {
            const eduprog = eduprogs_statistics[i];
            text += eduprog.name + " " + eduprog.number_of_visits + "\n";
          }
          for (let i = 0; i < keyboard_statistics.length; i++) {
            const element_keyb = keyboard_statistics[i];
            if (
              element_keyb.callback_data == "ask" ||
              element_keyb.callback_data == "cancel"
            )
              continue;
            text +=
              element_keyb.text + " " + element_keyb.number_of_visits + "\n";
          }
          mainBot.editMessageText(text, {
            parse_mode: "HTML",
            chat_id: chatId,
            message_id: input.message.message_id,
            reply_markup: { inline_keyboard: adminPanelMenu },
          });
          return;
        }

        //! before and after dot input
        var before_dot = input.data.slice(0, input.data.indexOf("."));
        var after_dot = parseInt(
          input.data.slice(input.data.indexOf(".") + 1, input.data.length)
        );
        var admin = data.run(
          `select * from admins where chat_id = ${input.data}`
        );
        if (current_admin[0].rank != "god") return;
        if (admin.length) {
          mainBot.editMessageText(
            "@" +
              admin[0].username +
              " " +
              admin[0].first_name +
              " rank: " +
              admin[0].rank,
            {
              parse_mode: "HTML",
              chat_id: chatId,
              message_id: input.message.message_id,
              reply_markup: {
                inline_keyboard: keyboardForGod(admin[0].chat_id),
              },
            }
          );
          return;
        }
        admin = data.run(
          `select * from admins where chat_id = ${after_dot}`
        )[0];
        if (before_dot === "tonull") {
          var text =
            "@" +
            admin.username +
            " " +
            admin.first_name +
            " rank: null" +
            "\nsucces, null";

          if (admin && admin.rank == null) {
            text =
              "@" +
              admin.username +
              " " +
              admin.first_name +
              " rank: " +
              admin.rank +
              " rank: null" +
              "\nallready null";
          }
          data.update("admins", { rank: null }, { chat_id: after_dot });
          mainBot.editMessageText(text, {
            parse_mode: "HTML",
            chat_id: chatId,
            message_id: input.message.message_id,
            reply_markup: {
              inline_keyboard: keyboardForGod(after_dot),
            },
          });
          return;
        }

        if (before_dot === "tosuper") {
          var text =
            "@" +
            admin.username +
            " " +
            admin.first_name +
            " rank: supermoderator" +
            "\nsucces, to supermoderator";
          if (admin && admin.rank == "supermoderator") {
            text =
              "@" +
              admin.username +
              " " +
              admin.first_name +
              " rank: supermoderator" +
              "\nalready supermoderator";
          }
          data.update(
            "admins",
            { rank: "supermoderator" },
            { chat_id: after_dot }
          );
          mainBot.editMessageText(text, {
            parse_mode: "HTML",
            chat_id: chatId,
            message_id: input.message.message_id,
            reply_markup: {
              inline_keyboard: keyboardForGod(after_dot),
            },
          });
          return;
        }
        if (before_dot === "tomoderator") {
          var text =
            "@" +
            admin.username +
            " " +
            admin.first_name +
            " rank: moderator" +
            "\nsucces, to moderator";
          if (admin && admin.rank == "moderator") {
            text =
              "@" +
              admin.username +
              " " +
              admin.first_name +
              " rank: moderator" +
              "\nallready moderator";
          }
          data.update("admins", { rank: "moderator" }, { chat_id: after_dot });
          mainBot.editMessageText(text, {
            parse_mode: "HTML",
            chat_id: chatId,
            message_id: input.message.message_id,
            reply_markup: {
              inline_keyboard: keyboardForGod(after_dot),
            },
          });
          return;
        }
        if (before_dot == "deleteadmin") {
          var name = data.run("select * from admins where chat_id = ?", [
            after_dot,
          ])[0].first_name;
          data.delete("admins", { chat_id: after_dot });
          mainBot.editMessageText("Admin " + name + " deleted", {
            chat_id: chatId,
            message_id: input.message.message_id,
            reply_markup: {
              inline_keyboard: keyboardForSuperadmin(),
            },
          });
          return;
        }
      }
    }
    return "end";
  },
  addAndDeleteAdminForHimself: (msg, match, mainBot) => {
    if (match[1] === process.env.PASSWORD) {
      if (
        data.run("select count(*) as cnt from admins where chat_id = ?", [
          msg.chat.id,
        ])[0].cnt == 0
      ) {
        data.insert("admins", {
          chat_id: parseInt(msg.chat.id),
          rank: "moderator",
          username: msg.chat.username,
          first_name:
            msg.chat.first_name != null ? msg.chat.first_name : msg.chat.title,
        });
        data
          .run(
            "select * from admins where rank = 'supermoderator' or rank = 'god'"
          )
          .forEach((element) => {
            mainBot.sendMessage(
              element.chat_id,
              'New admin <a href="tg://user?id=' +
                msg.chat.id +
                '">' +
                msg.from.first_name +
                "</a>",
              {
                parse_mode: "HTML",
                reply_markup:
                  element.rank == "god"
                    ? {
                        inline_keyboard: keyboardForGod(msg.chat.id),
                      }
                    : false,
              }
            );
          });
        mainBot.sendMessage(
          msg.chat.id,
          "Чат додано як адміністратор. Для відміни введіть команду /admin delete",
          { parse_mode: "HTML" }
        );
      } else {
        mainBot.sendMessage(
          msg.chat.id,
          "Чат вже додавався раніше. Зверніться до адміністратора для вирішення питання"
        );
      }
    } else if (match[1] === "delete") {
      data.update(
        "admins",
        { rank: null },
        {
          chat_id: parseInt(msg.chat.id),
        }
      );
      mainBot.sendMessage(
        msg.chat.id,
        "Чат видалено зі списку адміністраторів.",
        { parse_mode: "HTML" }
      );
    } else {
      mainBot.sendMessage(msg.chat.id, "Невірний пароль");
    }
  },
  updateStats: function updateStatistics(query) {
    if (
      data.run("select count(*) as cnt from admins where chat_id = ?", [
        query.message.chat.id,
      ])[0].cnt > 0
    )
      return;

    if (
      data.run("select count (*) as cnt from statistics where name = ?", [
        query.data,
      ])[0].cnt == 0
    ) {
      data.insert("statistics", { name: query.data, number_of_visits: 1 });
    } else {
      var number_of_visits = data.run(
        "select number_of_visits from statistics where name = ?",
        [query.data]
      )[0].number_of_visits;
      data.update(
        "statistics",
        { number_of_visits: number_of_visits + 1 },
        { name: query.data }
      );
    }
  },
};
var phrase = {};
var eduprog = {};
var keyb = {};
var input = {};
var editPhrase = {};
var editKeyb = {};

bot.onText(/\/addPhrase/, (msg) => {
  bot.sendMessage(msg.from.id, "ok, send keyword for phrase");
  phrase[msg.from.id] = {};
});
bot.onText(/\/addEdu/, (msg) => {
  bot.sendMessage(msg.from.id, "ok, send name for eduprog ");
  eduprog[msg.from.id] = {};
});
bot.onText(/\/addKeyb/, (msg) => {
  bot.sendMessage(msg.from.id, "ok, send text ");
  keyb[msg.from.id] = {};
});
bot.onText(/\/create_tables/, (msg) => {
  create_tables();
});
bot.onText(/\/cancel/, (msg) => {
  bot.sendMessage(msg.from.id, "cancelled ");
  delete phrase[msg.from.id];
  delete eduprog[msg.from.id];
  delete keyb[msg.from.id];
  delete input[msg.from.id];
  delete editPhrase[msg.from.id];
  delete editKeyb[msg.from.id];
});
function phrases(msg) {
  var phrases = data.run("select * from phrases");
  let keyboard = [[]];
  let row = 0;
  for (let index = 0; index < phrases.length; index++) {
    const element = phrases[index];
    if (index % 2 == 0) {
      row++;
      keyboard.push([]);
    }
    keyboard[row].push({
      text: element.keyword,
      callback_data: element.keyword,
    });
  }
  bot.sendMessage(msg.from.id, "select phrase to manage it /phrases", {
    reply_markup: { inline_keyboard: keyboard },
  });
}
bot.onText(/\/phrases/, (msg) => {
  phrases(msg);
});
bot.onText(/\/keyb/, async (msg) => {
  var keyboards = data.run("select * from menu_keyboard");
  let keyboard = [[]];
  let row = 0;
  for (let index = 0; index < keyboards.length; index++) {
    const element = keyboards[index];
    if (index % 2 == 0) {
      row++;
      keyboard.push([]);
    }
    keyboard[row].push({
      text: element.callback_data,
      callback_data: element.callback_data,
    });
  }
  bot.sendMessage(msg.from.id, JSON.stringify(keyboards), {
    reply_markup: { inline_keyboard: keyboard },
  });
});
bot.onText(/\/eduprogs/, (msg) => {
  var phrases = data.run("select * from eduprogs");
  bot.sendMessage(msg.from.id, JSON.stringify(phrases));
});
bot.onText(/\/queryON/, (msg) => {
  input[msg.from.id] = { polling: true };
  bot.sendMessage(msg.from.id, "query mode on /queryOFF for switch to off");
});
bot.onText(/\/queryOFF/, (msg) => {
  delete input[msg.from.id];
  bot.sendMessage(msg.from.id, "query mode off /queryON for switch to on");
});
bot.on("message", (msg) => {
  var from = msg.from.id;
  if (from in input) {
    bot.sendMessage(from, JSON.stringify(data.run(msg.text)));
    return;
  }
  if (from in phrase) {
    if (!phrase[from].phrase && phrase[from].keyword) {
      data.insert(
        "phrases",
        {
          keyword: phrase[from].keyword,
          content: msg.text,
        },
        (callback) => {
          if (callback.error) {
            bot.sendMessage(from, "error");
            delete phrase[from];
            return;
          }
          bot.sendMessage(from, "succes");
          delete phrase[from];
        }
      );
      return;
    }
    if (!phrase[from].keyword) {
      phrase[from].keyword = msg.text;
      bot.sendMessage(from, "send content");
      return;
    }
  }
  if (from in eduprog) {
    if (!eduprog[from].name) {
      eduprog[from].name = msg.text;
      bot.sendMessage(from, "send short name");
      return;
    }
    if (!eduprog[from].short_name && eduprog[from].name) {
      eduprog[from].short_name = msg.text;
      bot.sendMessage(from, "send query");
      return;
    }
    if (!eduprog[from].query && eduprog[from].short_name) {
      eduprog[from].query = msg.text;
      bot.sendMessage(from, "send spetiality code");
      return;
    }
    if (!eduprog[from].spetiality_code && eduprog[from].query) {
      eduprog[from].spetiality_code = msg.text;
      bot.sendMessage(from, "send content");
      return;
    }
    if (!eduprog[from].content && eduprog[from].spetiality_code) {
      var text = "success /addEdu";
      data.insert(
        "phrases",
        {
          keyword: eduprog[from].query,
          content: msg.text,
        },
        (callback) => {
          if (callback.error) {
            text = text + "error /addPhrase";
          } else text = text + "success /addPhrase";
        }
      );
      data.insert(
        "eduprogs",
        {
          specialty_code: eduprog[from].spetiality_code,
          content: msg.text,
          name: eduprog[from].name,
          short_name: eduprog[from].short_name,
          query: eduprog[from].query,
        },
        (callback) => {
          if (callback.error) {
            text = text + "error /addEdu";
          } else text = text + "success /addEdu";
          delete eduprog[from];
        }
      );
      bot.sendMessage(from, text);
    }
  }
  if (from in editPhrase) {
    data.update(
      "phrases",
      { content: msg.text },
      { keyword: editPhrase[from].keyword },
      (callback) => {
        var text = "success to edit phrase";
        if (callback.error) {
          text = "shit, failed to edit phrase";
        }
        bot.sendMessage(from, text);
        return;
      }
    );
    var eduprogs = data.run("select * from eduprogs");
    eduprogs.forEach((element) => {
      if (editPhrase[from].keyword === element.query) {
        data.update(
          "eduprogs",
          { content: msg.text },
          { query: editPhrase[from].keyword },
          (callback) => {
            var text = "success to update eduprog";
            if (callback.error) {
              text = "shit, failed to update eduprog";
            }
            bot.sendMessage(from, text);
          }
        );
      }
    });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[]] },
      {
        chat_id: msg.chat.id,
        message_id: editPhrase[from].delete_message_id,
      }
    );
    delete editPhrase[from];
    phrases(msg);
    return;
  }
  if (from in editKeyb) {
    data.update(
      "menu_keyboard",
      { text: msg.text },
      { callback_data: editKeyb[from].callback_data },
      (callback) => {
        var text = "success";
        if (callback.error) {
          text = "shit";
        }
        bot.sendMessage(from, text);
        return;
      }
    );
    bot.sendMessage(msg.from.id, "keyboard updated");
    delete editKeyb[from];
  }
  if (from in keyb) {
    if (keyb[from].text && !keyb[from].data) {
      data.insert(
        "menu_keyboard",
        {
          text: keyb[from].text,
          callback_data: msg.text,
        },
        (callback) => {
          var text = "success /addKeyb";
          if (callback.error) {
            text = "shit /addKeyb";
          }
          bot.sendMessage(from, text);
          delete keyb[from];
          return;
        }
      );
    }
    if (!keyb[from].text) {
      keyb[from].text = msg.text;
      bot.sendMessage(from, "ok, send callback_data");
    }
  }
});

bot.on("callback_query", (query) => {
  var phrases = data.run("select * from phrases");
  var keyboards = data.run("select * from menu_keyboard");
  phrases.forEach((element) => {
    if (query.data === element.keyword) {
      bot.sendMessage(query.from.id, element.content, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "delete", callback_data: "delete." + element.keyword },
              { text: "edit", callback_data: "edit." + element.keyword },
            ],
          ],
        },
      });
    }
  });
  keyboards.forEach((element) => {
    if (query.data === element.callback_data) {
      bot.sendMessage(query.from.id, element.text, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "delete keyb",
                callback_data: "deletekeyb." + element.callback_data,
              },
              {
                text: "edit keyb",
                callback_data: "editkeyb." + element.callback_data,
              },
            ],
          ],
        },
      });
    }
  });

  if (query.data.indexOf(".") != -1) {
    var before_dot = query.data.slice(0, query.data.indexOf("."));
    var after_dot = query.data.slice(
      query.data.indexOf(".") + 1,
      query.data.length
    );
    phrases.forEach((element) => {
      if (after_dot === element.keyword) {
        if (before_dot === "delete") {
          bot.editMessageReplyMarkup(
            { inline_keyboard: [[]] },
            {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            }
          );
          data.delete("phrases", { keyword: element.keyword });
          bot.sendMessage(query.from.id, "phrase deleted");
        }
        if (before_dot === "edit") {
          editPhrase[query.from.id] = {
            keyword: element.keyword,
            delete_message_id: query.message.message_id,
          };
          bot.sendMessage(query.from.id, "send new content");
        }
      }
    });
    keyboards.forEach((element) => {
      if (after_dot === element.callback_data) {
        if (before_dot === "deletekeyb") {
          bot.editMessageReplyMarkup(
            { inline_keyboard: [[]] },
            {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            }
          );
          data.delete("menu_keyboard", {
            callback_data: element.callback_data,
          });
          bot.sendMessage(query.from.id, "keyb deleted");
        }
        if (before_dot === "editkeyb") {
          editKeyb[query.from.id] = {
            callback_data: element.callback_data,
            delete_message_id: query.message.message_id,
          };
          bot.sendMessage(query.from.id, "send new text for keyboard");
        }
      }
    });
  }
});

function keyboardForSuperadmin() {
  var keyboard = [
    [
      {
        text: "😎 Admins",
        callback_data: "admins&0",
      },
      {
        text: "🧑‍💻 Users",
        callback_data: "users&0",
      },
    ],
    [
      { text: "📃 Statistics", callback_data: "statistics" },
      {
        text: "🧑Blocked users",
        callback_data: "blockedusers&0",
      },
    ],
    [{ text: "» Main menu «", callback_data: "menu" }],
  ];
  return keyboard;
}

function keyboardForGod(chat_id) {
  var keyboard = [[]];
  let admin = data.run("select * from admins where chat_id = ?", [chat_id]);
  if (admin.length) {
    keyboard = [
      [
        {
          text:
            admin[0].rank == "supermoderator"
              ? "⬇️ To moderator"
              : "⬆️ To supermoderator",
          callback_data:
            admin[0].rank == "supermoderator"
              ? "tomoderator." + chat_id
              : "tosuper." + chat_id,
        },
        {
          text: "❌ To null",
          callback_data: "tonull." + chat_id,
        },
      ],
    ];
    if (admin[0].rank == null) {
      keyboard = [
        [
          {
            text: "⬆️ To moderator",
            callback_data: "tomoderator." + chat_id,
          },
        ],
      ];
    }
    keyboard.push([
      { text: "🗑 Delete admin", callback_data: "deleteadmin." + chat_id },
      {
        text: "« Назад",
        callback_data: "admins&0",
      },
    ]);
  }
  return keyboard;
}

function updateMallingLog(chatId, text, workingBot) {
  var editedText = text.length > 4096 ? text.slice(0, 4096) : text;
  workingBot.editMessageText(editedText, {
    message_id: malling[chatId].message_id,
    chat_id: chatId,
    reply_markup: {
      inline_keyboard: malling[chatId].keyboard,
    },
    parse_mode: "HTML",
  });

  if (text.length > 4096) {
    workingBot
      .sendMessage(chatId, text.slice(4097, text.length), {
        reply_markup: {
          inline_keyboard: malling[chatId].keyboard,
        },
        parse_mode: "HTML",
      })
      .then((onfullfiled) => {
        malling[chatId].message_id = onfullfiled.message_id;
        malling[chatId].text = onfullfiled.text;
      });
  }
}

async function mallingFunction(input, chatId, workingBot) {
  var chat = malling[chatId].chats[malling[chatId].iterator];
  await sendAnyMessage(
    input,
    input.text ? input.text : input.caption ? input.caption : "᠌",
    chat,
    workingBot
  ).then(
    (onfulfilled) => {
      malling[chatId].text = malling[chatId].text + "✅" + chat + " ";
      data.insert("sentmessages", {
        chat_id: chat,
        message_id: onfulfilled.message_id,
      });
    },
    (onrejected) => {
      malling[chatId].text =
        malling[chatId].text +
        "\n ❌" +
        chat +
        " - " +
        onrejected.response.statusCode;
      data.insert("blockedusers", {
        user_id: chat,
        username: data.run("select * from users where user_id = ?", [chat])[0]
          .username,
        first_name: data.run("select * from users  where user_id = ?", [
          chat,
        ])[0].first_name,
      });
      data.delete("users", { user_id: chat });
    }
  );
  updateMallingLog(chatId, malling[chatId].text, workingBot);
  malling[chatId].iterator = malling[chatId].iterator + 1;
  if (malling[chatId].iterator < malling[chatId].chats.length) {
    setTimeout(() => {
      mallingFunction(input, chatId, workingBot);
    }, malling[chatId].ms);
  } else {
    malling[chatId].iterator = 0;
  }
}

function sendAnyMessage(msg, text, chatId, mainBot) {
  if (msg.media_group_id) {
    var media_element = {
      type: "",
      media: "",
    };
    if (!(chatId in media_group)) {
      media_group[chatId] = {
        files: [],
      };
      media_element.caption = text;
      setTimeout(() => {
        return mainBot.sendMediaGroup(chatId, media_group[chatId].files);
      }, 5);
      setTimeout(() => {
        delete media_group[chatId];
      }, 6);
    }
    if (msg.document) {
      media_element.type = "document";
      media_element.media = msg.document.file_id;
      media_element.caption = text;
    }
    if (msg.photo.lenght) {
      media_element.type = "photo";
      media_element.media = msg.photo.pop().file_id;
    }
    if (msg.video) {
      media_element.type = "video";
      media_element.media = msg.video.file_id;
    }
    if (msg.audio) {
      media_element.type = "audio";
      media_element.media = msg.audio.file_id;
      media_element.caption = text;
    }
    media_element.parse_mode = "HTML";
    media_group[chatId].files.push(media_element);
  } else {
    if (msg.text) {
      return mainBot.sendMessage(chatId, text, {
        parse_mode: "HTML",
      });
    }
    if (msg.document)
      return mainBot.sendDocument(chatId, msg.document.file_id, {
        caption: text,
        parse_mode: "HTML",
      });
    if (msg.voice)
      return mainBot.sendVoice(chatId, msg.voice.file_id, {
        caption: text,
        parse_mode: "HTML",
      });
    if (msg.audio)
      return mainBot.sendAudio(chatId, msg.audio.file_id, {
        caption: text,
        parse_mode: "HTML",
      });
    if (msg.video_note)
      return mainBot.sendVideoNote(chatId, msg.video_note.file_id);
    if (msg.video)
      return mainBot.sendVideo(chatId, msg.video.file_id, {
        caption: text,
        parse_mode: "HTML",
      });
    if (msg.sticker) return mainBot.sendSticker(chatId, msg.sticker.file_id);
    if (msg.photo)
      return mainBot.sendPhoto(chatId, msg.photo.pop().file_id, {
        caption: text,
        parse_mode: "HTML",
      });
  }
}

function create_tables() {
  data.run(
    `create table if not exists admins(
        chat_id bigint primary key,
        rank text,
        username text,
        first_name text
    )`
  );
  data.run(
    `create table if not exists blockedusers(
        user_id bigint primary key,
        username text,
        first_name text
    )`
  );
  data.run(
    `create table if not exists sentmessages(
        chat_id bigint,
        message_id integer
    )`
  );
  data.run(
    `create table if not exists eduprogs(
        specialty_code text,
        name text,
        short_name text,
        query text primary key
    )`
  );
  data.run(
    `create table if not exists users(
        user_id bigint primary key,
        username text,
        first_name text,
        eduprog text,
        course integer,
        notifications bit
    )`
  );
  data.run(
    `create table if not exists phrases(
        keyword text primary key,
        content text
    )`
  );
  data.run(
    `create table if not exists statistics(
        name text primary key,
        number_of_visits integer
    )`
  );
  data.run(
    `create table if not exists menu_keyboard(
        text text,
        callback_data text primary key
    )`
  );
  data.run(
    `create table if not exists ignorelist(
        user_id bigint primary key
    )`
  );
}

function getFiles(dir, files_) {
  files_ = files_ || [];
  var files = fs.readdirSync(dir);
  for (var i in files) {
    var name = dir + "/" + files[i];
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files_);
    } else {
      files_.push(files[i].slice(0, files[i].indexOf(".")));
    }
  }
  return files_;
}

function eduprogskeyboard() {
  var eduprogs = data.run("select * from eduprogs");
  var keyboard = [[]];
  var row = 0;
  for (let index = 0; index < eduprogs.length; index++) {
    if (!getFiles("excelfiles").includes(eduprogs[index].query)) continue;
    const keyb_button = data.run("select * from eduprogs where query = ?", [
      eduprogs[index].query,
    ])[0];
    if (index % 2 == 0) {
      row++;
      keyboard.push([]);
    }

    keyboard[row].push({
      text: keyb_button.name,
      callback_data: keyb_button.query,
    });
  }
  keyboard.push([{ text: "Пропустити крок", callback_data: "skipEduprog" }]);
  return keyboard;
}

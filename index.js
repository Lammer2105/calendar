const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const bot = new TelegramBot(process.env.CALENDAR_BOT, { polling: true });
const data = require("sqlite-sync");
data.connect("database/calendar.db");
const functions = require("./db_worker");

var registration = {};

bot.onText(/\/start/, async (msg) => {
  if (
    data.run("select count (*) as cnt from users where user_id = ?", [
      msg.from.id,
    ])[0].cnt == 0 &&
    msg.chat.id == msg.from.id
  ) {
    functions.register(msg, bot);
    registration[msg.chat.id] = {
      eduprog: true,
      course: false,
    };
  } else {
    bot.sendMessage(
      msg.chat.id,
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: menu_keyboard(null, msg.chat.id) },
      }
    );
  }
});

bot.on("message", (msg) => {
  if (msg.new_chat_members || msg.left_chat_member) return;
  functions.adminPanel(msg, bot);
  if (msg.entities && msg.entities[0].type == "bot_command") return;
  sendAskAndAnswer(msg);
});

bot.on("callback_query", (query) => {
  var chatId = query.message.chat.id;
  if (functions.adminPanel(query, bot) != "end") return;
  var eduprogs = data.run("select * from eduprogs");
  for (let i = 0; i < eduprogs.length; i++) {
    eduprogs[i] = eduprogs[i].query;
  }
  if (chatId in registration) {
    if (registration[chatId].course) {
      if (query.data != "skipCourse" && !isNaN(query.data))
        data.update("users", { course: +query.data }, { user_id: chatId });
      //
      settingsMessage(query);
      registration[chatId].course = false;
    }
    if (registration[chatId].eduprog) {
      var text = "";
      if (eduprogs.includes(query.data)) {
        data.update("users", { eduprog: query.data }, { user_id: chatId });
        text =
          "Обрано освітню програму " +
          data.run("select name from eduprogs where query = ?", [query.data])[0]
            .name;
      }
      bot.editMessageText(text + "\nОберіть курс", {
        parse_mode: "HTML",
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "1", callback_data: 1 },
              { text: "2", callback_data: 2 },
              { text: "3", callback_data: 3 },
              { text: "4", callback_data: 4 },
            ],
            [
              { text: "1 магістр", callback_data: 5 },
              { text: "2 магістр", callback_data: 6 },
            ],
            [{ text: "Пропустити крок", callback_data: "skipCourse" }],
          ],
        },
      });
      registration[chatId].eduprog = false;
      registration[chatId].course = true;
    }
  }
  if (
    query.data == "notify" ||
    query.data == "notnotify" ||
    query.data == "settings"
  ) {
    if (query.data == "notify")
      data.update("users", { notifications: 1 }, { user_id: chatId });
    if (query.data == "notnotify")
      data.update("users", { notifications: 0 }, { user_id: chatId });
    settingsMessage(query);
  }
  if (query.data == "register") {
    data.delete("users", { user_id: user(query.message.chat.id) });
    functions.register(query, bot);
    registration[chatId] = {
      eduprog: true,
      course: false,
    };
  }
  if (query.data == "menu") {
    bot.editMessageText(
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        chat_id: chatId,
        parse_mode: "HTML",
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: menu_keyboard(null, chatId),
        },
      }
    );
  }
});

function menu_keyboard(callback_data, chatId) {
  let menu_keyboard = data.run("select * from menu_keyboard");
  var keyboard = [[]];
  var row = 0;
  for (let index = 0; index < menu_keyboard.length; index++) {
    const keyb_button = menu_keyboard[index];
    if (index % 2 == 0) {
      row++;
      keyboard.push([]);
    }
    if (callback_data === keyb_button.callback_data) {
      continue;
    }
    keyboard[row].push({
      text: keyb_button.text,
      callback_data: keyb_button.callback_data,
    });
  }
  if (
    data.run(
      "select count(*) as cnt from admins where rank not null and rank <> 'moderator' and chat_id = ?",
      [chatId]
    )[0].cnt > 0
  ) {
    keyboard.push(functions.adminPanelMenu[0]);
  }
  return keyboard;
}

function user(chat_id) {
  return data.run("select * from users where user_id = ?", [chat_id])[0];
}

function settingsMessage(query) {
  var notifications;
  user(query.message.chat.id).notifications
    ? (notifications = "увімкнено")
    : (notifications = "вимкнено");
  bot.editMessageText(
    "Поточні налаштування\nОсвітня програма: <b>" +
      user(query.message.chat.id).eduprog +
      "</b>\n Курс: <b>" +
      user(query.message.chat.id).course +
      "</b>\nСповіщення про початок пари <b>" +
      notifications +
      "</b>",
    {
      parse_mode: "HTML",
      message_id: query.message.message_id,
      chat_id: query.message.chat.id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Змінити📝", callback_data: "register" },
            {
              text: user(query.message.chat.id).notifications ? "🔕" : "🔔",
              callback_data: user(query.message.chat.id).notifications
                ? "notnotify"
                : "notify",
            },
          ],
          [{ text: "Головне меню «", callback_data: "menu" }],
        ],
      },
    }
  );
}

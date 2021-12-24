const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const bot = new TelegramBot(process.env.CALENDAR_BOT, { polling: true });
const data = require("sqlite-sync");
data.connect("database/calendar.db");
const functions = require("./db_worker");

bot.onText(/\/start/, async (msg) => {
  if (
    data.run("select count (*) as cnt from users where user_id = ?", [
      msg.from.id,
    ])[0].cnt == 0 &&
    msg.chat.id == msg.from.id
  ) {
    functions.register(msg, bot);
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
  if (functions.adminPanel(query, bot) != "end") return;
  var eduprogs = data.run("select * from eduprogs");
  for (let i = 0; i < eduprogs.length; i++) {
    const element = eduprogs[i];
    if (element.query == query.data || query.data == "skipEduprog") {
      data.update(
        "users",
        { eduprog: element.query },
        { user_id: query.message.chat.id }
      );
      bot.editMessageText(
        'Обрано освітню програму "' + element.name + '"\nОберіть курс',
        {
          chat_id: query.message.chat.id,
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
        }
      );
      return;
    }
  } // обрано освітню програму
  if (!isNaN(query.data) || query.data == "skipCourse") {
    data.update(
      "users",
      { course: +query.data },
      { user_id: query.message.chat.id }
    );
    bot.editMessageText(
      "Освітня програма: " +
        data.run("select * from users where user_id = ?", [
          query.message.chat.id,
        ])[0].eduprog +
        "\nКурс: " +
        query.data +
        "\nУвімкнути сповіщення про початок пари?",
      {
        message_id: query.message.message_id,
        chat_id: query.message.chat.id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Увімкнути сповіщення", callback_data: "notify" },
              { text: "Вимкнути сповіщення", callback_data: "notnotify" },
            ],
          ],
        },
      }
    );
    return;
  }

  if (query.data == "notify") {
    data.update(
      "users",
      { notifications: 1 },
      { user_id: query.message.chat.id }
    );
  }
  if (query.data == "notnotify") {
    data.update(
      "users",
      { notifications: 0 },
      { user_id: query.message.chat.id }
    );
  }
  if (
    query.data == "notify" ||
    query.data == "notnotify" ||
    query.data == "settings"
  ) {
    bot.editMessageText(
      "Поточні налаштування\nОсвітня програма: " +
        user(query.message.chat.id).eduprog +
        "\n Курс: " +
        user(query.message.chat.id).course +
        "\nСповіщення: " +
        user(query.message.chat.id).notifications,
      {
        message_id: query.message.message_id,
        chat_id: query.message.chat.id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Змінити", callback_data: "register" },
              { text: "Головне меню", callback_data: "menu" },
            ],
          ],
        },
      }
    );
  }
  if (query.data == "register") {
    data.delete("users", { user_id: user(query.message.chat.id) });
    functions.register(query, bot);
  }
  if (query.data == "menu") {
    bot.editMessageText(
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        chat_id: query.message.chat.id,
        parse_mode: "HTML",
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: menu_keyboard(null, query.message.chat.id),
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

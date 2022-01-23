const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const bot = new TelegramBot(process.env.CALENDAR_BOT, { polling: true });
const data = require("sqlite-sync");
data.connect("database/calendar.db");
const functions = require("./db_worker");
if (typeof require !== "undefined") XLSX = require("xlsx");
var registration = {};
var reminder = [];

bot.onText(/\/start/, async (msg) => {
  if (
    !data.run("select count (*) as cnt from users where user_id = ?", [
      msg.chat.id,
    ])[0].cnt
  ) {
    bot.sendMessage(
      msg.chat.id,
      data.run('select * from phrases where keyword = "greeting"')[0].content,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }
    );
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
  if (msg.from.id == msg.chat.id) sendAskAndAnswer(msg);
});

bot.on("callback_query", (query) => {
  if (functions.adminPanel(query, bot) != "end") return;
  var eduprogs = data.run("select * from eduprogs");
  let user = new User(query.message.chat.id);
  let keyboard = menu_keyboard(query.data, user.user_id);

  for (let i = 0; i < eduprogs.length; i++) {
    eduprogs[i] = eduprogs[i].query;
  }
  if (user.user_id in registration) {
    if (registration[user.user_id].course) {
      if (query.data != "skipCourse" && !isNaN(query.data))
        data.update(
          "users",
          { course: +query.data },
          { user_id: user.user_id }
        );
      settingsMessage(query);
      registration[user.user_id].course = false;
    }
    if (registration[user.user_id].eduprog) {
      var text = "";
      if (eduprogs.includes(query.data)) {
        data.update(
          "users",
          { eduprog: query.data },
          { user_id: user.user_id }
        );
        text =
          "Обрано освітню програму " +
          data.run("select name from eduprogs where query = ?", [query.data])[0]
            .name;
      }
      bot.editMessageText(text + "\nОбери курс", {
        parse_mode: "HTML",
        chat_id: user.user_id,
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
      registration[user.user_id].eduprog = false;
      registration[user.user_id].course = true;
    }
  }

  if (query.data == "notify")
    data.update("users", { notifications: 1 }, { user_id: user.user_id });
  if (query.data == "notnotify")
    data.update("users", { notifications: 0 }, { user_id: user.user_id });

  if (
    data.run("select count (*) as cnt from admins where chat_id = ?", [
      user.user_id,
    ])[0].cnt
  ) {
    if (query.data == "Gnotify") startReminder();
    if (query.data == "Gnotnotify") stopReminder();
  }
  if (query.data.indexOf("notify") != -1 || query.data == "settings") {
    settingsMessage(query);
    return;
  }

  if (query.data == "register") {
    functions.register(query, bot);
    registration[user.user_id] = {
      eduprog: true,
      course: false,
    };
  }

  if (query.data == "menu") {
    bot.editMessageText(
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        chat_id: user.user_id,
        parse_mode: "HTML",
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }

  if (
    (user.eduprog == null || user.course == null) &&
    (query.data == "today" || query.data == "week")
  ) {
    var settings_button = data.run(
      "select * from menu_keyboard where callback_data = 'settings'"
    )[0];
    console.log(settings_button);
    bot.editMessageText(
      "Для цього потрібно закінчити реєстрацію в налаштуваннях",
      {
        chat_id: user.user_id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: settings_button.text,
                callback_data: settings_button.callback_data,
              },
            ],
          ],
        },
        parse_mode: "HTML",
      }
    );
    return;
  }

  keyboard.unshift([
    {
      text: "Оновити",
      callback_data: query.data,
    },
  ]);
  if (query.data == "today") {
    if (
      functions
        .getFiles("excelfiles")
        .includes(
          data.run("select * from users where user_id = ?", [user.user_id])[0]
            .eduprog
        )
    ) {
      var text =
        data.run("select name from eduprogs where query = ?", [user.eduprog])[0]
          .name +
        " " +
        course(user) +
        "\n" +
        getWeekDay(new Date().getDay()) +
        ":\n" +
        oneDayText(new Date().getDay(), user.eduprog, course(user));

      if (isTextEqual(text, query.message.text)) return;
      bot.editMessageText(text, {
        chat_id: user.user_id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: keyboard,
        },
        disable_web_page_preview: true,
        parse_mode: "HTML",
      });
    } else {
      bot.sendMessage(user.user_id, "Розклад для Вашої ОП ще не завантажено");
    }
  }
  if (query.data == "week") {
    if (
      functions
        .getFiles("excelfiles")
        .includes(
          data.run("select * from users where user_id = ?", [user.user_id])[0]
            .eduprog
        )
    ) {
      var text =
        data.run("select name from eduprogs where query = ?", [user.eduprog])[0]
          .name +
        " " +
        course(user) +
        "\n";
      for (let i = 1; i < 6; i++) {
        text +=
          getWeekDay(i) + ":\n" + oneDayText(i, user.eduprog, course(user));
      }
      if (isTextEqual(text, query.message.text)) return;
      try {
        bot.editMessageText(text, {
          chat_id: user.user_id,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: keyboard,
          },
          disable_web_page_preview: true,
          parse_mode: "HTML",
        });
      } catch (error) {}
    } else {
      bot.sendMessage(user.user_id, "Розклад для Вашої ОП ще не завантажено");
    }
  }
});

function oneDayText(day, eduprog, course) {
  var text = "";
  if (day == 0) return text + "<b>День самостійної роботи</b>\n";

  var sheet = new Sheet(eduprog);
  var dayRow, courseColumn, numberOfColumns, numberOfRows, numberOfGroups;
  dayRow = sheet.dayRow(day);
  numberOfRows = sheet.dayRows(dayRow);
  courseColumn = sheet.courseColumn(course);
  numberOfColumns = sheet.courseColumns(courseColumn);
  numberOfGroups = sheet.groups(courseColumn, numberOfColumns);

  for (let j = dayRow; j < dayRow + numberOfRows; j++) {
    if (sheet.cell(column(courseColumn) + j).toUpperCase() == "ДЕНЬ") {
      text += "<b>День самостійної роботи</b>\n\n";
      return text;
    }
  }

  for (let j = dayRow; j < dayRow + numberOfRows; j += 4) {
    let classes = "";
    let isLessonEmpty = true;
    for (
      let i = courseColumn, k = 1;
      i < courseColumn + numberOfColumns;
      i += numberOfColumns / numberOfGroups, k++
    ) {
      if (oneLessonText(sheet, j, i, numberOfColumns / numberOfGroups)) {
        classes +=
          "<u><b>" +
          k +
          "</b> група</u>\n" +
          oneLessonText(sheet, j, i, numberOfColumns / numberOfGroups) +
          "\n";
        isLessonEmpty = false;
      }
    }
    if (!isLessonEmpty) {
      text +=
        "<b><i>" +
        sheet.cell(column(2) + (j + 1)) +
        "</i></b>\n" +
        classes +
        "\n";
    }
  }
  return text;
}

function oneLessonText(sheet, row, col, numberOfColumns) {
  // number of columns - кількість колонок для однієї групи
  let text = "";
  let week = false;
  for (let j = col; j < col + numberOfColumns; j++) {
    if (
      (sheet
        .cell(column(j) + (row + 2))
        .charAt(0)
        .toUpperCase() == sheet.cell(column(j) + (row + 2)).charAt(0) &&
        sheet.cell(column(j) + (row + 2)) != "" &&
        sheet.cell(column(j) + row) != "") ||
      (sheet.cell(column(j) + (row + 2)) != "" &&
        sheet.cell(column(j) + row) == "") ||
      (sheet.cell(column(j) + row) != "" &&
        sheet.cell(column(j) + (row + 2)) == "")
    ) {
      week = true;
    }
    for (let i = 0; i <= 3; i++) {
      if (week && sheet.cell(column(j) + (row + i))) {
        if (i == 0) text += "1 тиждень \t\t\t";
        if (i == 2) text += "2 тиждень \t\t\t";
        text += "<i>";
        text += sheet.cell(column(j) + (row + i)) + " ";
        text += "</i>";
      } else if (sheet.cell(column(j) + (row + i))) {
        text += sheet.cell(column(j) + (row + i)) + " ";
      }
      if (
        i == 1 &&
        sheet.cell(column(j) + (row + 2)) &&
        sheet.cell(column(j) + row) &&
        week
      ) {
        text += "\n";
      }
    }
    week = false;
  }
  return text;
}

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
    if (
      !(
        getWeekDay(new Date().getDay()) == "Неділя" &&
        keyb_button.callback_data == "today"
      )
    ) {
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
    )[0].cnt
  ) {
    keyboard.push(functions.adminPanelMenu[0]);
  }
  return keyboard;
}

function settingsMessage(query) {
  var notifications, Gnotifications;
  let user = new User(query.message.chat.id);

  user.notifications
    ? (notifications = "увімкнено")
    : (notifications = "вимкнено");
  var keyboard = {
    inline_keyboard: [
      [
        { text: "Змінити📝", callback_data: "register" },
        {
          text: user.notifications ? "🔕" : "🔔",
          callback_data: user.notifications ? "notnotify" : "notify",
        },
      ],
    ],
  };
  var text =
    "Поточні налаштування\nОсвітня програма: <b>" +
    user.eduprog +
    "</b>\nКурс: <b>" +
    user.course +
    "</b>\nСповіщення про початок пари <b>" +
    notifications +
    "</b>";
  if (
    data.run("select count (*) as cnt from admins where chat_id = ?", [
      user.user_id,
    ])[0].cnt
  ) {
    keyboard.inline_keyboard.push([
      {
        text: reminder.length ? "Для всіх 🔕" : " Для всіх 🔔",
        callback_data: reminder.length ? "Gnotnotify" : "Gnotify",
      },
    ]);
    reminder.length
      ? (Gnotifications = "увімкнено")
      : (Gnotifications = "вимкнено");
    text +=
      "\nСповіщення про початок пари для всіх користувачів: <b>" +
      Gnotifications +
      "</b>";
  } else {
    reminder.length
      ? (Gnotifications =
          "Нагадування про початок пари <b>буде надсилатись</b>, якщо така функція увімкнена у твоїх параметрах. 🙂")
      : (Gnotifications =
          "Адміністратор <b>вимкнув</b> нагадування про початок пари <i>для всіх користувачів</i>. Навіть якщо функція увімкнена в твоїх параметрах, ти все одно не отримаєш сповіщення 😔");
    text += "\n\n" + Gnotifications;
  }
  keyboard.inline_keyboard.push([
    { text: "Головне меню 🏠", callback_data: "menu" },
  ]);
  bot.editMessageText(text, {
    parse_mode: "HTML",
    message_id: query.message.message_id,
    chat_id: query.message.chat.id,
    reply_markup: keyboard,
  });
}

function getWeekDay(day) {
  let days = [
    "Неділя",
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "П'ятниця",
    "Субота",
  ];
  return days[day];
}

function course(user) {
  var course;
  if (user.course > 4) course = "магістратура - " + (user.course - 4) + " курс";
  else course = user.course + " курс";
  return course;
}

function isTextEqual(newText, oldText) {
  var reg = [/\n+/g, /\s+/g, /<\/?[a-zA-Z]+>/gi];
  reg.forEach((element) => {
    newText = newText.replace(element, "");
    oldText = oldText.replace(element, "");
  });
  return newText == oldText;
}

function column(columnNumber) {
  let columnName = [];
  while (columnNumber > 0) {
    // Find remainder
    let rem = columnNumber % 26;
    // If remainder is 0, then a, z must be there in output
    if (rem == 0) {
      columnName.push("Z");
      columnNumber = Math.floor(columnNumber / 26) - 1;
    } else {
      columnName.push(String.fromCharCode(rem - 1 + "A".charCodeAt(0)));
      columnNumber = Math.floor(columnNumber / 26);
    }
  }
  return columnName.reverse().join("");
}

class Sheet {
  constructor(eduprog) {
    this.eduprog = eduprog;
    this.workbook = XLSX.readFile("excelfiles/" + this.eduprog + ".xlsx");
    this.worksheet = this.workbook.Sheets[this.workbook.SheetNames[0]];

    this.cell = function (coord) {
      return this.worksheet[coord] ? this.worksheet[coord].v : "";
    };
    this.courseColumn = function (course, i = 1) {
      for (i; true; i++) {
        if (this.cell(column(i) + "6") == course) {
          break;
        }
      }
      return i;
    };
    this.dayRow = function (day, i = 1) {
      for (i; true; i++) {
        if (this.cell("A" + i) == getWeekDay(day)) {
          break;
        }
      }
      return i;
    };
    this.courseColumns = function (courseColumn) {
      let i = courseColumn + 1;
      for (i; true; i++) {
        if (this.cell(column(i) + "6") != "") {
          break;
        }
      }
      return i - courseColumn;
    };
    this.dayRows = function (dayRow) {
      let i = dayRow + 1;
      for (i; true; i++) {
        if (this.cell("A" + i) != "") {
          break;
        }
      }
      return i - dayRow;
    };
    this.groups = function (courseColumn, numberOfColumns) {
      var numberOfGroups = 0;
      if (this.cell(column(courseColumn) + "8") == "") return 1;
      let i = courseColumn;
      for (i; i < courseColumn + numberOfColumns; i++) {
        if (this.cell(column(i) + "8") != "") numberOfGroups += 1;
      }
      return numberOfGroups;
    };
    this.timeRow = function (dayRow, time) {
      let i = dayRow;
      for (i; true; i++) {
        const cell = this.cell("B" + i);
        if (cell != "") {
          if (
            (cell.indexOf("-") != -1 &&
              cell.slice(0, cell.indexOf("-")) == String(time)) ||
            (cell.indexOf("*") != -1 &&
              cell.slice(0, cell.indexOf("*")) == String(time))
          ) {
            break;
          }
        }
      }
      return i - 1;
    };
  }
}
class User {
  constructor(chatId) {
    this.user_id = chatId;
    var user = data.run("select * from users where user_id = ?", [
      this.user_id,
    ])[0];
    this.notifications = user.notifications;
    this.eduprog = user.eduprog;
    this.course = user.course;
    this.username = user.username ? user.username : "";
    this.first_name = user.first_name;
  }
}

function sendAskAndAnswer(msg) {
  let admins = data.run("select * from admins where rank not null");
  let current_admin = data.run(
    "select * from admins where rank not null and chat_id = ?",
    [msg.chat.id]
  );
  if (
    current_admin.length &&
    msg.reply_to_message &&
    (msg.reply_to_message.entities || msg.reply_to_message.caption_entities)
  ) {
    functions.malling(
      msg,
      msg.text ? msg.text : msg.caption ? msg.caption : "",
      msg.reply_to_message.entities
        ? msg.reply_to_message.entities[0].user.id
        : msg.reply_to_message.caption_entities
        ? msg.reply_to_message.caption_entities[0].user.id
        : NaN,
      bot
    );
    for (let i = 0; i < admins.length; i++) {
      const another_admin = admins[i];
      if (current_admin[0].chat_id == another_admin.chat_id) continue;
      functions.malling(
        msg,
        (msg.chat.first_name ? msg.chat.first_name : msg.chat.title) +
          " відповів " +
          (msg.reply_to_message.text
            ? msg.reply_to_message.entities[0].user.first_name
            : msg.reply_to_message.caption
            ? msg.reply_to_message.caption_entities[0].user.first_name
            : null) +
          ":\n" +
          (msg.text ? msg.text : msg.caption ? msg.caption : ""),
        another_admin.chat_id,
        bot
      );
    }
    return;
  }
  if (msg.chat.id == msg.from.id && !current_admin.length) {
    admins.forEach((admin) => {
      functions.malling(
        msg,
        '<a href="tg://user?id=' +
          msg.from.id +
          '">' +
          msg.from.first_name +
          "</a>" +
          "\n" +
          (msg.text ? msg.text : msg.caption ? msg.caption : ""),
        admin.chat_id,
        bot
      );
    });
  }
}

function stopReminder() {
  reminder.forEach((element) => {
    clearInterval(element);
  });
  reminder = [];
}
function startReminder() {
  if (!reminder.length)
    reminder.push(
      setInterval(function sendNotifications() {
        const times = [
          "7.55",
          "9.35",
          "11.15",
          "12.45",
          "14.25",
          "15.55",
          "17.25",
        ];
        const exact_times = [
          "8.00",
          "9.40",
          "11.20",
          "12.50",
          "14.30",
          "16.00",
          "17.30",
        ];
        if (new Date().getDay() > 0) {
          let time = new Date().getHours() + "." + new Date().getMinutes();
          if (times.includes(time)) {
            data
              .run(
                "select * from users where notifications = 1 and eduprog not null and course not null"
              )
              .forEach((user) => {
                var sheet = new Sheet(user.eduprog);
                var courseColumn, courseColumns, numberOfGroups;
                courseColumn = sheet.courseColumn(course(user));
                courseColumns = sheet.courseColumns(courseColumn);
                numberOfGroups = sheet.groups(courseColumn, courseColumns);
                timeRow = sheet.timeRow(
                  sheet.dayRow(1),
                  exact_times[times.indexOf(time)]
                );
                var text = "";
                for (
                  let i = courseColumn, k = 1;
                  i < courseColumn + courseColumns;
                  i += courseColumns / numberOfGroups, k++
                ) {
                  const lesson = oneLessonText(
                    sheet,
                    timeRow,
                    i,
                    courseColumns / numberOfGroups
                  );
                  if (lesson)
                    text += "\n<u><b>" + k + "</b> група</u>\n" + lesson;
                }
                if (text)
                  functions.malling(
                    { text: true },
                    "Через 5 хвилин починається пара<b>\n" +
                      sheet.cell(column(2) + (timeRow + 1)) +
                      "</b>" +
                      text,
                    user.user_id,
                    bot
                  );
              });
          }
        }
      }, 60000)
    );
}

startReminder();

// ██████╗░░█████╗░░█████╗░████████╗░█████╗░██████╗░  ██████╗░██████╗░██╗███╗░░░███╗███████╗
// ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗  ██╔══██╗██╔══██╗██║████╗░████║██╔════╝
// ██║░░██║██║░░██║██║░░╚═╝░░░██║░░░██║░░██║██████╔╝  ██████╔╝██████╔╝██║██╔████╔██║█████╗░░
// ██║░░██║██║░░██║██║░░██╗░░░██║░░░██║░░██║██╔══██╗  ██╔═══╝░██╔══██╗██║██║╚██╔╝██║██╔══╝░░
// ██████╔╝╚█████╔╝╚█████╔╝░░░██║░░░╚█████╔╝██║░░██║  ██║░░░░░██║░░██║██║██║░╚═╝░██║███████╗
// ╚═════╝░░╚════╝░░╚════╝░░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝  ╚═╝░░░░░╚═╝░░╚═╝╚═╝╚═╝░░░░░╚═╝╚══════╝
